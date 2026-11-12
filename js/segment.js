// Quitar el fondo sin croma (IA, MediaPipe Selfie Segmentation, funciona sin conexión)
const BASE = new URL('../lib/mediapipe/', import.meta.url).href;
let segP = null, seg = null, pending = null, busy = Promise.resolve();
export const masks = new Map(); // clipId -> { canvas, key }

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.append(s); });
}

export function initSegmenter() {
  if (segP) return segP;
  segP = (async () => {
    if (!window.SelfieSegmentation) await loadScript(BASE + 'selfie_segmentation.js');
    seg = new window.SelfieSegmentation({ locateFile: f => BASE + f });
    seg.setOptions({ modelSelection: 1, selfieMode: false });
    seg.onResults(r => { const p = pending; pending = null; p?.(r); });
    await seg.initialize();
    return seg;
  })();
  segP.catch(() => { segP = null; });
  return segP;
}

const work = document.createElement('canvas');
// Calcula la máscara de una imagen (vídeo, imagen, canvas o VideoFrame) y la guarda para el clip
export function segment(clipId, src, key) {
  const run = async () => {
    const s = await initSegmenter();
    const sw = src.videoWidth || src.naturalWidth || src.displayWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.displayHeight || src.height;
    if (!sw || !sh) return null;
    const w = Math.min(512, sw), h = Math.max(2, Math.round(w * sh / sw));
    if (work.width !== w || work.height !== h) { work.width = w; work.height = h; }
    work.getContext('2d').drawImage(src, 0, 0, w, h);
    const r = await new Promise((res, rej) => { pending = res; s.send({ image: work }).catch(rej); });
    let m = masks.get(clipId);
    if (!m) { m = { canvas: document.createElement('canvas') }; masks.set(clipId, m); }
    if (m.canvas.width !== w || m.canvas.height !== h) { m.canvas.width = w; m.canvas.height = h; }
    const x = m.canvas.getContext('2d'); x.clearRect(0, 0, w, h); x.drawImage(r.segmentationMask, 0, 0, w, h);
    m.key = key;
    return m;
  };
  busy = busy.then(run, run);
  return busy;
}

export const getMask = id => masks.get(id)?.canvas || null;

// En la vista previa: actualizar la máscara sin bloquear (como mucho una petición a la vez)
let previewBusy = false;
export function segmentPreview(clipId, src, key, onDone) {
  if (previewBusy) return;
  const m = masks.get(clipId);
  if (m && m.key === key) return;
  previewBusy = true;
  segment(clipId, src, key).then(() => onDone?.()).catch(e => console.warn('segment', e)).finally(() => { previewBusy = false; });
}
