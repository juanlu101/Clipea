// Reproducción en tiempo real: elementos <video>/<audio> sincronizados + vista previa en canvas
import { store, on, emit, visualItemsAt, audioClipsAt, audioGainAt, srcTime, getClip, clipEnd, projectDuration, setTime, getMedia } from './state.js';
import { cache, audioCtx } from './media.js';
import { renderFrame } from './renderer.js';
import { buildChain, totalGainAt } from './audiofx.js';
import { segmentPreview } from './segment.js';

const hidden = () => document.getElementById('hiddenMedia');

// Conjunto de elementos multimedia, uno por clip
export class MediaPool {
  constructor({ withAudio }) { this.withAudio = withAudio; this.map = new Map(); }
  get(c) {
    let e = this.map.get(c.id);
    const url = cache.urls.get(c.mediaId);
    if (e && e.mediaId === c.mediaId) { e.last = performance.now(); return e; }
    if (e) this.drop(c.id);
    if (!url) return null;
    const isVideo = c.kind === 'video';
    const el = document.createElement(isVideo ? 'video' : 'audio');
    el.preload = 'auto'; el.playsInline = true; el.src = url; el.preservesPitch = false;
    el.muted = !this.withAudio;
    hidden().appendChild(el);
    e = { el, mediaId: c.mediaId, gain: null, last: performance.now() };
    if (this.withAudio) {
      try {
        const ctx = audioCtx();
        e.src = ctx.createMediaElementSource(el);
        e.gain = ctx.createGain(); e.gain.gain.value = 0;
        e.gain.connect(master());
        this.setFx(e, c.audioFx);
      } catch (err) { console.warn(err); }
    }
    el.addEventListener('seeked', () => emit('needRender'));
    el.addEventListener('loadeddata', () => emit('needRender'));
    this.map.set(c.id, e);
    return e;
  }
  setFx(e, type = 'none') {
    type = type || 'none';
    if (!e.src || e.fxType === type) return;
    try { e.src.disconnect(); } catch {}
    e.chain?.stop();
    e.chain = buildChain(audioCtx(), type); e.fxType = type;
    e.src.connect(e.chain.input); e.chain.output.connect(e.gain);
  }
  drop(id) {
    const e = this.map.get(id); if (!e) return;
    e.chain?.stop();
    e.el.pause(); e.el.removeAttribute('src'); e.el.load(); e.el.remove();
    try { e.gain?.disconnect(); } catch {}
    this.map.delete(id);
  }
  gc(keepIds) {
    const now = performance.now();
    for (const [id, e] of this.map) if (!keepIds.has(id) && (now - e.last > 8000 || !getClip(id))) this.drop(id);
  }
  clear() { for (const id of [...this.map.keys()]) this.drop(id); }
}

let masterGain = null;
function master() {
  if (masterGain) return masterGain;
  const ctx = audioCtx();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  return masterGain;
}

export const pool = new MediaPool({ withAudio: true });
let canvas, ctx, rafId = 0, playStartWall = 0, playStartT = 0, renderQueued = false;
export const previewState = { quality: 0.75 };

export function initPlayer(cv) {
  canvas = cv; ctx = canvas.getContext('2d', { alpha: false });
  on('needRender', requestRender);
  on('time', () => { if (!store.playing) { syncPaused(); requestRender(); } });
  on('project', () => { if (!store.playing) syncPaused(); requestRender(); });
  on('assets', requestRender);
}

export function getDrawable(c) {
  if (c.kind === 'image') return cache.images.get(c.mediaId) || null;
  const e = pool.get(c);
  if (!e) return null;
  return e.el.readyState >= 2 ? e.el : (e.lastGood ? null : null);
}

export function requestRender() {
  if (renderQueued) return; renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; draw(); });
}

export function resizeCanvas() {
  if (!canvas || !store.project) return;
  const holder = canvas.parentElement, box = holder.parentElement;
  const { width: W, height: H } = store.project.settings;
  const r = box.getBoundingClientRect();
  const css = Math.max(0.01, Math.min((r.width - 16) / W, (r.height - 16) / H));
  holder.style.width = Math.round(W * css) + 'px'; holder.style.height = Math.round(H * css) + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const scale = Math.min(css * dpr, 1) * previewState.quality;
  const cw = Math.max(2, Math.round(W * scale)), ch = Math.max(2, Math.round(H * scale));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  requestRender();
}

function draw() {
  if (!store.project || !ctx) return;
  for (const it of visualItemsAt(store.time)) {
    const c = it.clip; if (!c.bgRemove) continue;
    const src = getDrawable(c); if (!src) continue;
    segmentPreview(c.id, src, c.mediaId + ':' + (c.kind === 'video' ? srcTime(c, store.time).toFixed(2) : ''), () => { if (!store.playing) requestRender(); });
  }
  renderFrame(ctx, canvas.width, canvas.height, store.time, store.project, getDrawable);
  emit('frame');
}

// Sincroniza elementos cuando está en pausa (buscar fotograma exacto)
function syncPaused() {
  if (!store.project) return;
  const t = store.time;
  const keep = new Set();
  for (const it of visualItemsAt(t)) {
    const c = it.clip; if (c.kind !== 'video') continue;
    keep.add(c.id);
    const e = pool.get(c); if (!e) continue;
    if (!e.el.paused) e.el.pause();
    const st = srcTime(c, t);
    if (Math.abs(e.el.currentTime - st) > 0.01) e.el.currentTime = st;
  }
  for (const [id, e] of pool.map) if (!keep.has(id) && !e.el.paused) e.el.pause();
  for (const e of pool.map.values()) if (e.gain) e.gain.gain.value = 0;
  pool.gc(keep);
}

export async function play() {
  if (store.playing || !store.project) return;
  const ac = audioCtx(); if (ac.state !== 'running') await ac.resume();
  const dur = projectDuration();
  if (dur <= 0) return;
  if (store.time >= dur - 0.05) store.time = 0;
  store.playing = true; emit('play');
  playStartWall = performance.now(); playStartT = store.time;
  rafId = requestAnimationFrame(tick);
}

export function pause() {
  if (!store.playing) return;
  store.playing = false; cancelAnimationFrame(rafId);
  for (const e of pool.map.values()) { e.el.pause(); if (e.gain) e.gain.gain.value = 0; }
  emit('play'); syncPaused(); requestRender();
}

export function togglePlay() { store.playing ? pause() : play(); }

function tick() {
  if (!store.playing) return;
  const t = playStartT + (performance.now() - playStartWall) / 1000;
  const dur = projectDuration();
  if (t >= dur) { store.time = dur; pause(); emit('time'); return; }
  store.time = t;
  syncPlaying(t);
  draw();
  emit('time');
  rafId = requestAnimationFrame(tick);
}

function ensurePlaying(c, t, keep) {
  keep.add(c.id);
  const e = pool.get(c); if (!e) return null;
  const el = e.el, st = srcTime(c, t);
  if (el.playbackRate !== c.speed) el.playbackRate = c.speed;
  const m = getMedia(c.mediaId);
  const atEnd = m && st >= m.duration - 0.06;
  if (atEnd) { if (!el.paused) el.pause(); return e; }
  if (el.paused) { if (Math.abs(el.currentTime - st) > 0.05) el.currentTime = st; el.play().catch(() => {}); }
  else if (Math.abs(el.currentTime - st) > 0.25) el.currentTime = st;
  return e;
}

function syncPlaying(t) {
  const keep = new Set();
  const ac = audioCtx();
  for (const it of visualItemsAt(t)) if (it.clip.kind === 'video') ensurePlaying(it.clip, t, keep);
  for (const c of audioClipsAt(t)) {
    const e = ensurePlaying(c, t, keep);
    if (e) pool.setFx(e, c.audioFx);
    if (e?.gain) e.gain.gain.setTargetAtTime(totalGainAt(c, t), ac.currentTime, c.duck?.enabled ? 0.08 : 0.015);
  }
  // precarga de clips que empiezan pronto
  for (const c of store.project.clips) {
    if ((c.kind === 'video' || c.kind === 'audio') && c.start > t && c.start - t < 1.5 && !keep.has(c.id)) {
      const e = pool.get(c); keep.add(c.id);
      if (e && e.el.paused) { const st = srcTime(c, c.start); if (Math.abs(e.el.currentTime - st) > 0.05) e.el.currentTime = st; }
    }
  }
  const audible = new Set(audioClipsAt(t).map(c => c.id));
  for (const [id, e] of pool.map) {
    if (!audible.has(id) && e.gain && e.gain.gain.value !== 0) e.gain.gain.setTargetAtTime(0, ac.currentTime, 0.015);
    if (!keep.has(id) && !e.el.paused) e.el.pause();
  }
  pool.gc(keep);
}

export function seekBy(dt) { setTime(Math.max(0, Math.min(projectDuration(), store.time + dt))); if (store.playing) { playStartWall = performance.now(); playStartT = store.time; } }
export function seekTo(t) { setTime(t); if (store.playing) { playStartWall = performance.now(); playStartT = store.time; } }

export function setMasterVolume(v) { master().gain.value = v; }
export function previewCanvas() { return canvas; }
export { clipEnd };
