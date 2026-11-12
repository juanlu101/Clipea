// Interacción sobre la vista previa: seleccionar, mover, escalar y girar elementos
import { store, on, emit, commit, select, getClip, getTrack, visualItemsAt, setProp, prop, clamp } from './state.js';
import { geometry } from './renderer.js';
import { previewCanvas, requestRender } from './player.js';

let ov, octx, cv;
const HANDLE = 7;

export function initPreview(overlay) {
  ov = overlay; octx = ov.getContext('2d'); cv = previewCanvas();
  on('frame', drawOverlay); on('select', drawOverlay);
  ov.addEventListener('pointerdown', onDown);
  ov.addEventListener('pointermove', onHover);
  ov.addEventListener('dblclick', () => { const c = getClip(store.selectedId); if (c?.kind === 'text') emit('focusText'); });
}

function sizes() {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (ov.width !== Math.round(r.width * dpr) || ov.height !== Math.round(r.height * dpr)) { ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr); }
  ov.style.width = r.width + 'px'; ov.style.height = r.height + 'px';
  return { cw: r.width, ch: r.height, dpr, r };
}

function itemFor(c) { return visualItemsAt(store.time).find(i => i.clip.id === c.id); }

// geometría en píxeles CSS del overlay
function geomCss(item, cw, ch) {
  const g = geometry(item, cw, ch);
  return g;
}

function corners(g) {
  const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = sx * g.w / 2, y = sy * g.h / 2;
    return [g.cx + x * cos - y * sin, g.cy + x * sin + y * cos];
  });
}

function rotHandle(g) {
  const d = g.h / 2 + 26;
  return [g.cx + Math.sin(g.rot) * d, g.cy - Math.cos(g.rot) * d];
}

let guides = { x: false, y: false };
export function drawOverlay() {
  if (!ov) return;
  const { cw, ch, dpr } = sizes();
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, cw, ch);
  const c = getClip(store.selectedId);
  if (guides.x) { octx.strokeStyle = '#ff3ea5'; octx.lineWidth = 1; octx.setLineDash([4, 4]); octx.beginPath(); octx.moveTo(cw / 2, 0); octx.lineTo(cw / 2, ch); octx.stroke(); }
  if (guides.y) { octx.strokeStyle = '#ff3ea5'; octx.lineWidth = 1; octx.setLineDash([4, 4]); octx.beginPath(); octx.moveTo(0, ch / 2); octx.lineTo(cw, ch / 2); octx.stroke(); }
  octx.setLineDash([]);
  if (!c || c.kind === 'audio' || c.kind === 'subtitle' || c.kind === 'effect' || store.playing) return;
  const it = itemFor(c); if (!it) return;
  const g = geomCss(it, cw, ch);
  const pts = corners(g);
  octx.strokeStyle = '#8b6cff'; octx.lineWidth = 1.5;
  octx.beginPath(); pts.forEach((p, i) => i ? octx.lineTo(...p) : octx.moveTo(...p)); octx.closePath(); octx.stroke();
  if (getTrack(c.trackId)?.locked) return;
  const [rx, ry] = rotHandle(g);
  const top = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  octx.beginPath(); octx.moveTo(...top); octx.lineTo(rx, ry); octx.stroke();
  octx.fillStyle = '#fff';
  for (const p of pts) { octx.beginPath(); octx.rect(p[0] - HANDLE / 2 - 1, p[1] - HANDLE / 2 - 1, HANDLE + 2, HANDLE + 2); octx.fill(); octx.stroke(); }
  octx.beginPath(); octx.arc(rx, ry, 6, 0, Math.PI * 2); octx.fill(); octx.stroke();
}

function hit(g, x, y) {
  const dx = x - g.cx, dy = y - g.cy;
  const cos = Math.cos(-g.rot), sin = Math.sin(-g.rot);
  const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
  return Math.abs(lx) <= g.w / 2 && Math.abs(ly) <= g.h / 2;
}

function handleAt(x, y) {
  const c = getClip(store.selectedId);
  if (!c || c.kind === 'audio' || c.kind === 'subtitle' || c.kind === 'effect') return null;
  const it = itemFor(c); if (!it) return null;
  const { cw, ch } = sizes();
  const g = geomCss(it, cw, ch);
  const [rx, ry] = rotHandle(g);
  if (Math.hypot(x - rx, y - ry) < 10) return { type: 'rot', g, c };
  const pts = corners(g);
  for (let i = 0; i < 4; i++) if (Math.hypot(x - pts[i][0], y - pts[i][1]) < 10) return { type: 'scale', g, c, i };
  if (hit(g, x, y)) return { type: 'move', g, c };
  return null;
}

function onHover(e) {
  if (e.buttons) return;
  const r = ov.getBoundingClientRect();
  const hnd = handleAt(e.clientX - r.left, e.clientY - r.top);
  ov.style.cursor = !hnd ? 'default' : hnd.type === 'move' ? 'move' : hnd.type === 'rot' ? 'grab' : 'nwse-resize';
}

function onDown(e) {
  if (store.playing) return;
  const { cw, ch, r } = sizes();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  let hnd = handleAt(x, y);
  if (!hnd) {
    const items = visualItemsAt(store.time).reverse();
    const found = items.find(it => it.clip.kind !== 'effect' && !getTrack(it.clip.trackId)?.locked && hit(geomCss(it, cw, ch), x, y));
    if (!found) { select(null); return; }
    select(found.clip.id);
    hnd = handleAt(x, y);
    if (!hnd) return;
  }
  if (getTrack(hnd.c.trackId)?.locked) return;
  const c = hnd.c, g = hnd.g, local = store.time - c.start;
  const startX = prop(c, 'x', local), startY = prop(c, 'y', local), startS = prop(c, 'scale', local), startR = prop(c, 'rotation', local);
  const d0 = Math.hypot(x - g.cx, y - g.cy) || 1;
  const a0 = Math.atan2(y - g.cy, x - g.cx);
  let moved = false;
  ov.setPointerCapture(e.pointerId);
  const mv = ev => {
    const nx = ev.clientX - r.left, ny = ev.clientY - r.top;
    if (!moved && Math.hypot(nx - x, ny - y) < 2) return;
    moved = true;
    if (hnd.type === 'move') {
      let vx = startX + (nx - x) / cw, vy = startY + (ny - y) / ch;
      guides.x = Math.abs(vx - 0.5) < 0.012; guides.y = Math.abs(vy - 0.5) < 0.012;
      if (guides.x) vx = 0.5; if (guides.y) vy = 0.5;
      setProp(c, 'x', +vx.toFixed(4), local); setProp(c, 'y', +vy.toFixed(4), local);
    } else if (hnd.type === 'scale') {
      const d = Math.hypot(nx - g.cx, ny - g.cy);
      setProp(c, 'scale', +clamp(startS * d / d0, 0.02, 20).toFixed(3), local);
    } else {
      let ang = startR + (Math.atan2(ny - g.cy, nx - g.cx) - a0) * 180 / Math.PI;
      if (ev.shiftKey) ang = Math.round(ang / 15) * 15;
      else for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(ang - s) < 3) ang = s;
      setProp(c, 'rotation', +ang.toFixed(1), local);
    }
    requestRender(); emit('liveEdit');
  };
  const up = () => {
    ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up);
    guides = { x: false, y: false };
    if (moved) commit(); else drawOverlay();
  };
  ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up);
}

// Elemento visible bajo un punto de la pantalla (para soltar archivos sobre huecos de plantilla)
export function itemAtClient(clientX, clientY) {
  if (!ov) return null;
  const { cw, ch, r } = sizes();
  const x = clientX - r.left, y = clientY - r.top;
  const items = visualItemsAt(store.time).reverse();
  return items.find(it => it.clip.kind !== 'effect' && hit(geomCss(it, cw, ch), x, y))?.clip || null;
}
