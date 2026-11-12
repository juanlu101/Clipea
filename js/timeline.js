// Línea de tiempo: pistas, clips, arrastrar, recortar, cursor
import { store, on, emit, commit, select, toggleSelect, selectMany, selectedIds, isSelected, getClip, getTrack, getMedia, clipEnd, projectDuration, trackClips, overlaps, placeClip,
  addTrack, fmtTime, trackTypeFor, clamp, cleanupEmptyTracks, prevAdjacent, removeClip } from './state.js';
import { h, ih, contextMenu, promptDialog, confirmDialog, toast, modal } from './ui.js';
import { icon } from './icons.js';
import { cache, thumbFor } from './media.js';
import { seekTo } from './player.js';
import * as A from './actions.js';
import { TRANSITIONS } from './renderer.js';
import { EFFECTS } from './effects.js';

const HEAD_W = 168;
const TRACK_H = { visual: 62, audio: 46, subtitle: 34 };
let root, scroller, content, playheadEl, snapLine, zoomRange, timeLabel;

export function initTimeline(el) {
  root = el;
  const tb = h('div', { class: 'tl-toolbar' },
    tbtn('undo-2', 'Deshacer (Ctrl+Z)', () => import('./state.js').then(s => s.undo()), 'tbUndo'),
    tbtn('redo-2', 'Rehacer (Ctrl+Y)', () => import('./state.js').then(s => s.redo()), 'tbRedo'),
    h('span', { class: 'tb-sep' }),
    tbtn('scissors', 'Dividir en el cursor (S)', A.splitAtPlayhead),
    tbtn('trash-2', 'Eliminar (Supr)', () => A.deleteSelected(false)),
    tbtn('copy', 'Duplicar (Ctrl+D)', A.duplicateSelected),
    tbtn('snowflake', 'Congelar fotograma', () => A.freezeFrame(getClip(store.selectedId))),
    tbtn('audio-lines', 'Separar audio del vídeo', () => { const c = getClip(store.selectedId); c?.kind === 'video' ? A.detachAudio(c) : toast('Selecciona un clip de vídeo'); }),
    h('span', { class: 'tb-sep' }),
    tbtn('magnet', 'Imán: ajustar a bordes y cursor', () => { store.snap = !store.snap; document.getElementById('tbSnap').classList.toggle('on', store.snap); }, 'tbSnap'),
    h('div', { class: 'spacer' }),
    timeLabel = h('span', { class: 'tl-time' }, '00:00.00 / 00:00.00'),
    h('span', { class: 'tb-sep' }),
    tbtn('zoom-out', 'Alejar (-)', () => setZoom(store.zoom / 1.4)),
    zoomRange = h('input', { type: 'range', min: 0, max: 100, value: 50, class: 'zoom-range', title: 'Zoom' }),
    tbtn('zoom-in', 'Acercar (+)', () => setZoom(store.zoom * 1.4)),
    tbtn('maximize', 'Ajustar todo a la vista', fitZoom),
  );
  zoomRange.addEventListener('input', () => setZoom(zToPx(+zoomRange.value), true));
  scroller = h('div', { class: 'tl-scroll' });
  root.append(tb, scroller);
  document.getElementById('tbSnap').classList.toggle('on', store.snap);

  scroller.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = scroller.getBoundingClientRect();
      const tAt = (e.clientX - rect.left - HEAD_W + scroller.scrollLeft) / store.zoom;
      setZoom(store.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      scroller.scrollLeft = tAt * store.zoom - (e.clientX - rect.left - HEAD_W);
    } else if (!e.shiftKey && Math.abs(e.deltaX) < 1 && e.target.closest('.tl-lane, .tl-ruler') && scroller.scrollHeight <= scroller.clientHeight + 2) {
      e.preventDefault(); scroller.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  on('project', render); on('select', render); on('assets', render);
  on('time', updatePlayhead);
  on('history', () => import('./state.js').then(s => { document.getElementById('tbUndo').disabled = !s.canUndo(); document.getElementById('tbRedo').disabled = !s.canRedo(); }));
  new ResizeObserver(() => render()).observe(scroller);
}

function tbtn(ic, title, fn, id) { return h('button', { class: 'icon-btn', title, id, onclick: fn, html: icon(ic) }); }
const zToPx = v => 4 * Math.pow(400 / 4, v / 100);           // 4..400 px/s
const pxToZ = px => 100 * Math.log(px / 4) / Math.log(100);

export function setZoom(z, fromRange) {
  store.zoom = clamp(z, 4, 400);
  if (!fromRange) zoomRange.value = pxToZ(store.zoom);
  render();
}
export function fitZoom() {
  const d = Math.max(5, projectDuration());
  setZoom((scroller.clientWidth - HEAD_W - 40) / d);
  scroller.scrollLeft = 0;
}

function laneWidth() {
  const d = projectDuration();
  return Math.max((d + 30) * store.zoom, scroller.clientWidth - HEAD_W);
}

export function render() {
  if (!store.project || !scroller) return;
  const sl = scroller.scrollLeft, st = scroller.scrollTop;
  const W = laneWidth();
  content = h('div', { class: 'tl-content', style: { width: (W + HEAD_W) + 'px' } });
  content.append(rulerRow(W));
  for (const tr of store.project.tracks) content.append(trackRow(tr, W));
  content.append(h('div', { class: 'tl-row add-row' }, h('div', { class: 'tl-head add-head' },
    h('button', { class: 'mini-btn', onclick: () => { addTrack('visual'); commit(); } }, ih('plus', 13), 'Vídeo'),
    h('button', { class: 'mini-btn', onclick: () => { addTrack('audio'); commit(); } }, ih('plus', 13), 'Audio'),
  ), h('div', { class: 'tl-lane empty-lane', style: { width: W + 'px' } }, store.project.clips.length ? '' : h('span', { class: 'tl-hint' }, 'Arrastra aquí vídeos, fotos o música desde el panel «Multimedia» o desde tu ordenador'))));
  playheadEl = h('div', { class: 'tl-playhead' }, h('div', { class: 'ph-knob' }));
  snapLine = h('div', { class: 'tl-snapline' });
  content.append(playheadEl, snapLine);
  scroller.replaceChildren(content);
  scroller.scrollLeft = sl; scroller.scrollTop = st;
  updatePlayhead();
  setupLaneDrop();
}

function rulerRow(W) {
  const z = store.zoom;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const major = steps.find(s => s * z >= 70) || 600;
  const minor = major / (major >= 1 ? 5 : 4);
  const ruler = h('div', { class: 'tl-ruler', style: { width: W + 'px' } });
  const n = Math.ceil(W / z / minor);
  const frag = document.createDocumentFragment();
  for (let i = 0; i <= n; i++) {
    const t = i * minor, isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    const tick = h('div', { class: 'tick' + (isMajor ? ' major' : ''), style: { left: t * z + 'px' } });
    if (isMajor) tick.append(h('span', {}, major < 1 ? fmtTime(t, true).slice(1) : fmtTime(t)));
    frag.append(tick);
  }
  ruler.append(frag);
  ruler.addEventListener('pointerdown', e => {
    const rect = ruler.getBoundingClientRect();
    const go = ev => seekTo(Math.max(0, (ev.clientX - rect.left) / store.zoom));
    go(e);
    const mv = ev => go(ev), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  return h('div', { class: 'tl-row ruler-row' }, h('div', { class: 'tl-head corner' }, ih('layers', 14), 'Pistas'), ruler);
}

function trackRow(tr, W) {
  const H = TRACK_H[tr.type];
  const ic = { visual: 'film', audio: 'music', subtitle: 'captions' }[tr.type];
  const head = h('div', { class: 'tl-head', style: { height: H + 'px' } },
    h('span', { class: 'th-icon' }, ih(ic, 14)),
    h('span', { class: 'th-name', title: 'Doble clic para renombrar', ondblclick: async () => { const n = await promptDialog('Nombre de la pista', tr.name); if (n) { tr.name = n; commit(); } } }, tr.name),
    h('div', { class: 'th-btns' },
      tr.type !== 'audio' ? hbtn(tr.hidden ? 'eye-off' : 'eye', tr.hidden ? 'Mostrar pista' : 'Ocultar pista', () => { tr.hidden = !tr.hidden; commit(); }, tr.hidden) : null,
      tr.type !== 'subtitle' ? hbtn(tr.muted ? 'volume-x' : 'volume-2', tr.muted ? 'Activar sonido' : 'Silenciar pista', () => { tr.muted = !tr.muted; commit(); }, tr.muted) : null,
      hbtn(tr.locked ? 'lock' : 'lock-open', tr.locked ? 'Desbloquear' : 'Bloquear pista', () => { tr.locked = !tr.locked; commit(); }, tr.locked),
    ));
  head.addEventListener('contextmenu', e => { e.preventDefault(); trackMenu(tr, e); });
  const lane = h('div', { class: `tl-lane lane-${tr.type}` + (tr.locked ? ' locked' : '') + (tr.hidden ? ' hidden-track' : ''), style: { width: W + 'px', height: H + 'px' }, dataset: { track: tr.id } });
  lane.addEventListener('pointerdown', e => { if (e.target === lane && e.button === 0) onLaneDown(e, lane); });
  for (const c of trackClips(tr.id)) lane.append(clipEl(c, tr, H));
  return h('div', { class: 'tl-row', dataset: { track: tr.id, type: tr.type } }, head, lane);
}

function hbtn(ic, title, fn, active) { return h('button', { class: 'th-btn' + (active ? ' active' : ''), title, onclick: fn, html: icon(ic, 14) }); }

function trackMenu(tr, e) {
  const p = store.project, i = p.tracks.indexOf(tr);
  contextMenu(e.clientX, e.clientY, [
    { label: 'Renombrar', icon: 'pencil', action: async () => { const n = await promptDialog('Nombre de la pista', tr.name); if (n) { tr.name = n; commit(); } } },
    { label: 'Subir pista', icon: 'arrow-left', disabled: i === 0, action: () => { p.tracks.splice(i, 1); p.tracks.splice(i - 1, 0, tr); commit(); } },
    { label: 'Bajar pista', icon: 'arrow-right', disabled: i === p.tracks.length - 1, action: () => { p.tracks.splice(i, 1); p.tracks.splice(i + 1, 0, tr); commit(); } },
    { label: 'Cerrar huecos', icon: 'move-horizontal', action: () => A.closeGaps(tr.id) },
    '-',
    { label: 'Eliminar pista', icon: 'trash-2', danger: true, action: async () => {
      const n = p.clips.filter(c => c.trackId === tr.id).length;
      if (n && !(await confirmDialog('Eliminar pista', `La pista tiene ${n} clip(s). ¿Eliminarla con todo su contenido?`, 'Eliminar', true))) return;
      p.clips = p.clips.filter(c => c.trackId !== tr.id); p.tracks = p.tracks.filter(t => t !== tr);
      if (!p.tracks.some(t => t.type === 'visual')) addTrack('visual');
      if (!p.tracks.some(t => t.type === 'audio')) addTrack('audio');
      commit();
    } },
  ]);
}

function clipLabel(c) {
  if (c.kind === 'text' || c.kind === 'subtitle') return c.text?.replace(/\n/g, ' ') || 'Texto';
  if (c.kind === 'shape') return 'Forma';
  if (c.kind === 'color') return c.placeholder ? (c.name || 'Arrastra aquí tu vídeo o foto') : 'Fondo';
  if (c.kind === 'effect') return EFFECTS.find(e => e[0] === c.effect)?.[1] || 'Efecto';
  return c.name || getMedia(c.mediaId)?.name || c.kind;
}
const KIND_ICON = { video: 'film', image: 'image', audio: 'music', text: 'type', shape: 'shapes', color: 'palette', subtitle: 'captions', effect: 'sparkles' };

function clipEl(c, tr, H) {
  const z = store.zoom;
  const w = Math.max(4, c.duration * z);
  const el = h('div', { class: `clip k-${c.kind}` + (isSelected(c.id) ? ' sel' : '') + (c.placeholder ? ' placeholder' : ''), style: { left: c.start * z + 'px', width: w + 'px' }, dataset: { id: c.id } });
  // miniaturas
  if (c.kind === 'video' || c.kind === 'image') {
    const strip = h('div', { class: 'thumbs' });
    const m = getMedia(c.mediaId);
    const tw = Math.max(30, (H - 2) * ((m?.width || 16) / (m?.height || 9)));
    const n = Math.min(120, Math.ceil(w / tw));
    for (let i = 0; i < n; i++) {
      const url = c.kind === 'image' ? cache.urls.get(c.mediaId) : thumbFor(c.mediaId, c.in + (i * tw / z) * c.speed);
      strip.append(h('div', { class: 'th', style: { width: tw + 'px', backgroundImage: url ? `url("${url}")` : '' } }));
    }
    el.append(strip);
  }
  if (c.kind === 'color') el.style.background = c.gradient ? `linear-gradient(${c.angle + 90}deg, ${c.color1}, ${c.color2})` : c.color1;
  // onda de audio
  const m = getMedia(c.mediaId);
  if ((c.kind === 'audio' || (c.kind === 'video' && !c.audioDetached && m?.hasAudio !== false)) && cache.peaks.has(c.mediaId)) {
    const cw = Math.min(Math.ceil(w), 6000), chH = c.kind === 'audio' ? H - 18 : 16;
    const cv = h('canvas', { class: 'wave' + (c.kind === 'video' ? ' small' : ''), width: cw, height: chH });
    drawWave(cv, c, cw, chH);
    el.append(cv);
  }
  const badges = [];
  if (c.speed !== 1) badges.push(h('span', { class: 'badge' }, `${c.speed}×`));
  if (c.kind !== 'audio' && c.kind !== 'subtitle' && c.kf && Object.keys(c.kf).length) badges.push(h('span', { class: 'badge' }, '◆'));
  if (c.volume === 0 || c.muted) badges.push(h('span', { class: 'badge', html: icon('volume-x', 11) }));
  if (c.audioFx && c.audioFx !== 'none') badges.push(h('span', { class: 'badge', title: 'Efecto de voz' }, 'FX'));
  if (c.duck?.enabled) badges.push(h('span', { class: 'badge', title: 'Se atenúa cuando hay voz' }, '⇩'));
  if (c.bgRemove) badges.push(h('span', { class: 'badge', title: 'Fondo quitado con IA' }, 'IA'));
  if (c.reversed) badges.push(h('span', { class: 'badge', title: 'Al revés' }, '⟲'));
  el.append(h('div', { class: 'clip-label' }, ih(KIND_ICON[c.kind], 12), h('span', {}, clipLabel(c)), ...badges));
  // fundidos de audio
  if (c.fadeIn > 0) el.append(h('div', { class: 'fade-in', style: { width: c.fadeIn * z + 'px' } }));
  if (c.fadeOut > 0) el.append(h('div', { class: 'fade-out', style: { width: c.fadeOut * z + 'px' } }));
  // transición con el clip anterior
  if (tr.type === 'visual' && prevAdjacent(c)) {
    const has = c.transition && c.transition.type !== 'none';
    const name = has ? (TRANSITIONS.find(x => x[0] === c.transition.type)?.[1] || '') : 'Añadir transición';
    el.append(h('button', { class: 'trans-btn' + (has ? ' has' : ''), title: name, html: icon(has ? 'blend' : 'plus', 12),
      onpointerdown: e => e.stopPropagation(),
      onclick: e => { e.stopPropagation(); select(c.id); emit('openPanel', 'transitions'); } }));
  }
  el.append(h('div', { class: 'trim l', title: 'Arrastra para recortar' }), h('div', { class: 'trim r', title: 'Arrastra para recortar' }));
  el.addEventListener('pointerdown', e => onClipDown(e, c, el));
  el.addEventListener('contextmenu', e => { e.preventDefault(); select(c.id); clipMenu(c, e); });
  el.addEventListener('dblclick', () => { if (c.kind === 'text' || c.kind === 'subtitle') emit('focusText'); });
  return el;
}

function drawWave(cv, c, w, hgt) {
  const pk = cache.peaks.get(c.mediaId); if (!pk) return;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = c.kind === 'audio' ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.55)';
  const z = store.zoom * (w / Math.max(1, c.duration * store.zoom));
  for (let x = 0; x < w; x++) {
    const st = c.in + (x / z) * c.speed;
    const i = Math.floor(st * pk.rate);
    const v = (pk.data[i] || 0) / 255 * Math.min(1.5, c.volume);
    const bh = Math.max(1, v * hgt);
    ctx.fillRect(x, (hgt - bh) / 2, 1, bh);
  }
}

function snapPoints(exceptId) {
  const pts = [0, store.time];
  for (const c of store.project.clips) if (c.id !== exceptId) pts.push(c.start, clipEnd(c));
  return pts;
}
function snap(t, pts) {
  if (!store.snap) return [t, null];
  const thr = 8 / store.zoom;
  let best = null, bd = thr;
  for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
  return best == null ? [t, null] : [best, best];
}
function showSnap(t) {
  if (t == null) { snapLine.style.display = 'none'; return; }
  snapLine.style.display = 'block'; snapLine.style.left = (HEAD_W + t * store.zoom) + 'px';
}

function onClipDown(e, c, el) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const tr = getTrack(c.trackId);
  if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSelect(c.id); return; }
  const group = store.sel.size > 1 && store.sel.has(c.id) && !e.target.closest('.trim');
  if (!group) select(c.id); else { store.selectedId = c.id; }
  if (tr.locked) return;
  if (group) return groupDrag(e, c);
  const handle = e.target.closest('.trim');
  const x0 = e.clientX, y0 = e.clientY;
  const orig = { start: c.start, dur: c.duration, in: c.in, end: clipEnd(c), track: c.trackId };
  const pts = snapPoints(c.id);
  const elNow = () => scroller.querySelector(`.clip[data-id="${c.id}"]`) || el;
  let moved = false, targetTrack = c.trackId;
  document.body.classList.add('dragging');

  const list = trackClips(c.trackId);
  const idx = list.findIndex(x => x.id === c.id);
  const prevEnd = idx > 0 ? clipEnd(list[idx - 1]) : 0;
  const nextStart = idx < list.length - 1 ? list[idx + 1].start : Infinity;
  const m = getMedia(c.mediaId);
  const isTimed = c.kind === 'video' || c.kind === 'audio';

  const mv = ev => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    moved = true;
    const dt = dx / store.zoom;
    const node = elNow();
    if (handle?.classList.contains('l')) {
      let ns = orig.start + dt;
      let snapAt; [ns, snapAt] = snap(ns, pts); showSnap(snapAt);
      let minStart = prevEnd;
      if (isTimed) minStart = Math.max(minStart, orig.start - orig.in / c.speed);
      ns = clamp(ns, Math.max(0, minStart), orig.end - 0.1);
      c.start = ns; c.duration = orig.end - ns;
      if (isTimed || c.kind === 'image') c.in = Math.max(0, orig.in + (ns - orig.start) * c.speed);
      node.style.left = ns * store.zoom + 'px'; node.style.width = c.duration * store.zoom + 'px';
      seekTo(ns);
    } else if (handle?.classList.contains('r')) {
      let ne = orig.end + dt;
      let snapAt; [ne, snapAt] = snap(ne, pts); showSnap(snapAt);
      let maxEnd = nextStart;
      if (isTimed && m && isFinite(m.duration)) maxEnd = Math.min(maxEnd, orig.start + (m.duration - c.in) / c.speed);
      ne = clamp(ne, orig.start + 0.1, maxEnd);
      c.duration = ne - orig.start;
      node.style.width = c.duration * store.zoom + 'px';
      seekTo(Math.max(orig.start, ne - 0.034));
    } else {
      let ns = Math.max(0, orig.start + dt);
      let sa1, sa2;
      const [s1, a1] = snap(ns, pts); const [s2, a2] = snap(ns + orig.dur, pts);
      if (a1 != null && (a2 == null || Math.abs(s1 - ns) <= Math.abs(s2 - ns - orig.dur))) { ns = s1; sa1 = a1; }
      else if (a2 != null) { ns = s2 - orig.dur; sa2 = a2; }
      showSnap(sa1 ?? sa2 ?? null);
      c.start = Math.max(0, ns);
      // pista de destino
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tl-row[data-track]');
      if (row && row.dataset.type === trackTypeFor(c.kind) && !getTrack(row.dataset.track)?.locked) {
        targetTrack = row.dataset.track;
        const lane = row.querySelector('.tl-lane');
        if (node.parentElement !== lane) lane.append(node);
      }
      node.style.left = c.start * store.zoom + 'px';
      node.classList.toggle('collide', overlaps(targetTrack, c.start, c.start + c.duration, c.id));
    }
    emit('needRender');
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    document.body.classList.remove('dragging');
    showSnap(null);
    if (!moved) return;
    if (!handle) {
      if (overlaps(targetTrack, c.start, c.start + c.duration, c.id)) { c.trackId = null; placeClip(c, targetTrack, c.start); }
      else c.trackId = targetTrack;
      cleanupEmptyTracks();
    }
    commit();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

// Mover varios clips a la vez (mantienen su pista)
function groupDrag(e, c) {
  const clips = selectedIds().map(getClip).filter(x => x && !getTrack(x.trackId)?.locked);
  const orig = new Map(clips.map(x => [x.id, x.start]));
  const minStart = Math.min(...clips.map(x => x.start));
  const pts = snapPoints(c.id).filter(t => !clips.some(x => Math.abs(x.start - t) < 1e-6 || Math.abs(clipEnd(x) - t) < 1e-6) || t === store.time);
  const x0 = e.clientX; let moved = false;
  document.body.classList.add('dragging');
  const mv = ev => {
    const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 3) return; moved = true;
    let dt = dx / store.zoom;
    let [s1, a1] = snap(orig.get(c.id) + dt, pts); if (a1 != null) dt = s1 - orig.get(c.id); showSnap(a1);
    dt = Math.max(dt, -minStart);
    for (const x of clips) {
      x.start = orig.get(x.id) + dt;
      const n = scroller.querySelector(`.clip[data-id="${x.id}"]`); if (n) n.style.left = x.start * store.zoom + 'px';
    }
    emit('needRender');
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    document.body.classList.remove('dragging'); showSnap(null);
    if (!moved) { select(c.id); return; }
    for (const x of clips) if (overlaps(x.trackId, x.start, clipEnd(x), x.id) && !clips.some(y => y !== x && y.trackId === x.trackId && x.start < clipEnd(y) && clipEnd(x) > y.start)) { const tid = x.trackId; x.trackId = null; placeClip(x, tid, x.start); }
    commit();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

// Clic en zona vacía: mover el cursor; arrastrar: recuadro de selección
function onLaneDown(e, lane) {
  const crect = content.getBoundingClientRect();
  const x0 = e.clientX, y0 = e.clientY;
  let box = null;
  const mv = ev => {
    if (!box && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    if (!box) { box = h('div', { class: 'marquee' }); content.append(box); }
    const l = Math.min(x0, ev.clientX), t = Math.min(y0, ev.clientY), r = Math.max(x0, ev.clientX), b = Math.max(y0, ev.clientY);
    Object.assign(box.style, { left: l - crect.left + 'px', top: t - crect.top + 'px', width: r - l + 'px', height: b - t + 'px' });
    const ids = [...content.querySelectorAll('.clip')].filter(n => { const q = n.getBoundingClientRect(); return q.right > l && q.left < r && q.bottom > t && q.top < b; }).map(n => n.dataset.id);
    content.querySelectorAll('.clip').forEach(n => n.classList.toggle('sel', ids.includes(n.dataset.id)));
    box.ids = ids;
  };
  const up = ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (box) { const ids = box.ids || []; box.remove(); ids.length ? selectMany(ids) : select(null); return; }
    select(null);
    seekTo(Math.max(0, (ev.clientX - lane.getBoundingClientRect().left) / store.zoom));
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

function clipMenu(c, e) {
  if (store.sel.size > 1 && store.sel.has(c.id)) {
    const n = store.sel.size;
    contextMenu(e.clientX, e.clientY, [
      { label: `Duplicar ${n} clips`, icon: 'copy', action: A.duplicateSelected },
      { label: `Copiar ${n} clips`, icon: 'copy', action: A.copySelected },
      '-',
      { label: `Eliminar ${n} clips`, icon: 'trash-2', danger: true, action: () => A.deleteSelected(false) },
    ]);
    return;
  }
  const items = [
    { label: 'Dividir en el cursor', icon: 'scissors', key: 'S', action: A.splitAtPlayhead },
    { label: 'Duplicar', icon: 'copy', key: 'Ctrl+D', action: A.duplicateSelected },
    { label: 'Copiar', icon: 'copy', key: 'Ctrl+C', action: A.copySelected },
  ];
  if (c.kind === 'video') {
    items.push({ label: 'Separar audio', icon: 'audio-lines', action: () => A.detachAudio(c), disabled: c.audioDetached });
    items.push({ label: 'Congelar fotograma', icon: 'snowflake', action: () => A.freezeFrame(c) });
  }
  if (getTrack(c.trackId).type === 'visual' && prevAdjacent(c)) items.push({ label: 'Transición…', icon: 'blend', action: () => emit('openPanel', 'transitions') });
  if (c.kind === 'video' || c.kind === 'audio') items.push({ label: 'Invertir (reproducir al revés)', icon: 'rotate-ccw', action: () => import('./reverse.js').then(r => r.reverseClip(c)) });
  if (['video', 'image', 'audio', 'color'].includes(c.kind)) items.push({ label: 'Reemplazar por otro archivo…', icon: 'repeat', action: () => replaceDialog(c) });
  items.push('-',
    { label: 'Eliminar', icon: 'trash-2', key: 'Supr', danger: true, action: () => A.deleteSelected(false) },
    { label: 'Eliminar y cerrar hueco', icon: 'trash-2', danger: true, action: () => A.deleteSelected(true) });
  contextMenu(e.clientX, e.clientY, items);
}

export function replaceDialog(c) {
  const visual = c.kind !== 'audio';
  const list = store.project.media.filter(m => visual ? m.type !== 'audio' : m.type === 'audio');
  if (!list.length) { toast('Importa primero el archivo en «Multimedia» o «Biblioteca»'); return; }
  const grid = h('div', { class: 'media-grid' }, ...list.map(m => {
    const th = m.type === 'image' ? cache.urls.get(m.id) : thumbFor(m.id, 0);
    return h('div', { class: 'media-card', onclick: () => { A.replaceMedia(c, m); md.close(); } },
      h('div', { class: 'mthumb' + (m.type === 'audio' ? ' audio' : ''), style: th ? { backgroundImage: `url("${th}")` } : {} }), h('div', { class: 'mname' }, h('span', {}, m.name)));
  }));
  const md = modal({ title: 'Reemplazar por…', width: 520, body: h('div', {}, h('p', { class: 'hint' }, 'El nuevo archivo conserva la posición, duración, filtros y animaciones del clip.'), grid) });
}

function updatePlayhead() {
  if (!playheadEl) return;
  const x = HEAD_W + store.time * store.zoom;
  playheadEl.style.transform = `translateX(${x}px)`;
  timeLabel.textContent = `${fmtTime(store.time, true)} / ${fmtTime(projectDuration(), true)}`;
  if (store.playing) {
    const vis0 = scroller.scrollLeft, vis1 = vis0 + scroller.clientWidth;
    if (x > vis1 - 40 || x < vis0 + HEAD_W) scroller.scrollLeft = x - HEAD_W - 60;
  }
}

function setupLaneDrop() {
  content.addEventListener('dragover', e => {
    const lane = e.target.closest('.tl-lane');
    if (!lane) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    content.querySelectorAll('.drop-hover').forEach(x => x.classList.remove('drop-hover'));
    lane.classList.add('drop-hover');
  });
  content.addEventListener('dragleave', e => { if (!content.contains(e.relatedTarget)) content.querySelectorAll('.drop-hover').forEach(x => x.classList.remove('drop-hover')); });
  content.addEventListener('drop', async e => {
    const lane = e.target.closest('.tl-lane');
    content.querySelectorAll('.drop-hover').forEach(x => x.classList.remove('drop-hover'));
    if (!lane) return;
    e.preventDefault();
    const t = Math.max(0, (e.clientX - lane.getBoundingClientRect().left) / store.zoom);
    const trackId = lane.dataset.track || null;
    const mid = e.dataTransfer.getData('text/x-media');
    const onClip = e.target.closest('.clip'); const target = onClip && store.project.clips.find(x => x.id === onClip.dataset.id);
    if (mid && target && (target.placeholder || e.altKey)) { A.replaceMedia(target, getMedia(mid)); return; }
    if (mid) { const m = getMedia(mid); if (m) A.addMediaToTimeline(m, trackId && getTrack(trackId)?.type === (m.type === 'audio' ? 'audio' : 'visual') ? trackId : null, t); return; }
    const preset = e.dataTransfer.getData('text/x-preset');
    if (preset) { emit('dropPreset', { preset, t, trackId }); return; }
    if (e.dataTransfer.files.length) await A.importAndAdd([...e.dataTransfer.files], { addToTimeline: true, start: t, trackId });
  });
}

export function scrollToTime(t) { scroller.scrollLeft = t * store.zoom - scroller.clientWidth / 3; }
export { HEAD_W };
