// Gestión de archivos multimedia: importación, miniaturas, ondas de audio
import { store, uid, emit, getMedia } from './state.js';
import * as db from './storage.js';

export const cache = {
  urls: new Map(),     // mediaId -> objectURL
  images: new Map(),   // mediaId -> HTMLImageElement
  thumbs: new Map(),   // mediaId -> { urls:[], step }
  peaks: new Map(),    // mediaId -> { data:Uint8Array, rate }
};

export function detectType(file) {
  const t = file.type || '';
  const n = (file.name || '').toLowerCase();
  if (t.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|ogv)$/.test(n)) return 'video';
  if (t.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba)$/.test(n)) return 'audio';
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(n)) return 'image';
  return null;
}

export async function loadProjectMedia(project) {
  for (const m of project.media) await ensureMediaLoaded(m);
}

export async function ensureMediaLoaded(m) {
  if (!cache.urls.has(m.id)) {
    const blob = await db.getMediaBlob(m.id);
    if (!blob) { m.missing = true; return; }
    cache.urls.set(m.id, URL.createObjectURL(blob));
  }
  if (m.type === 'image' && !cache.images.has(m.id)) {
    const img = new Image(); img.src = cache.urls.get(m.id);
    try { await img.decode(); } catch {}
    cache.images.set(m.id, img);
  }
  if (!cache.thumbs.has(m.id) || !cache.peaks.has(m.id)) {
    const a = await db.getAssets(m.id);
    if (a?.thumbs) cache.thumbs.set(m.id, { urls: a.thumbs.map(b => URL.createObjectURL(b)), step: a.thumbStep });
    if (a?.peaks) cache.peaks.set(m.id, { data: a.peaks, rate: a.peaksRate });
    if (!a) generateAssets(m); // en segundo plano
  }
}

export function releaseAll() {
  for (const u of cache.urls.values()) URL.revokeObjectURL(u);
  for (const t of cache.thumbs.values()) t.urls.forEach(u => URL.revokeObjectURL(u));
  cache.urls.clear(); cache.images.clear(); cache.thumbs.clear(); cache.peaks.clear();
}

function probe(url, type) {
  return new Promise((res, rej) => {
    if (type === 'image') {
      const img = new Image();
      img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight, duration: Infinity });
      img.onerror = () => rej(new Error('Imagen no compatible'));
      img.src = url; return;
    }
    const el = document.createElement(type === 'video' ? 'video' : 'audio');
    el.preload = 'metadata'; el.muted = true; el.src = url;
    const to = setTimeout(() => rej(new Error('Tiempo de espera agotado')), 20000);
    el.onerror = () => { clearTimeout(to); rej(new Error('Formato no compatible')); };
    el.onloadedmetadata = () => {
      const done = () => { clearTimeout(to); res({ width: el.videoWidth || 0, height: el.videoHeight || 0, duration: el.duration }); el.removeAttribute('src'); el.load(); };
      if (!isFinite(el.duration)) { // grabaciones WebM sin duración
        el.ondurationchange = () => { if (isFinite(el.duration)) { el.ondurationchange = null; el.currentTime = 0; done(); } };
        el.currentTime = 1e7;
      } else done();
    };
  });
}

export async function importFile(file, nameOverride) {
  let type = detectType(file);
  if (!type) throw new Error(`"${file.name}" no es vídeo, audio ni imagen`);
  const id = uid();
  const url = URL.createObjectURL(file);
  let info;
  try { info = await probe(url, type); }
  catch (e) { URL.revokeObjectURL(url); throw new Error(`"${file.name}": ${e.message}. Prueba con MP4 (H.264), MP3 o JPG/PNG.`); }
  if (type === 'video' && !info.width) type = 'audio'; // p. ej. grabación solo de voz
  await db.putMedia(id, store.project.id, file);
  cache.urls.set(id, url);
  const m = { id, name: nameOverride || file.name || 'archivo', type, duration: info.duration, width: info.width, height: info.height, hasAudio: type !== 'image', size: file.size };
  if (type === 'image') { const img = new Image(); img.src = url; try { await img.decode(); } catch {} cache.images.set(id, img); }
  store.project.media.push(m);
  generateAssets(m);
  return m;
}

// Miniaturas (vídeo) y forma de onda (audio)
const assetQueue = [];
let assetBusy = false;
export function generateAssets(m) { assetQueue.push(m); runQueue(); }
async function runQueue() {
  if (assetBusy) return; assetBusy = true;
  while (assetQueue.length) {
    const m = assetQueue.shift();
    try { await buildAssets(m); } catch (e) { console.warn('assets', e); }
  }
  assetBusy = false;
}

async function buildAssets(m) {
  const url = cache.urls.get(m.id); if (!url) return;
  const out = {};
  if (m.type === 'video') {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = url;
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; });
    const n = Math.max(1, Math.min(60, Math.ceil(m.duration / 2)));
    const step = m.duration / n;
    const cv = document.createElement('canvas');
    const h = 72; const w = Math.round(h * (m.width / m.height || 16 / 9));
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const blobs = [];
    for (let i = 0; i < n; i++) {
      v.currentTime = Math.min(m.duration - 0.05, i * step + 0.01);
      await new Promise(r => { v.onseeked = r; setTimeout(r, 1500); });
      ctx.drawImage(v, 0, 0, w, h);
      blobs.push(await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.7)));
      if (i === 0) { cache.thumbs.set(m.id, { urls: [URL.createObjectURL(blobs[0])], step: m.duration }); emit('assets', m.id); }
    }
    v.removeAttribute('src'); v.load();
    out.thumbs = blobs; out.thumbStep = step;
    cache.thumbs.set(m.id, { urls: blobs.map(b => URL.createObjectURL(b)), step });
  }
  if (m.type === 'video' || m.type === 'audio') {
    try {
      const buf = await decodeAudio(m.id);
      const rate = Math.min(100, 40000 / Math.max(1, buf.duration));
      const n = Math.ceil(buf.duration * rate);
      const peaks = new Uint8Array(n);
      const chs = []; for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
      const per = buf.sampleRate / rate;
      for (let i = 0; i < n; i++) {
        let mx = 0; const s0 = Math.floor(i * per), s1 = Math.min(buf.length, Math.floor((i + 1) * per));
        for (const ch of chs) for (let s = s0; s < s1; s += 4) { const a = Math.abs(ch[s]); if (a > mx) mx = a; }
        peaks[i] = Math.min(255, Math.round(Math.sqrt(mx) * 255));
      }
      out.peaks = peaks; out.peaksRate = rate;
      cache.peaks.set(m.id, { data: peaks, rate });
      m.hasAudio = true;
    } catch { m.hasAudio = false; out.noAudio = true; }
  }
  await db.putAssets(m.id, out);
  emit('assets', m.id);
}

let actx = null;
export function audioCtx() { return actx ||= new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); }

export async function decodeAudio(mediaId) {
  const blob = await db.getMediaBlob(mediaId);
  const ab = await blob.arrayBuffer();
  return await audioCtx().decodeAudioData(ab);
}

export function thumbFor(mediaId, t = 0) {
  const th = cache.thumbs.get(mediaId);
  if (!th || !th.urls.length) return null;
  return th.urls[Math.max(0, Math.min(th.urls.length - 1, Math.floor(t / th.step)))];
}

export async function removeMedia(id) {
  const p = store.project;
  p.clips = p.clips.filter(c => c.mediaId !== id);
  p.media = p.media.filter(m => m.id !== id);
  const u = cache.urls.get(id); if (u) URL.revokeObjectURL(u);
  cache.urls.delete(id); cache.images.delete(id); cache.thumbs.delete(id); cache.peaks.delete(id);
  await db.deleteMedia(id);
}

export function mediaIcon(type) { return { video: 'film', audio: 'music', image: 'image' }[type] || 'file-video'; }
export { getMedia };
