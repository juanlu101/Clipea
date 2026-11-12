// Exportación a MP4 con WebCodecs (aceleración por hardware en Chrome/Edge)
import { Muxer, ArrayBufferTarget } from '../lib/mp4-muxer.mjs';
import { store, projectDuration, visualItemsAt, srcTime, getMedia, getTrack, getClip, clipEnd, fmtTime, audioGainAt } from './state.js';
import { getMeta, FrameReader } from './decoder.js';
import { segment } from './segment.js';
import { renderFrame } from './renderer.js';
import { buildChain, duckLevelAt } from './audiofx.js';
import { MediaPool, pause } from './player.js';
import { cache, decodeAudio } from './media.js';
import { h, ih, modal, toast, download, selectCtl, segCtl } from './ui.js';
import { encodeWAV } from './sfx.js';
import { exportSRT } from './subtitles.js';
import { ensureFonts } from './fonts.js';

const even = n => Math.max(2, Math.round(n / 2) * 2);
function sizeFor(short) {
  const { width: W, height: H } = store.project.settings;
  const s = short / Math.min(W, H);
  return [even(W * s), even(H * s)];
}
const safeName = s => (s || 'video').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'video';

export function openExport() {
  if (store.playing) pause();
  const dur = projectDuration();
  if (dur <= 0) { toast('El proyecto está vacío: añade algún clip antes de exportar'); return; }
  const supported = 'VideoEncoder' in window;
  const opt = { res: 1080, quality: 'med' };
  const body = h('div', { class: 'export-body' },
    !supported ? h('div', { class: 'warn' }, 'Tu navegador no permite exportar vídeo. Abre el editor con Google Chrome o Microsoft Edge actualizados.') : null,
    h('div', { class: 'export-summary' }, ih('film', 18), h('div', {}, h('b', {}, store.project.name), h('div', { class: 'muted' }, `${fmtTime(dur, true)} · ${store.project.settings.aspect} · ${store.project.settings.fps} fps`))),
    segCtl({ label: 'Resolución', value: 1080, options: [[480, '480p'], [720, '720p'], [1080, '1080p (Full HD)']], onChange: v => { opt.res = +v; info(); } }),
    segCtl({ label: 'Calidad', value: 'med', options: [['low', 'Ligero'], ['med', 'Normal'], ['high', 'Máxima']], onChange: v => { opt.quality = v; info(); } }),
    h('p', { class: 'hint', id: 'expInfo' }),
    h('div', { class: 'export-more' },
      h('span', { class: 'muted' }, 'Otras opciones:'),
      h('button', { class: 'btn sm', onclick: () => { m.close(); exportAudio(); } }, ih('music', 14), 'Solo audio (WAV)'),
      h('button', { class: 'btn sm', onclick: () => { m.close(); exportFrame(); } }, ih('image', 14), 'Fotograma actual (PNG)'),
      h('button', { class: 'btn sm', onclick: () => { const s = exportSRT(); if (!s) return toast('No hay subtítulos'); download(new Blob([s], { type: 'text/plain' }), safeName(store.project.name) + '.srt'); } }, ih('captions', 14), 'Subtítulos (SRT)')),
  );
  const m = modal({ title: 'Exportar vídeo', body, width: 520, buttons: [{ label: 'Cancelar' }, { label: 'Exportar MP4', primary: true, onClick: () => { if (supported) runExport(opt); return true; } }] });
  const info = () => {
    const [w, hh] = sizeFor(opt.res);
    const mbps = bitrate(w, hh, store.project.settings.fps, opt.quality) / 1e6;
    body.querySelector('#expInfo').textContent = `${w}×${hh} px · tamaño aproximado: ${Math.max(1, Math.round(mbps * dur / 8 + dur * 0.024))} MB`;
  };
  info();
}

function bitrate(w, h, fps, q) { const bpp = { low: 0.05, med: 0.09, high: 0.16 }[q]; return Math.round(w * h * fps * bpp); }

export async function pickVideoConfig(w, h, fps, br) {
  const cands = [];
  for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.640028', 'avc1.4D0028', 'avc1.42E028', 'avc1.42001f'])
    cands.push({ mux: 'avc', cfg: { codec, width: w, height: h, bitrate: br, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' } });
  cands.push({ mux: 'vp9', cfg: { codec: 'vp09.00.40.08', width: w, height: h, bitrate: br, framerate: fps } });
  for (const hw of ['prefer-hardware', 'no-preference']) for (const c of cands) {
    const cfg = { ...c.cfg, hardwareAcceleration: hw };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { mux: c.mux, cfg }; } catch {}
  }
  return null;
}
export async function pickAudioConfig() {
  if (!('AudioEncoder' in window)) return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
    try { const r = await AudioEncoder.isConfigSupported(cfg); if (r.supported) return { mux, cfg }; } catch {}
  }
  return null;
}

// Mezcla todo el audio del proyecto
export async function renderAudio(dur, onStatus) {
  const p = store.project, sr = 48000;
  const clips = p.clips.filter(c => (c.kind === 'video' || c.kind === 'audio') && !c.muted && !c.audioDetached && (c.volume > 0 || c.kf?.volume?.length) && !getTrack(c.trackId)?.muted && getMedia(c.mediaId)?.hasAudio !== false);
  if (!clips.length) return null;
  const oac = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * sr)), sr);
  const comp = oac.createDynamicsCompressor();
  comp.threshold.value = -2; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.002; comp.release.value = 0.1;
  comp.connect(oac.destination);
  const bufs = new Map();
  let any = false;
  for (const c of clips) {
    if (!bufs.has(c.mediaId)) {
      onStatus?.('Preparando el audio…');
      try { bufs.set(c.mediaId, await decodeAudio(c.mediaId)); } catch { bufs.set(c.mediaId, null); }
    }
    const buf = bufs.get(c.mediaId); if (!buf) continue;
    const src = oac.createBufferSource(); src.buffer = buf; src.playbackRate.value = c.speed;
    const g = oac.createGain(), end = c.start + c.duration;
    // automatización muestreada: volumen (con fotogramas clave), fundidos y atenuación automática
    const step = 0.02;
    let dk = duckLevelAt(c, c.start);
    g.gain.setValueAtTime(audioGainAt(c, c.start) * dk, c.start);
    for (let t = c.start + step; t < end; t += step) {
      const target = duckLevelAt(c, t); dk += (target - dk) * (target < dk ? 0.35 : 0.07); // bajada rápida, subida suave
      g.gain.linearRampToValueAtTime(audioGainAt(c, Math.min(t, end - 1e-4)) * dk, t);
    }
    g.gain.linearRampToValueAtTime(c.fadeOut > 0 ? 0 : audioGainAt(c, end - 1e-4) * dk, end);
    const chain = buildChain(oac, c.audioFx);
    src.connect(chain.input); chain.output.connect(g).connect(comp);
    if (c.in < buf.duration) { src.start(c.start, c.in, Math.min(c.duration * c.speed, buf.duration - c.in)); any = true; }
  }
  if (!any) return null;
  onStatus?.('Mezclando el audio…');
  return await oac.startRendering();
}

function waitEvent(el, ev, ms = 4000) {
  return new Promise(res => { const f = () => { clearTimeout(to); el.removeEventListener(ev, f); res(); }; const to = setTimeout(f, ms); el.addEventListener(ev, f); });
}
export async function seekExact(el, t) {
  if (el.readyState < 1) await waitEvent(el, 'loadedmetadata', 8000);
  if (Math.abs(el.currentTime - t) < 0.0005 && el.readyState >= 2) return;
  const p = waitEvent(el, 'seeked', 5000);
  el.currentTime = t;
  await p;
  if (el.readyState < 2) await waitEvent(el, 'canplay', 2000);
}

// Fuente de fotogramas: WebCodecs (rápido) o <video> con búsqueda (compatible)
class FrameSource {
  constructor() { this.pool = new MediaPool({ withAudio: false }); this.readers = new Map(); this.cur = new Map(); this.noDec = new Set(); }
  async prepareClip(c, t) {
    const st = srcTime(c, t);
    if (!this.noDec.has(c.id)) {
      const meta = await getMeta(c.mediaId);
      if (meta) {
        let r = this.readers.get(c.id);
        if (!r) { r = new FrameReader(meta); this.readers.set(c.id, r); }
        try { const f = await r.frameAt(st); this.cur.set(c.id, meta.rot ? this.rotate(c.id, f, meta.rot) : f); return; }
        catch (e) { console.warn('WebCodecs → <video>', e); r.close(); this.readers.delete(c.id); }
      }
      this.noDec.add(c.id);
    }
    this.cur.delete(c.id);
    const e = this.pool.get(c); if (e) await seekExact(e.el, st);
  }
  rotate(id, f, rot) {
    this.rc ||= new Map();
    let cv = this.rc.get(id);
    const w = f.displayWidth, h = f.displayHeight, sw = rot % 180 ? h : w, sh = rot % 180 ? w : h;
    if (!cv) { cv = document.createElement('canvas'); this.rc.set(id, cv); }
    if (cv.width !== sw || cv.height !== sh) { cv.width = sw; cv.height = sh; }
    const x = cv.getContext('2d');
    x.setTransform(1, 0, 0, 1, sw / 2, sh / 2); x.rotate(rot * Math.PI / 180); x.drawImage(f, -w / 2, -h / 2); x.setTransform(1, 0, 0, 1, 0, 0);
    return cv;
  }
  async prepare(t) {
    const items = visualItemsAt(t).filter(it => it.clip.kind === 'video');
    const active = new Set(items.map(it => it.clip.id));
    await Promise.all(items.map(it => this.prepareClip(it.clip, t)));
    for (const it of visualItemsAt(t)) {
      const c = it.clip; if (!c.bgRemove || (c.kind !== 'video' && c.kind !== 'image')) continue;
      const src = this.getDrawable(c); if (src) await segment(c.id, src, c.mediaId + ':' + t).catch(e => console.warn(e));
    }
    for (const [id, r] of this.readers) if (!active.has(id)) {
      const c = getClip(id);
      if (!c || clipEnd(c) < t - 0.5 || c.start > t + 3) { r.close(); this.readers.delete(id); this.cur.delete(id); }
    }
    this.pool.gc(active);
  }
  getDrawable = c => {
    if (c.kind === 'image') return cache.images.get(c.mediaId) || null;
    const f = this.cur.get(c.id); if (f) return f;
    const e = this.pool.get(c); return e && e.el.readyState >= 2 ? e.el : null;
  };
  close() { for (const r of this.readers.values()) r.close(); this.readers.clear(); this.cur.clear(); this.pool.clear(); }
}

async function allFonts() {
  const p = store.project;
  const names = p.clips.filter(c => c.kind === 'text').map(c => c.font);
  for (const t of p.tracks) if (t.style?.font) names.push(t.style.font);
  await ensureFonts(names);
}

let exporting = false;
async function runExport(opt) {
  if (exporting) return; exporting = true;
  const p = store.project, fps = p.settings.fps, dur = projectDuration();
  const [w, hgt] = sizeFor(opt.res);
  const br = bitrate(w, hgt, fps, opt.quality);
  let cancelled = false;
  const bar = h('div', { class: 'progress' }, h('div', { class: 'fill' }));
  const status = h('div', { class: 'exp-status' }, 'Preparando…');
  const prevCanvas = h('canvas', { class: 'exp-canvas', width: w, height: hgt });
  const body = h('div', { class: 'export-run' }, prevCanvas, bar, status, h('p', { class: 'hint' }, 'No cierres esta pestaña mientras se exporta. Puedes seguir usando otras ventanas.'));
  const m = modal({ title: 'Exportando…', body, width: 560, closable: false, buttons: [{ label: 'Cancelar', danger: true, onClick: () => { cancelled = true; return false; } }] });
  const unload = e => { e.preventDefault(); e.returnValue = ''; };
  addEventListener('beforeunload', unload);
  const src = new FrameSource();
  const setP = (f, txt) => { bar.firstChild.style.width = (f * 100).toFixed(1) + '%'; if (txt) status.textContent = txt; };
  try {
    await allFonts();
    const vc = await pickVideoConfig(w, hgt, fps, br);
    if (!vc) throw new Error('Este ordenador no puede codificar vídeo en este tamaño. Prueba con 720p.');
    const audioBuf = await renderAudio(dur, s => setP(0, s));
    const ac = audioBuf ? await pickAudioConfig() : null;
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target, fastStart: 'in-memory', firstTimestampBehavior: 'offset',
      video: { codec: vc.mux, width: w, height: hgt, frameRate: fps },
      audio: ac ? { codec: ac.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined,
    });
    let encErr = null;
    const venc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { encErr = e; } });
    venc.configure(vc.cfg);

    // Audio primero (rápido)
    if (ac && audioBuf) {
      const aenc = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: e => { encErr = e; } });
      aenc.configure(ac.cfg);
      const L = audioBuf.getChannelData(0), R = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : L;
      const N = 4800;
      for (let i = 0; i < audioBuf.length; i += N) {
        const n = Math.min(N, audioBuf.length - i);
        const data = new Float32Array(n * 2); data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush(); aenc.close();
    }

    const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
    const ctx = cv.getContext('2d', { alpha: false, willReadFrequently: false });
    const pctx = prevCanvas.getContext('2d');
    const getDrawable = src.getDrawable;
    const total = Math.max(1, Math.round(dur * fps));
    const t0 = performance.now();
    for (let i = 0; i < total; i++) {
      if (cancelled) throw new Error('cancel');
      if (encErr) throw encErr;
      const t = i / fps;
      await src.prepare(t);
      renderFrame(ctx, w, hgt, t, p, getDrawable);
      const frame = new VideoFrame(cv, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2));
      if (i % 5 === 0) {
        const el = (performance.now() - t0) / 1000, eta = el / (i + 1) * (total - i - 1);
        pctx.drawImage(cv, 0, 0);
        setP((i + 1) / total, `Fotograma ${i + 1} de ${total} · quedan ~${eta < 60 ? Math.ceil(eta) + ' s' : Math.ceil(eta / 60) + ' min'}`);
      }
    }
    setP(1, 'Terminando…');
    await venc.flush(); venc.close();
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    const name = safeName(p.name) + '.mp4';
    removeEventListener('beforeunload', unload);
    m.close();
    const secs = Math.round((performance.now() - t0) / 1000);
    const url = URL.createObjectURL(blob);
    download(blob, name);
    modal({ title: '¡Vídeo listo!', width: 560, body: h('div', { class: 'export-done' },
      h('video', { src: url, controls: true, class: 'done-video' }),
      h('p', {}, `Se ha descargado «${name}» (${(blob.size / 1048576).toFixed(1)} MB) en ${secs} s. Lo encontrarás en la carpeta Descargas.`)),
      buttons: [{ label: 'Descargar otra vez', onClick: () => { download(blob, name); return false; } }, { label: 'Cerrar', primary: true }] });
  } catch (e) {
    removeEventListener('beforeunload', unload);
    m.close();
    if (e.message !== 'cancel') { console.error(e); toast('Error al exportar: ' + (e.message || e), 'error', 8000); }
    else toast('Exportación cancelada');
  } finally {
    src.close(); exporting = false;
  }
}

async function exportAudio() {
  const dur = projectDuration();
  toast('Generando audio…');
  const buf = await renderAudio(dur);
  if (!buf) { toast('El proyecto no tiene sonido'); return; }
  download(encodeWAV(buf), safeName(store.project.name) + '.wav');
}

async function exportFrame() {
  const { width: w, height: hgt } = store.project.settings;
  const src = new FrameSource();
  await allFonts();
  await src.prepare(store.time);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  renderFrame(cv.getContext('2d'), w, hgt, store.time, store.project, src.getDrawable);
  src.close();
  cv.toBlob(b => download(b, `${safeName(store.project.name)}_${fmtTime(store.time).replace(':', 'm')}s.png`), 'image/png');
}
