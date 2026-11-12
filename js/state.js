// Modelo del proyecto, eventos, selección y deshacer/rehacer
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const EPS = 1e-4;

const listeners = {};
export function on(evt, fn) { (listeners[evt] ||= []).push(fn); }
export function emit(evt, data) { (listeners[evt] || []).forEach(f => f(data)); }

export const store = {
  project: null,
  selectedId: null,
  sel: new Set(),      // selección múltiple (incluye selectedId)
  time: 0,
  playing: false,
  zoom: 60,          // píxeles por segundo en la línea de tiempo
  snap: true,
  clipboard: null,
};

export const ASPECTS = {
  '16:9': { w: 1920, h: 1080, label: 'Horizontal 16:9 (YouTube)' },
  '9:16': { w: 1080, h: 1920, label: 'Vertical 9:16 (TikTok, Reels)' },
  '1:1':  { w: 1080, h: 1080, label: 'Cuadrado 1:1 (Instagram)' },
  '4:3':  { w: 1440, h: 1080, label: 'Clásico 4:3' },
  '4:5':  { w: 1080, h: 1350, label: 'Retrato 4:5' },
};

export function newProject(name = 'Mi proyecto', aspect = '16:9') {
  const a = ASPECTS[aspect] || ASPECTS['16:9'];
  return {
    id: uid(), name, createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    settings: { aspect, width: a.w, height: a.h, fps: 30, bgColor: '#000000', bgMode: 'color' },
    tracks: [
      { id: uid(), type: 'visual', name: 'Vídeo 1', hidden: false, locked: false, muted: false },
      { id: uid(), type: 'audio', name: 'Audio 1', hidden: false, locked: false, muted: false },
    ],
    clips: [],
    media: [],
  };
}

export const SUB_STYLE = () => ({ font: 'Roboto', size: 54, color: '#ffffff', bold: true, bg: '#000000', bgOpacity: 0.55, y: 0.88, stroke: 0, strokeColor: '#000000' });

// ---------- Fábrica de clips ----------
const VISUAL_BASE = () => ({
  x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, flipH: false, flipV: false, blend: 'source-over',
  fit: 'contain', cropL: 0, cropT: 0, cropR: 0, cropB: 0,
  mask: 'none', maskRadius: 0.25, borderWidth: 0, borderColor: '#ffffff', dropShadow: false,
  filters: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, temperature: 0, vignette: 0 },
  filterPreset: 'none',
  chroma: { enabled: false, color: '#00ff00', similarity: 0.35, smoothness: 0.08, spill: 0.3 },
  animIn: { type: 'none', duration: 0.5 }, animOut: { type: 'none', duration: 0.5 }, animLoop: { type: 'none', speed: 1 },
  transition: null, kf: {},
});

export function makeClip(kind, opts = {}) {
  const c = { id: uid(), kind, trackId: null, start: 0, duration: 5, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, name: '' };
  if (kind !== 'audio' && kind !== 'subtitle') Object.assign(c, VISUAL_BASE());
  if (kind === 'text') Object.assign(c, {
    text: 'Escribe aquí', font: 'Montserrat', size: 90, color: '#ffffff', bold: true, italic: false, underline: false, align: 'center',
    strokeColor: '#000000', strokeWidth: 0, shadow: true, shadowColor: '#000000', bgColor: '#000000', bgOpacity: 0, bgRadius: 16,
    lineHeight: 1.2, letterSpacing: 0, boxW: 0.9,
  });
  if (kind === 'shape') Object.assign(c, { shape: 'rect', w: 0.3, h: 0.3, fill: '#7c5cff', stroke: '#ffffff', strokeWidth: 0, radius: 0 });
  if (kind === 'color') Object.assign(c, { color1: '#1e1b4b', color2: '#7c3aed', gradient: true, angle: 135 });
  if (kind === 'subtitle') Object.assign(c, { text: 'Subtítulo', duration: 3 });
  if (kind === 'effect') Object.assign(c, { effect: 'glitch', intensity: 0.7, duration: 3 });
  return Object.assign(c, opts);
}

// ---------- Consultas ----------
export const P = () => store.project;
export const getClip = id => store.project?.clips.find(c => c.id === id);
export const getTrack = id => store.project?.tracks.find(t => t.id === id);
export const getMedia = id => store.project?.media.find(m => m.id === id);
export const clipEnd = c => c.start + c.duration;
export const trackClips = tid => store.project.clips.filter(c => c.trackId === tid).sort((a, b) => a.start - b.start);
export const selected = () => getClip(store.selectedId);
export const isVisualKind = k => ['video', 'image', 'text', 'shape', 'color', 'effect'].includes(k);
export const trackTypeFor = k => isVisualKind(k) ? 'visual' : (k === 'subtitle' ? 'subtitle' : 'audio');

export function projectDuration(p = store.project) {
  if (!p) return 0;
  return p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

export function mediaMaxDuration(c) {
  if (c.kind !== 'video' && c.kind !== 'audio') return Infinity;
  const m = getMedia(c.mediaId);
  if (!m || !isFinite(m.duration)) return Infinity;
  return Math.max(0.05, (m.duration - c.in) / c.speed);
}

export function prevAdjacent(c) {
  const list = trackClips(c.trackId);
  const i = list.findIndex(x => x.id === c.id);
  const a = list[i - 1];
  return a && Math.abs(clipEnd(a) - c.start) < 0.02 ? a : null;
}

export function nextAdjacent(c) {
  const list = trackClips(c.trackId);
  const i = list.findIndex(x => x.id === c.id);
  const b = list[i + 1];
  return b && Math.abs(clipEnd(c) - b.start) < 0.02 ? b : null;
}

// Duración efectiva de una transición entre a (anterior) y c
export function transDur(c) {
  if (!c.transition || c.transition.type === 'none') return 0;
  const a = prevAdjacent(c);
  if (!a) return 0;
  return Math.min(c.transition.duration, c.duration, a.duration);
}

// Fuente de tiempo de un clip (vídeo/audio) para un tiempo global
export function srcTime(c, t) {
  const m = getMedia(c.mediaId);
  let s = c.in + (t - c.start) * c.speed;
  const max = m && isFinite(m.duration) ? m.duration - 0.03 : s;
  return clamp(s, 0, Math.max(0, max));
}

// Elementos visuales visibles en t (en orden de dibujo: de abajo arriba)
export function visualItemsAt(t, p = store.project) {
  const items = [];
  const tracks = p.tracks.filter(tr => tr.type === 'visual' && !tr.hidden);
  for (let i = tracks.length - 1; i >= 0; i--) {
    const tr = tracks[i];
    const list = p.clips.filter(c => c.trackId === tr.id).sort((a, b) => a.start - b.start);
    let handled = false;
    for (let j = 1; j < list.length; j++) {
      const b = list[j], a = list[j - 1];
      if (!b.transition || b.transition.type === 'none' || Math.abs(clipEnd(a) - b.start) > 0.02) continue;
      const d = Math.min(b.transition.duration, b.duration, a.duration);
      if (d <= 0) continue;
      const t0 = b.start - d / 2, t1 = b.start + d / 2;
      if (t >= t0 && t < t1) {
        const pr = (t - t0) / d;
        items.push({ clip: a, t, trans: { type: b.transition.type, p: pr, role: 'out' } });
        items.push({ clip: b, t, trans: { type: b.transition.type, p: pr, role: 'in' } });
        handled = true; break;
      }
    }
    if (handled) continue;
    const c = list.find(c => t >= c.start - EPS && t < clipEnd(c) - EPS);
    if (c) items.push({ clip: c, t, trans: null });
  }
  return items;
}

export function subtitleItemsAt(t, p = store.project) {
  const out = [];
  for (const tr of p.tracks) {
    if (tr.type !== 'subtitle' || tr.hidden) continue;
    for (const c of p.clips) if (c.trackId === tr.id && t >= c.start && t < clipEnd(c)) out.push({ clip: c, track: tr });
  }
  return out;
}

// Clips con sonido que deben sonar en t
export function audioClipsAt(t, p = store.project) {
  const out = [];
  for (const c of p.clips) {
    if (c.kind !== 'video' && c.kind !== 'audio') continue;
    if (t < c.start || t >= clipEnd(c)) continue;
    const tr = p.tracks.find(x => x.id === c.trackId);
    if (!tr || tr.muted || (tr.hidden && c.kind === 'video')) continue;
    out.push(c);
  }
  return out;
}

export function audioGainAt(c, t) {
  if (c.muted || c.audioDetached) return 0;
  const local = t - c.start;
  let g = prop(c, 'volume', local);
  if (c.fadeIn > 0 && local < c.fadeIn) g *= local / c.fadeIn;
  const rem = c.duration - local;
  if (c.fadeOut > 0 && rem < c.fadeOut) g *= Math.max(0, rem / c.fadeOut);
  return Math.max(0, g);
}

// ---------- Fotogramas clave ----------
export const KF_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'];
const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
export function prop(c, name, local) {
  const k = c.kf && c.kf[name];
  if (!k || !k.length) return c[name];
  if (local <= k[0].t) return k[0].v;
  if (local >= k[k.length - 1].t) return k[k.length - 1].v;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i], b = k[i + 1];
    if (local >= a.t && local <= b.t) return a.v + (b.v - a.v) * ease((local - a.t) / (b.t - a.t || 1));
  }
  return c[name];
}
export function hasKf(c, name) { return !!(c.kf && c.kf[name] && c.kf[name].length); }
export function kfAt(c, name, local) { return c.kf?.[name]?.find(k => Math.abs(k.t - local) < 0.04); }
export function setProp(c, name, value, local) {
  if (hasKf(c, name)) {
    const k = kfAt(c, name, local);
    if (k) k.v = value; else { c.kf[name].push({ t: local, v: value }); c.kf[name].sort((a, b) => a.t - b.t); }
  } else c[name] = value;
}
export function toggleKf(c, name, local) {
  c.kf ||= {};
  const arr = c.kf[name] ||= [];
  const k = kfAt(c, name, local);
  if (k) arr.splice(arr.indexOf(k), 1);
  else { arr.push({ t: local, v: prop(c, name, local) }); arr.sort((a, b) => a.t - b.t); }
  if (!arr.length) { delete c.kf[name]; }
}

// ---------- Historial ----------
let undoStack = [], redoStack = [], lastSnap = null;
export function resetHistory() { undoStack = []; redoStack = []; lastSnap = JSON.stringify(store.project); emit('history'); }
export function commit() {
  const s = JSON.stringify(store.project);
  if (s === lastSnap) { emit('project'); return; }
  if (lastSnap) undoStack.push(lastSnap);
  if (undoStack.length > 150) undoStack.shift();
  redoStack = []; lastSnap = s;
  store.project.updatedAt = Date.now();
  emit('project'); emit('history'); emit('dirty');
}
function restore(s) {
  store.project = JSON.parse(s); lastSnap = s;
  if (store.selectedId && !getClip(store.selectedId)) store.selectedId = null;
  for (const id of [...store.sel]) if (!getClip(id)) store.sel.delete(id);
  emit('project'); emit('select'); emit('history'); emit('dirty');
}
export function undo() { if (!undoStack.length) return; redoStack.push(lastSnap); restore(undoStack.pop()); }
export function redo() { if (!redoStack.length) return; undoStack.push(lastSnap); restore(redoStack.pop()); }
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

// ---------- Selección y tiempo ----------
export function select(id) {
  if (store.selectedId === id && store.sel.size <= 1) return;
  store.selectedId = id; store.sel = new Set(id ? [id] : []); emit('select');
}
export function toggleSelect(id) {
  if (store.sel.has(id)) { store.sel.delete(id); if (store.selectedId === id) store.selectedId = [...store.sel].pop() || null; }
  else { store.sel.add(id); store.selectedId = id; }
  emit('select');
}
export function selectMany(ids) { store.sel = new Set(ids); store.selectedId = ids[ids.length - 1] || null; emit('select'); }
export const selectedIds = () => store.sel.size ? [...store.sel].filter(id => getClip(id)) : (store.selectedId ? [store.selectedId] : []);
export const isSelected = id => store.sel.has(id) || store.selectedId === id;
export function setTime(t) { store.time = Math.max(0, t); emit('time'); }

// ---------- Operaciones de edición ----------
export function addTrack(type, index = null) {
  const p = store.project;
  const n = p.tracks.filter(t => t.type === type).length + 1;
  const names = { visual: 'Vídeo', audio: 'Audio', subtitle: 'Subtítulos' };
  const tr = { id: uid(), type, name: `${names[type]} ${n}`, hidden: false, locked: false, muted: false };
  if (type === 'subtitle') tr.style = SUB_STYLE();
  if (index === null) {
    if (type === 'audio') p.tracks.push(tr);
    else { // pistas visuales y de subtítulos arriba
      const firstVisual = p.tracks.findIndex(t => t.type === 'visual');
      p.tracks.splice(type === 'subtitle' ? 0 : Math.max(0, firstVisual), 0, tr);
    }
  } else p.tracks.splice(index, 0, tr);
  return tr;
}

export function overlaps(trackId, start, end, ignoreId) {
  return store.project.clips.some(c => c.trackId === trackId && c.id !== ignoreId && start < clipEnd(c) - 0.001 && end > c.start + 0.001);
}

// Coloca un clip en una pista; si no cabe, crea una pista nueva encima
export function placeClip(c, trackId, start) {
  const p = store.project;
  const type = trackTypeFor(c.kind);
  let tr = trackId && getTrack(trackId);
  if (!tr || tr.type !== type || tr.locked) tr = p.tracks.find(t => t.type === type && !t.locked && !overlaps(t.id, start, start + c.duration, c.id));
  c.start = Math.max(0, start);
  if (!tr || overlaps(tr.id, c.start, c.start + c.duration, c.id)) {
    const idx = tr ? p.tracks.indexOf(tr) + (type === 'audio' ? 1 : 0) : null;
    tr = addTrack(type, idx);
  }
  c.trackId = tr.id;
  if (!p.clips.includes(c)) p.clips.push(c);
  return c;
}

export function splitClip(c, t) {
  if (!c || t <= c.start + 0.05 || t >= clipEnd(c) - 0.05) return null;
  const local = t - c.start;
  const b = JSON.parse(JSON.stringify(c));
  b.id = uid();
  b.start = t; b.duration = c.duration - local;
  b.in = c.in + local * c.speed;
  b.transition = null; b.animIn = { ...c.animIn, type: 'none' }; b.fadeIn = 0;
  c.duration = local; c.animOut = { ...c.animOut, type: 'none' }; c.fadeOut = 0;
  // repartir fotogramas clave
  for (const k of Object.keys(c.kf || {})) {
    b.kf[k] = c.kf[k].filter(x => x.t >= local).map(x => ({ ...x, t: x.t - local }));
    c.kf[k] = c.kf[k].filter(x => x.t < local);
    if (!c.kf[k].length) delete c.kf[k];
    if (!b.kf[k].length) delete b.kf[k];
  }
  store.project.clips.push(b);
  return b;
}

export function removeClip(id, ripple = false) {
  const p = store.project;
  const c = getClip(id); if (!c) return;
  p.clips = p.clips.filter(x => x.id !== id);
  if (ripple) for (const x of p.clips) if (x.trackId === c.trackId && x.start >= clipEnd(c) - 0.001) x.start -= c.duration;
  if (store.selectedId === id) store.selectedId = null;
  store.sel.delete(id);
}

export function duplicateClip(c) {
  const d = JSON.parse(JSON.stringify(c)); d.id = uid(); d.transition = null;
  placeClip(d, c.trackId, clipEnd(c));
  return d;
}

export function cleanupEmptyTracks() {
  const p = store.project;
  const keep = new Set();
  for (const type of ['visual', 'audio']) { const f = p.tracks.find(t => t.type === type); if (f) keep.add(f.id); }
  p.tracks = p.tracks.filter(t => keep.has(t.id) || p.clips.some(c => c.trackId === t.id) || t.type === 'subtitle');
}

export function fmtTime(t, withFrames = false) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (!withFrames) return base;
  return base + '.' + String(Math.floor((t % 1) * 100)).padStart(2, '0');
}
