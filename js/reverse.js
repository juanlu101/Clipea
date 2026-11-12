// Invertir un clip (reproducir al revés): genera un archivo nuevo con el tramo usado del clip invertido
import { Muxer, ArrayBufferTarget } from '../lib/mp4-muxer.mjs';
import { store, getMedia, commit, select, fmtTime } from './state.js';
import { getMeta, FrameReader } from './decoder.js';
import { cache, decodeAudio, importFile } from './media.js';
import { pickVideoConfig, pickAudioConfig, seekExact } from './exporter.js';
import { encodeWAV } from './sfx.js';
import { h, modal, toast, confirmDialog } from './ui.js';

const even = n => Math.max(2, Math.round(n / 2) * 2);

async function reversedAudioBuffer(mediaId, a, b) {
  const buf = await decodeAudio(mediaId);
  const sr = buf.sampleRate, s0 = Math.floor(a * sr), s1 = Math.min(buf.length, Math.ceil(b * sr)), n = Math.max(1, s1 - s0);
  const out = new AudioBuffer({ length: n, numberOfChannels: Math.min(2, buf.numberOfChannels), sampleRate: sr });
  for (let ch = 0; ch < out.numberOfChannels; ch++) { const src = buf.getChannelData(ch).subarray(s0, s1), dst = out.getChannelData(ch); for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i] || 0; }
  return out;
}

export async function reverseClip(c) {
  const m = getMedia(c.mediaId);
  if (!m || (c.kind !== 'video' && c.kind !== 'audio')) return;
  const a = c.in, b = Math.min(m.duration, c.in + c.duration * c.speed);
  if (b - a > 90 && !(await confirmDialog('Invertir clip', `El tramo dura ${fmtTime(b - a)}. Invertir clips largos tarda y usa mucha memoria. ¿Continuar?`, 'Invertir'))) return;
  const base = (m.name || 'clip').replace(/\.[^.]+$/, '');
  let cancelled = false;
  const bar = h('div', { class: 'progress' }, h('div', { class: 'fill' }));
  const status = h('div', { class: 'exp-status' }, 'Preparando…');
  const md = modal({ title: 'Invirtiendo clip…', width: 460, closable: false, body: h('div', { class: 'export-run' }, bar, status), buttons: [{ label: 'Cancelar', danger: true, onClick: () => { cancelled = true; return false; } }] });
  const setP = (f, t) => { bar.firstChild.style.width = (f * 100).toFixed(1) + '%'; if (t) status.textContent = t; };
  try {
    let file;
    if (c.kind === 'audio') {
      const rb = await reversedAudioBuffer(c.mediaId, a, b);
      file = new File([encodeWAV(rb)], `${base} (al revés).wav`, { type: 'audio/wav' });
    } else {
      const meta = await getMeta(c.mediaId);
      let W = m.width, H = m.height; const k = Math.min(1, 1920 / Math.max(W, H)); W = even(W * k); H = even(H * k);
      let fps = 30;
      if (meta) { const n = meta.byPts.filter(s => s.pts >= a && s.pts < b).length; const est = n / Math.max(0.1, b - a); fps = [24, 25, 30, 50, 60].reduce((p, q) => Math.abs(q - est) < Math.abs(p - est) ? q : p, 30); }
      const vc = await pickVideoConfig(W, H, fps, Math.round(W * H * fps * 0.12));
      if (!vc) throw new Error('Este ordenador no puede codificar el vídeo');
      const hasAudio = m.hasAudio !== false;
      const ac = hasAudio ? await pickAudioConfig() : null;
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({ target, fastStart: 'in-memory', firstTimestampBehavior: 'offset', video: { codec: vc.mux, width: W, height: H, frameRate: fps }, audio: ac ? { codec: ac.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined });
      let err = null;
      const venc = new VideoEncoder({ output: (ch, mt) => muxer.addVideoChunk(ch, mt), error: e => { err = e; } });
      venc.configure(vc.cfg);
      const cv = new OffscreenCanvas(W, H), cx = cv.getContext('2d');
      let n = 0;
      const total = Math.max(1, Math.round((b - a) * fps));
      const emitFrame = async src => {
        if (cancelled) throw new Error('cancel'); if (err) throw err;
        const sw = src.displayWidth || src.videoWidth || src.width, sh = src.displayHeight || src.videoHeight || src.height;
        cx.save(); cx.clearRect(0, 0, W, H);
        if (meta?.rot) { cx.translate(W / 2, H / 2); cx.rotate(meta.rot * Math.PI / 180); const rw = meta.rot % 180 ? H : W, rh = meta.rot % 180 ? W : H; cx.drawImage(src, -rw / 2, -rh / 2, rw, rh); }
        else cx.drawImage(src, 0, 0, sw, sh, 0, 0, W, H);
        cx.restore();
        const vf = new VideoFrame(cv, { timestamp: Math.round(n * 1e6 / fps), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: n % (fps * 2) === 0 }); vf.close(); n++;
        while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2));
        if (n % 5 === 0) setP(n / total, `Fotograma ${n} de ${total}`);
      };
      if (meta) {
        // Por grupos de imágenes (GOP), del final al principio
        const reader = new FrameReader(meta);
        const frames = meta.byPts.filter(s => s.pts >= a - 1e-4 && s.pts < b);
        const gops = new Map();
        for (const s of frames) { const kk = reader.keyBefore(s.i); if (!gops.has(kk)) gops.set(kk, []); gops.get(kk).push(s); }
        const keys = [...gops.keys()].sort((x, y) => meta.list[y].pts - meta.list[x].pts);
        try {
          for (const kk of keys) {
            const list = gops.get(kk).sort((x, y) => x.pts - y.pts);
            reader.reset(kk);
            const bms = [];
            const scale = list.length > 90 ? Math.min(1, 1280 / Math.max(W, H)) : 1;
            for (const s of list) {
              const f = await reader.frameAt(s.pts);
              bms.push(await createImageBitmap(f, scale < 1 ? { resizeWidth: Math.round(f.displayWidth * scale), resizeHeight: Math.round(f.displayHeight * scale) } : {}));
              if (cancelled) break;
            }
            for (let i = bms.length - 1; i >= 0; i--) { await emitFrame(bms[i]); bms[i].close(); }
          }
        } finally { reader.close(); }
      } else {
        const v = document.createElement('video'); v.muted = true; v.src = cache.urls.get(c.mediaId); v.preload = 'auto';
        for (let i = total - 1; i >= 0; i--) { await seekExact(v, Math.min(b - 0.01, a + i / fps)); await emitFrame(v); }
        v.removeAttribute('src'); v.load();
      }
      await venc.flush(); venc.close();
      if (ac) {
        setP(1, 'Invirtiendo el sonido…');
        try {
          const rb = await reversedAudioBuffer(c.mediaId, a, b);
          const oac = new OfflineAudioContext(2, Math.ceil(rb.duration * 48000), 48000);
          const s = oac.createBufferSource(); s.buffer = rb; s.connect(oac.destination); s.start();
          const ab = await oac.startRendering();
          const aenc = new AudioEncoder({ output: (ch, mt) => muxer.addAudioChunk(ch, mt), error: e => { err = e; } });
          aenc.configure(ac.cfg);
          const L = ab.getChannelData(0), R = ab.getChannelData(1);
          for (let i = 0; i < ab.length; i += 4800) {
            const nn = Math.min(4800, ab.length - i), d = new Float32Array(nn * 2); d.set(L.subarray(i, i + nn), 0); d.set(R.subarray(i, i + nn), nn);
            const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: nn, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data: d }); aenc.encode(ad); ad.close();
          }
          await aenc.flush(); aenc.close();
        } catch (e) { console.warn('audio inverso', e); }
      }
      muxer.finalize();
      file = new File([target.buffer], `${base} (al revés).mp4`, { type: 'video/mp4' });
    }
    setP(1, 'Guardando…');
    const nm = await importFile(file);
    c.mediaId = nm.id; c.in = 0; c.name = nm.name; c.reversed = !c.reversed;
    c.duration = Math.min(c.duration, nm.duration / c.speed);
    md.close(); select(c.id); commit();
    toast('Clip invertido', 'ok');
  } catch (e) {
    md.close();
    if (e.message !== 'cancel') { console.error(e); toast('No se pudo invertir: ' + e.message, 'error', 7000); } else toast('Cancelado');
  }
}
