// Panel lateral izquierdo: multimedia, grabar, texto, subtítulos, elementos, audio, transiciones, filtros
import { store, on, emit, commit, select, selected, getClip, getMedia, makeClip, placeClip, overlaps, fmtTime, clipEnd, getTrack } from './state.js';
import { h, ih, toast, pickFiles, confirmDialog, contextMenu, slider, download, modal, toggleCtl } from './ui.js';
import { icon } from './icons.js';
import { cache, thumbFor, removeMedia, importFile, mediaIcon } from './media.js';
import * as A from './actions.js';
import { openRecorder } from './recorder.js';
import { EFFECTS } from './effects.js';
import { STYLES, generateMusic } from './music.js';
import { KINDS as STOCK_KINDS, search as stockSearch, download as stockDownload, creditsText } from './stock.js';
import { NATURAL_VOICES, BASIC_VOICES, speakNatural, speakBasic } from './tts.js';
import { chunkText } from './subtitles.js';
import { autoSubtitlesFromClip } from './speech.js';
import { SFX, renderSfx } from './sfx.js';
import { TRANSITIONS, FILTER_PRESETS, DEFAULT_FILTERS, cssFilter } from './renderer.js';
import { parseSubs, addSubtitles, exportSRT, subtitleTrack } from './subtitles.js';
import { seekTo } from './player.js';
import { ensureFonts } from './fonts.js';
import { storageEstimate } from './storage.js';

export const PANELS = [
  ['media', 'Multimedia', 'folder-open'], ['library', 'Biblioteca', 'library'], ['record', 'Grabar', 'video'], ['text', 'Texto', 'type'], ['subtitles', 'Subtítulos', 'captions'],
  ['elements', 'Elementos', 'shapes'], ['audio', 'Audio y voz', 'music'], ['effects', 'Efectos', 'sparkles'], ['transitions', 'Transiciones', 'blend'],
];
let root, current = 'media', transDur = 0.8;

export function initPanels(el, rail) {
  root = el;
  for (const [id, label, ic] of PANELS) rail.append(h('button', { class: 'rail-btn', dataset: { panel: id }, title: label, onclick: () => openPanel(id) }, ih(ic, 20), h('span', {}, label)));
  on('openPanel', openPanel);
  on('project', () => { if (['media', 'subtitles', 'transitions', 'effects'].includes(current)) render(); });
  on('assets', () => { if (current === 'media') render(); });
  on('select', () => { if (['transitions', 'effects', 'subtitles'].includes(current)) render(); });
  on('dropPreset', ({ preset, t, trackId }) => dropPreset(preset, t, trackId));
  openPanel('media');
}

export function openPanel(id) {
  if (id === 'filters') id = 'effects';
  if (current !== id) root.querySelector('.panel-body')?.replaceChildren();
  const same = current === id; current = id;
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('on', b.dataset.panel === id));
  render(!same);
}

function render(resetScroll = false) {
  const sc = resetScroll ? 0 : (root.querySelector('.panel-body')?.scrollTop || 0);
  const title = PANELS.find(p => p[0] === current)[1];
  const body = h('div', { class: 'panel-body' });
  ({ media: mediaPanel, library: libraryPanel, record: recordPanel, text: textPanel, subtitles: subsPanel, elements: elementsPanel, audio: audioPanel, effects: effectsPanel, transitions: transPanel })[current](body);
  root.replaceChildren(h('div', { class: 'panel-head' }, h('h2', {}, title)), body);
  body.scrollTop = sc;
}

function dragData(el, type, value) {
  el.draggable = true;
  el.addEventListener('dragstart', e => { e.dataTransfer.setData(type, value); e.dataTransfer.effectAllowed = 'copy'; });
}

// ---------- Multimedia ----------
function mediaPanel(body) {
  const drop = h('div', { class: 'dropzone' }, ih('upload', 26), h('b', {}, 'Importar archivos'), h('span', {}, 'Haz clic o arrastra aquí vídeos, fotos y música'));
  drop.onclick = async () => { const f = await pickFiles('video/*,audio/*,image/*'); if (f.length) A.importAndAdd(f); };
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) A.importAndAdd([...e.dataTransfer.files]); });
  body.append(drop);
  const media = store.project.media;
  if (!media.length) { body.append(h('p', { class: 'hint center' }, 'Aún no has importado nada. Formatos recomendados: MP4, MP3, JPG, PNG.')); }
  const grid = h('div', { class: 'media-grid' });
  for (const m of media) {
    const thumb = m.type === 'image' ? cache.urls.get(m.id) : m.type === 'video' ? thumbFor(m.id, 0) : null;
    const used = store.project.clips.some(c => c.mediaId === m.id);
    const card = h('div', { class: 'media-card', title: m.name + '\nArrastra a la línea de tiempo o pulsa +' },
      h('div', { class: 'mthumb' + (m.type === 'audio' ? ' audio' : ''), style: thumb ? { backgroundImage: `url("${thumb}")` } : {} },
        !thumb ? ih(mediaIcon(m.type), 26) : null,
        isFinite(m.duration) ? h('span', { class: 'mdur' }, fmtTime(m.duration)) : null,
        used ? h('span', { class: 'mused', title: 'En uso' }, '●') : null,
        h('button', { class: 'madd', title: 'Añadir en el cursor', html: icon('plus', 16), onclick: e => { e.stopPropagation(); A.addMediaToTimeline(m); } })),
      h('div', { class: 'mname' }, ih(mediaIcon(m.type), 12), h('span', {}, m.name)));
    dragData(card, 'text/x-media', m.id);
    card.addEventListener('dblclick', () => A.addMediaToTimeline(m));
    card.addEventListener('contextmenu', e => { e.preventDefault(); contextMenu(e.clientX, e.clientY, [
      { label: 'Añadir en el cursor', icon: 'plus', action: () => A.addMediaToTimeline(m) },
      { label: 'Eliminar del proyecto', icon: 'trash-2', danger: true, action: async () => {
        if (used && !(await confirmDialog('Eliminar archivo', `«${m.name}» se usa en la línea de tiempo. Se borrarán también esos clips.`, 'Eliminar', true))) return;
        await removeMedia(m.id); commit();
      } }]); });
    grid.append(card);
  }
  body.append(grid);
  const usage = h('p', { class: 'hint storage' }); body.append(usage);
  storageEstimate().then(e => { if (e) usage.textContent = `Espacio usado en este navegador: ${(e.usage / 1048576).toFixed(0)} MB de ${(e.quota / 1073741824).toFixed(0)} GB disponibles`; });
}

// ---------- Grabar ----------
function recordPanel(body) {
  const card = (mode, ic, title, desc) => h('button', { class: 'big-card', onclick: () => openRecorder(mode) }, h('div', { class: 'bc-icon' }, ih(ic, 24)), h('div', {}, h('b', {}, title), h('span', {}, desc)));
  body.append(
    card('screen', 'monitor', 'Pantalla', 'Graba una ventana, pestaña o toda la pantalla'),
    card('camera', 'webcam', 'Cámara', 'Graba con la webcam y el micrófono'),
    card('screencam', 'layers', 'Pantalla + cámara', 'Tu cara en un círculo sobre la pantalla (ideal para tutoriales)'),
    card('voice', 'mic', 'Voz en off', 'Narra encima de tu vídeo; opcional: subtítulos automáticos'),
    h('p', { class: 'hint' }, 'La grabación se coloca en la línea de tiempo en la posición del cursor. El navegador te pedirá permiso la primera vez.'));
}

// ---------- Texto ----------
export const TEXT_PRESETS = [
  ['Título', { text: 'Título', font: 'Montserrat', size: 140, bold: true, animIn: { type: 'pop', duration: 0.6 }, animOut: { type: 'fade', duration: 0.5 } }],
  ['Subtítulo', { text: 'Subtítulo', font: 'Roboto', size: 64, bold: false, y: 0.62 }],
  ['Rótulo inferior', { text: 'Nombre Apellido\nCargo o descripción', font: 'Poppins', size: 48, bold: true, align: 'left', bgColor: '#7c5cff', bgOpacity: 0.95, bgRadius: 10, shadow: false, x: 0.3, y: 0.82, boxW: 0.5, animIn: { type: 'slide-left', duration: 0.6 }, animOut: { type: 'slide-left', duration: 0.5 } }],
  ['Cómic', { text: '¡BOOM!', font: 'Bangers', size: 170, color: '#ffd600', strokeColor: '#000000', strokeWidth: 6, rotation: -6, animIn: { type: 'bounce', duration: 0.8 } }],
  ['Neón', { text: 'NEÓN', font: 'Righteous', size: 130, color: '#39ff14', shadowColor: '#39ff14', animLoop: { type: 'blink', speed: 0.6 } }],
  ['Cita', { text: '«La imaginación es más importante que el conocimiento»', font: 'Playfair Display', size: 72, italic: true, bold: false, boxW: 0.75, animIn: { type: 'fade', duration: 1 } }],
  ['Máquina de escribir', { text: 'Érase una vez…', font: 'Courier New', size: 72, bold: true, animIn: { type: 'typewriter', duration: 2 } }],
  ['Etiqueta', { text: 'NUEVO', font: 'Archivo Black', size: 70, color: '#111111', bgColor: '#ffd600', bgOpacity: 1, bgRadius: 8, shadow: false, animIn: { type: 'zoom-in', duration: 0.4 } }],
  ['Impacto', { text: 'IMPACTO', font: 'Anton', size: 180, color: '#ffffff', strokeColor: '#000000', strokeWidth: 4, letterSpacing: 6, animIn: { type: 'zoom-out', duration: 0.5 } }],
  ['Pixel', { text: 'GAME OVER', font: 'Press Start 2P', size: 64, color: '#ff4d4d', shadow: false, animLoop: { type: 'pulse', speed: 1 } }],
  ['Manuscrito', { text: 'Con cariño', font: 'Caveat', size: 120, bold: true, color: '#ffffff' }],
  ['Créditos', { text: 'Dirección: …\nGuion: …\nMúsica: …\nGracias por ver', font: 'Montserrat', size: 52, lineHeight: 1.6, bold: false, animLoop: { type: 'none' }, animIn: { type: 'rise', duration: 1 } }],
];

function presetStyle(o) {
  return { fontFamily: `"${o.font}"`, fontWeight: o.bold === false ? 400 : 700, fontStyle: o.italic ? 'italic' : 'normal', color: o.color || '#fff',
    background: o.bgOpacity ? o.bgColor : 'transparent', WebkitTextStroke: o.strokeWidth ? `${Math.min(2, o.strokeWidth / 3)}px ${o.strokeColor}` : '', textShadow: o.shadowColor ? `0 0 8px ${o.shadowColor}` : '' };
}

async function addText(opts, t) {
  await ensureFonts([opts.font]);
  const o = JSON.parse(JSON.stringify(opts));
  if (t != null) { const keep = store.time; store.time = t; A.addOverlay('text', o, 4); store.time = keep; emit('time'); }
  else A.addOverlay('text', o, 4);
  emit('focusText');
}

function textPanel(body) {
  body.append(h('button', { class: 'btn primary block', onclick: () => addText({ text: 'Escribe aquí', font: 'Montserrat', size: 90 }) }, ih('plus', 16), 'Añadir texto'));
  const grid = h('div', { class: 'preset-grid' });
  TEXT_PRESETS.forEach(([name, o], i) => {
    const card = h('button', { class: 'preset-card', title: 'Clic para añadir · o arrástralo a la línea de tiempo', onclick: () => addText(o) },
      h('div', { class: 'pc-prev' }, h('span', { style: presetStyle(o) }, o.text.split('\n')[0].slice(0, 14))), h('span', { class: 'pc-name' }, name));
    dragData(card, 'text/x-preset', 'text:' + i);
    grid.append(card);
  });
  body.append(grid, h('p', { class: 'hint' }, 'Después de añadirlo, cambia el texto, la fuente, los colores y la animación en el panel de la derecha. Arrastra el texto en la vista previa para moverlo.'));
}

function dropPreset(preset, t, trackId) {
  const [kind, i] = preset.split(':');
  if (kind === 'text') addText(TEXT_PRESETS[+i][1], t);
  if (kind === 'fx') { const keep = store.time; store.time = t; A.addOverlay('effect', { effect: i, intensity: 0.7 }, 3); store.time = keep; emit('time'); }
}

// ---------- Subtítulos ----------
function subsPanel(body) {
  const tr = subtitleTrack(false);
  const list = tr ? store.project.clips.filter(c => c.trackId === tr.id).sort((a, b) => a.start - b.start) : [];
  body.append(
    h('div', { class: 'btn-col' },
      h('button', { class: 'btn primary block', onclick: () => {
        const t = subtitleTrack();
        let start = store.time;
        const c = makeClip('subtitle', { text: 'Nuevo subtítulo', start, duration: 2.5, trackId: t.id });
        const clash = store.project.clips.find(x => x.trackId === t.id && start < clipEnd(x) && start + c.duration > x.start);
        if (clash) { c.start = clipEnd(clash); }
        store.project.clips.push(c); select(c.id); commit(); emit('focusText');
      } }, ih('plus', 16), 'Añadir subtítulo en el cursor'),
      h('button', { class: 'btn block', title: 'Escucha el audio del clip seleccionado (o del primer vídeo) y crea los subtítulos', onclick: () => {
        const sel = selected();
        const c = sel && (sel.kind === 'video' || sel.kind === 'audio') ? sel : store.project.clips.filter(x => (x.kind === 'video' && !x.audioDetached) || x.kind === 'audio').sort((a, b) => a.start - b.start)[0];
        autoSubtitlesFromClip(c);
      } }, ih('wand-sparkles', 16), 'Generar desde el audio de un clip'),
      h('button', { class: 'btn block', title: 'Graba tu voz y se crean los subtítulos automáticamente', onclick: () => openRecorder('voice', { subs: true }) }, ih('mic', 16), 'Dictar subtítulos con tu voz'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm', onclick: async () => { const [f] = await pickFiles('.srt,.vtt,text/vtt', false); if (!f) return; const subs = parseSubs(await f.text()); if (!subs.length) return toast('No se encontraron subtítulos en el archivo', 'error'); addSubtitles(subs); toast(`${subs.length} subtítulos importados`, 'ok'); } }, ih('upload', 14), 'Importar SRT'),
        h('button', { class: 'btn sm', disabled: !list.length, onclick: () => download(new Blob([exportSRT()], { type: 'text/plain' }), (store.project.name || 'subtitulos') + '.srt') }, ih('download', 14), 'Exportar SRT'))),
  );
  if (!list.length) { body.append(h('p', { class: 'hint center' }, 'Todavía no hay subtítulos. Coloca el cursor donde empieza una frase y pulsa «Añadir».')); return; }
  const ul = h('div', { class: 'sub-list' });
  for (const c of list) {
    const ta = h('textarea', { class: 'inp', rows: 2 }, c.text);
    ta.addEventListener('focus', () => { select(c.id); seekTo(c.start + 0.01); });
    ta.addEventListener('input', () => { c.text = ta.value; emit('needRender'); });
    ta.addEventListener('change', () => commit());
    ta.addEventListener('keydown', e => e.stopPropagation());
    ul.append(h('div', { class: 'sub-item' + (c.id === store.selectedId ? ' sel' : '') },
      h('div', { class: 'sub-meta' }, h('button', { class: 'link', onclick: () => { select(c.id); seekTo(c.start + 0.01); } }, `${fmtTime(c.start, true)} → ${fmtTime(clipEnd(c), true)}`),
        h('button', { class: 'icon-btn sm', title: 'Eliminar', html: icon('trash-2', 14), onclick: () => { store.project.clips = store.project.clips.filter(x => x !== c); if (store.selectedId === c.id) select(null); commit(); } })), ta));
  }
  body.append(ul, h('p', { class: 'hint' }, 'Selecciona un subtítulo para cambiar el estilo de todos (fuente, tamaño, fondo, posición) en el panel derecho.'));
}

// ---------- Elementos ----------
const EMOJIS = '😀 😂 😍 😎 🤔 😮 😢 😡 👍 👎 👏 🙌 💪 🙏 👀 ❤️ 🔥 ⭐ ✨ 💯 🎉 🎬 📚 ✏️ 🧪 🔬 🌍 🚀 💡 ⚠️ ✅ ❌ ❓ ❗ ➡️ ⬅️ ⬆️ ⬇️ 📌 🎵 ⏰ 🏆 🎯 💬 📷 🧠 🌈 ☀️'.split(' ');
const BGS = [['#000000'], ['#ffffff'], ['#1e1b4b'], ['#0f766e'], ['#b91c1c'], ['#f59e0b'], ['#1e1b4b', '#7c3aed'], ['#ff6b6b', '#feca57'], ['#0ea5e9', '#22c55e'], ['#f472b6', '#8b5cf6'], ['#0f172a', '#334155'], ['#fde68a', '#fb7185']];
function elementsPanel(body) {
  const shapes = h('div', { class: 'shape-grid' }, ...[['rect', 'square'], ['ellipse', 'circle'], ['triangle', 'triangle'], ['star', 'star'], ['arrow', 'arrow-right'], ['heart', 'heart'], ['line', 'minus']].map(([s, ic]) =>
    h('button', { class: 'shape-btn', title: 'Añadir forma', onclick: () => A.addOverlay('shape', { shape: s, ...(s === 'line' ? { w: 0.5, h: 0.1, fill: '#ffffff' } : {}), ...(s === 'heart' ? { fill: '#ff3b6b' } : {}), ...(s === 'star' ? { fill: '#ffd600' } : {}) }) }, ih(ic, 24))));
  const bgs = h('div', { class: 'bg-grid' }, ...BGS.map(([a, b]) => h('button', { class: 'bg-btn', style: { background: b ? `linear-gradient(135deg, ${a}, ${b})` : a }, title: 'Añadir fondo',
    onclick: () => A.addOverlay('color', { color1: a, color2: b || a, gradient: !!b }, 5) })));
  const emo = h('div', { class: 'emoji-grid' }, ...EMOJIS.map(e => h('button', { class: 'emoji-btn', onclick: () => A.addOverlay('text', { text: e, size: 220, shadow: false, bold: false, font: 'Roboto', animIn: { type: 'pop', duration: 0.5 } }, 3) }, e)));
  body.append(h('div', { class: 'sec-title' }, 'Formas'), shapes, h('div', { class: 'sec-title' }, 'Fondos de color'), bgs,
    h('p', { class: 'hint' }, 'Los fondos se colocan en la pista principal: úsalos como pantalla de título o separador.'),
    h('div', { class: 'sec-title' }, 'Pegatinas (emojis)'), emo);
}

// ---------- Audio ----------
let sfxPlaying = null;
function audioPanel(body) {
  body.append(ttsSection());
  body.append(h('div', { class: 'sec-title' }, 'Grabar e importar'),
    h('div', { class: 'btn-col' },
      h('button', { class: 'btn primary block', onclick: () => openRecorder('voice') }, ih('mic', 16), 'Grabar voz en off'),
      h('button', { class: 'btn block', onclick: async () => { const f = await pickFiles('audio/*'); if (f.length) A.importAndAdd(f, { addToTimeline: true }); } }, ih('upload', 16), 'Importar música')),
    h('div', { class: 'sec-title' }, 'Efectos de sonido'));
  const list = h('div', { class: 'sfx-list' });
  for (const [k, [name]] of Object.entries(SFX)) {
    list.append(h('div', { class: 'sfx-item' },
      h('button', { class: 'icon-btn sm', title: 'Escuchar', html: icon('play', 14), onclick: async () => { const b = await renderSfx(k); sfxPlaying?.pause(); sfxPlaying = new Audio(URL.createObjectURL(b)); sfxPlaying.play(); } }),
      h('span', {}, name),
      h('button', { class: 'icon-btn sm', title: 'Añadir en el cursor', html: icon('plus', 14), onclick: async () => {
        const b = await renderSfx(k);
        const m = await importFile(new File([b], `${name}.wav`, { type: 'audio/wav' }));
        const c = makeClip('audio', { mediaId: m.id, duration: m.duration, name: m.name });
        const tr = store.project.tracks.find(t => t.type === 'audio' && !t.locked && !overlaps(t.id, store.time, store.time + c.duration));
        placeClip(c, tr?.id, store.time); select(c.id); commit();
      } })));
  }
  body.append(list);
  const audios = store.project.media.filter(m => m.type === 'audio');
  if (audios.length) {
    body.append(h('div', { class: 'sec-title' }, 'Tus audios'));
    for (const m of audios) body.append(h('div', { class: 'sfx-item' }, ih('music', 14), h('span', { title: m.name }, m.name), h('small', {}, fmtTime(m.duration)),
      h('button', { class: 'icon-btn sm', title: 'Añadir en el cursor', html: icon('plus', 14), onclick: () => A.addMediaToTimeline(m) })));
  }
  body.append(h('p', { class: 'hint' }, 'Consejo: para música de fondo baja el volumen al 20-30 % en el panel derecho y añade un fundido de salida. Usa solo música libre de derechos (por ejemplo, la biblioteca de audio de YouTube).'));
}

// ---------- Transiciones ----------
function transPanel(body) {
  const c = selected();
  body.append(slider({ label: 'Duración', value: transDur, min: 0.2, max: 3, step: 0.1, unit: ' s', onInput: v => { transDur = v; } }));
  if (!c || getTrack(c.trackId)?.type !== 'visual') body.append(h('div', { class: 'info-box' }, ih('circle-help', 16), h('span', {}, 'Selecciona en la línea de tiempo el clip que va DESPUÉS del corte y elige una transición. También puedes pulsar el botón ', h('b', {}, '+'), ' que aparece entre dos clips pegados.')));
  else body.append(h('div', { class: 'info-box ok' }, ih('check', 16), h('span', {}, `Clip seleccionado. Transición actual: ${c.transition ? TRANSITIONS.find(t => t[0] === c.transition.type)?.[1] : 'ninguna'}`)));
  const grid = h('div', { class: 'trans-grid' });
  for (const [k, name] of TRANSITIONS) {
    grid.append(h('button', { class: 'trans-card' + (c?.transition?.type === k ? ' on' : ''), onclick: () => A.applyTransition(getClip(store.selectedId), k, transDur) },
      h('div', { class: `tprev tp-${k}` }, h('div', { class: 'a' }), h('div', { class: 'b' })), h('span', {}, name)));
  }
  body.append(grid, h('div', { class: 'btn-row' },
    h('button', { class: 'btn sm', onclick: () => { const c = selected(); if (c) { c.transition = null; commit(); } } }, ih('x', 14), 'Quitar'),
    h('button', { class: 'btn sm', onclick: () => A.applyTransitionToAll(c?.transition?.type || 'crossfade', transDur) }, ih('layers', 14), 'Aplicar a todos los cortes')));
}

// ---------- Efectos y filtros ----------
function effectsPanel(body) {
  const grid = h('div', { class: 'fx-grid' });
  for (const [k, name, emo] of EFFECTS) {
    const card = h('button', { class: 'fx-card', title: 'Clic: añadir en el cursor · o arrástralo a la línea de tiempo', onclick: () => A.addOverlay('effect', { effect: k, intensity: 0.7 }, 3) }, h('span', { class: 'fx-emo' }, emo), h('span', {}, name));
    dragData(card, 'text/x-preset', 'fx:' + k);
    grid.append(card);
  }
  body.append(h('div', { class: 'sec-title' }, 'Efectos de vídeo'), grid,
    h('p', { class: 'hint' }, 'Los efectos se añaden en una pista superior y afectan a todo lo que hay debajo mientras duran.'));
  const c = selected();
  body.append(h('div', { class: 'sec-title' }, 'Filtros de color del clip seleccionado'));
  if (!c || !['video', 'image'].includes(c.kind)) body.append(h('div', { class: 'info-box' }, ih('circle-help', 16), h('span', {}, 'Selecciona un clip de vídeo o imagen para aplicarle un filtro.')));
  const thumb = c ? (c.kind === 'image' ? cache.urls.get(c.mediaId) : thumbFor(c.mediaId, c.in)) : null;
  const fg = h('div', { class: 'filter-grid big' });
  for (const [k, [name, vals]] of Object.entries(FILTER_PRESETS)) {
    const f = { ...DEFAULT_FILTERS, ...vals };
    fg.append(h('button', { class: 'filter-chip' + (c?.filterPreset === k ? ' on' : ''), disabled: !c || !['video', 'image'].includes(c.kind), onclick: () => { c.filters = { ...f }; c.filterPreset = k; commit(); } },
      h('div', { class: 'fimg', style: { backgroundImage: thumb ? `url("${thumb}")` : 'linear-gradient(135deg,#f97316,#8b5cf6 50%,#06b6d4)', filter: cssFilter(f) } }), h('span', {}, name)));
  }
  body.append(fg);
}

// ---------- Texto a voz ----------
const ttsState = { text: '', voice: 'es', speed: 1, subs: true, cache: new Map() };
function ttsSection() {
  const ta = h('textarea', { class: 'inp', rows: 3, placeholder: 'Escribe lo que quieres que diga la voz…' }, ttsState.text);
  ta.addEventListener('input', () => { ttsState.text = ta.value; });
  ta.addEventListener('keydown', e => e.stopPropagation());
  const sel = h('select', { class: 'inp' },
    h('optgroup', { label: 'Voces naturales (se descargan la primera vez)' }, ...NATURAL_VOICES.map(v => h('option', { value: 'n:' + v.id, selected: ttsState.voice === 'n:' + v.id }, `${v.label} · ${v.mb} MB`))),
    h('optgroup', { label: 'Voces básicas (sin conexión, instantáneas)' }, ...BASIC_VOICES.map(([id, l]) => h('option', { value: id, selected: ttsState.voice === id }, l))));
  sel.addEventListener('change', () => { ttsState.voice = sel.value; });
  const status = h('div', { class: 'hint tts-status' });
  const gen = async () => {
    const text = ttsState.text.trim(); if (!text) { toast('Escribe algún texto'); return null; }
    const key = [text, ttsState.voice, ttsState.speed].join('|');
    if (ttsState.cache.has(key)) return ttsState.cache.get(key);
    status.textContent = 'Generando voz…';
    try {
      let blob;
      if (ttsState.voice.startsWith('n:')) blob = await speakNatural(text, ttsState.voice.slice(2), { speed: ttsState.speed }, p => { status.textContent = `Descargando la voz (solo la primera vez)… ${Math.round(p * 100)} %`; });
      else blob = await speakBasic(text, ttsState.voice, { speed: ttsState.speed });
      ttsState.cache.set(key, blob); status.textContent = '';
      return blob;
    } catch (e) {
      console.warn(e);
      status.textContent = '';
      toast(ttsState.voice.startsWith('n:') ? 'No se pudo descargar la voz natural (¿sin internet o bloqueada en la red del centro?). Prueba con una voz básica.' : 'Error al generar la voz: ' + e.message, 'error', 7000);
      return null;
    }
  };
  let player = null;
  return h('div', { class: 'tts-box' },
    h('div', { class: 'sec-title' }, ih('speech', 13), ' Texto a voz'), ta, sel,
    slider({ label: 'Velocidad', value: ttsState.speed, min: 0.6, max: 1.6, step: 0.05, unit: '×', onInput: v => { ttsState.speed = v; } }),
    toggleCtl({ label: 'Crear también los subtítulos', value: ttsState.subs, onChange: v => { ttsState.subs = v; } }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', onclick: async () => { const b = await gen(); if (!b) return; player?.pause(); player = new Audio(URL.createObjectURL(b)); player.play(); } }, ih('play', 14), 'Escuchar'),
      h('button', { class: 'btn sm primary', onclick: async () => {
        const b = await gen(); if (!b) return;
        const words = ttsState.text.trim().split(/\s+/).slice(0, 4).join(' ');
        const m = await importFile(new File([b], `Voz - ${words}.wav`, { type: 'audio/wav' }));
        const start = store.time;
        const c = makeClip('audio', { mediaId: m.id, duration: m.duration, name: m.name });
        const tr = store.project.tracks.find(t => t.type === 'audio' && !t.locked && !overlaps(t.id, start, start + c.duration));
        placeClip(c, tr?.id, start);
        if (ttsState.subs) addSubtitles(chunkText(ttsState.text, start, start + m.duration, 7));
        select(c.id); commit(); toast('Voz añadida a la línea de tiempo', 'ok');
      } }, ih('plus', 14), 'Añadir al vídeo')),
    status);
}

// ---------- Biblioteca ----------
const lib = { tab: 'music', dur: 60, vars: {}, cache: new Map(), playing: null, playKey: null, q: { video: '', image: '', audio: '' }, res: {}, next: {}, loading: false };
function libraryPanel(body) {
  const tabs = h('div', { class: 'seg lib-tabs' }, ...[['music', 'Música'], ['video', 'Vídeos'], ['image', 'Fotos'], ['audio', 'Sonidos']].map(([k, l]) =>
    h('button', { class: lib.tab === k ? 'on' : '', onclick: () => { lib.tab = k; render(true); } }, l)));
  body.append(tabs);
  if (lib.tab === 'music') return musicLib(body);
  commonsLib(body, lib.tab);
}

function musicLib(body) {
  const dsel = h('select', { class: 'inp sm' }, ...[[30, '30 s'], [60, '1 min'], [120, '2 min'], [180, '3 min']].map(([v, l]) => h('option', { value: v, selected: lib.dur === v }, l)));
  dsel.addEventListener('change', () => { lib.dur = +dsel.value; });
  body.append(h('p', { class: 'hint' }, 'Música original creada en tu ordenador: sin derechos de autor y sin conexión. Cada versión es distinta.'),
    h('div', { class: 'row-ctl' }, h('label', { class: 'muted' }, 'Duración'), dsel));
  const list = h('div', { class: 'music-list' });
  for (const [k, st] of Object.entries(STYLES)) {
    const v = lib.vars[k] || 1;
    const status = h('span', { class: 'mstat' });
    const getBlob = async () => {
      const key = `${k}|${lib.dur}|${v}`;
      if (lib.cache.has(key)) return lib.cache.get(key);
      status.textContent = 'Componiendo…';
      try { const b = await generateMusic(k, lib.dur, v, p => { status.textContent = `Componiendo… ${Math.round(p * 100)} %`; }); lib.cache.set(key, b); return b; }
      finally { status.textContent = ''; }
    };
    const isPlaying = lib.playKey === k;
    list.append(h('div', { class: 'music-item' },
      h('div', { class: 'mi-emo' }, st.emoji),
      h('div', { class: 'mi-txt' }, h('b', {}, st.name), h('span', {}, `${st.desc} · ${st.bpm} bpm · versión ${v}`), status),
      h('div', { class: 'mi-btns' },
        h('button', { class: 'icon-btn sm', title: isPlaying ? 'Parar' : 'Escuchar', html: icon(isPlaying ? 'square' : 'play', 14), onclick: async () => {
          lib.playing?.pause(); if (isPlaying) { lib.playKey = null; render(); return; }
          const b = await getBlob(); lib.playing = new Audio(URL.createObjectURL(b)); lib.playing.play(); lib.playKey = k; lib.playing.onended = () => { lib.playKey = null; render(); }; render();
        } }),
        h('button', { class: 'icon-btn sm', title: 'Otra versión', html: icon('shuffle', 14), onclick: () => { lib.vars[k] = v + 1; lib.playing?.pause(); lib.playKey = null; render(); } }),
        h('button', { class: 'icon-btn sm add', title: 'Añadir al vídeo en el cursor', html: icon('plus', 14), onclick: async () => {
          const b = await getBlob();
          const m = await importFile(new File([b], `Música ${st.name} v${v}.wav`, { type: 'audio/wav' }));
          m.credit = { title: `${st.name} (versión ${v})`, source: 'generada' };
          const c = makeClip('audio', { mediaId: m.id, duration: m.duration, name: m.name, volume: 0.6, fadeOut: 2, duck: { enabled: true, amount: 0.3 } });
          const tr = store.project.tracks.find(t => t.type === 'audio' && !t.locked && !overlaps(t.id, store.time, store.time + c.duration));
          placeClip(c, tr?.id, store.time); select(c.id); commit();
          toast('Música añadida (se baja sola cuando alguien habla)', 'ok');
        } }))));
  }
  body.append(list);
}

function commonsLib(body, kind) {
  const K = STOCK_KINDS[kind];
  const inp = h('input', { class: 'inp', placeholder: 'Buscar (ej.: ' + K.ex.slice(0, 3).join(', ') + ')…', value: lib.q[kind] });
  const go = q => { lib.q[kind] = q; doSearch(kind, q, true); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(inp.value); });
  body.append(h('div', { class: 'search-row' }, inp, h('button', { class: 'btn sm primary', onclick: () => go(inp.value) }, ih('globe', 14), 'Buscar')),
    h('div', { class: 'chips' }, ...K.ex.map(x => h('button', { class: 'chip', onclick: () => { inp.value = x; go(x); } }, x))));
  const res = lib.res[kind];
  if (lib.loading) body.append(h('p', { class: 'hint center' }, 'Buscando en Wikimedia Commons…'));
  else if (res?.error) body.append(h('div', { class: 'info-box' }, ih('circle-help', 16), h('span', {}, res.error)));
  else if (!res) body.append(h('p', { class: 'hint' }, 'Material libre de Wikimedia Commons (licencias Creative Commons o dominio público). Al añadirlo se guardan el autor y la licencia para los créditos.'));
  else if (!res.items.length) body.append(h('p', { class: 'hint center' }, 'Sin resultados. Prueba con otra palabra (en inglés suele haber más).'));
  if (res?.items?.length) {
    const grid = h('div', { class: kind === 'audio' ? 'stock-list' : 'stock-grid' });
    for (const it of res.items) grid.append(stockCard(it));
    body.append(grid);
    if (lib.next[kind] != null) body.append(h('button', { class: 'btn sm block', onclick: () => doSearch(kind, lib.q[kind], false) }, 'Cargar más'));
  }
  body.append(h('div', { class: 'credits-box' },
    h('button', { class: 'btn sm', onclick: addCredits }, ih('clapperboard', 14), 'Añadir créditos al final del vídeo'),
    h('p', { class: 'hint' }, 'Las licencias CC BY y CC BY-SA obligan a citar al autor: este botón crea los créditos automáticamente.')));
}

async function doSearch(kind, q, fresh) {
  lib.loading = fresh; if (fresh) { lib.res[kind] = null; render(); }
  try {
    const r = await stockSearch(kind, q || STOCK_KINDS[kind].ex[0], fresh ? 0 : (lib.next[kind] || 0));
    lib.res[kind] = fresh ? { items: r.items } : { items: [...(lib.res[kind]?.items || []), ...r.items] };
    lib.next[kind] = r.next;
  } catch (e) {
    lib.res[kind] = { error: 'No se puede conectar con Wikimedia Commons. Comprueba la conexión a internet (o si la red del centro bloquea commons.wikimedia.org). La música generada funciona sin conexión.' };
  }
  lib.loading = false; render();
}

function stockCard(it) {
  const prog = h('div', { class: 'sc-prog' });
  const add = async e => {
    e?.stopPropagation();
    if (card.classList.contains('busy')) return;
    card.classList.add('busy');
    try {
      const m = await stockDownload(it, f => { prog.style.width = Math.round(f * 100) + '%'; });
      A.addMediaToTimeline(m);
      if (m.type === 'audio') { const c = selected(); if (c && it.duration > 30) { c.volume = 0.6; c.duck = { enabled: true, amount: 0.3 }; commit(); } }
      toast(`Añadido: ${it.title} (${it.license})`, 'ok');
    } catch (err) { toast('No se pudo añadir: ' + err.message, 'error'); }
    card.classList.remove('busy'); prog.style.width = '0';
  };
  const preview = () => {
    const media = it.kind === 'video' ? h('video', { src: it.url, controls: true, autoplay: true, class: 'done-video' }) : it.kind === 'audio' ? h('audio', { src: it.url, controls: true, autoplay: true, style: { width: '100%' } }) : h('img', { src: it.thumb?.replace(/\/\d+px-/, '/960px-') || it.url, class: 'done-video', style: { objectFit: 'contain' } });
    modal({ title: it.title, width: 640, body: h('div', {}, media,
      h('p', {}, h('b', {}, 'Autor: '), it.author), h('p', {}, h('b', {}, 'Licencia: '), it.license, it.duration ? ` · ${fmtTime(it.duration)}` : ''),
      h('p', {}, h('a', { href: it.page, target: '_blank', rel: 'noopener' }, 'Ver en Wikimedia Commons'))),
      buttons: [{ label: 'Cerrar' }, { label: 'Añadir al vídeo', primary: true, onClick: () => { add(); } }] });
  };
  const card = it.kind === 'audio'
    ? h('div', { class: 'stock-row', onclick: preview }, ih('music', 14), h('div', { class: 'sr-txt' }, h('b', {}, it.title), h('span', {}, `${it.author.slice(0, 40)} · ${it.license}${it.duration ? ' · ' + fmtTime(it.duration) : ''}`)),
        h('button', { class: 'icon-btn sm add', title: 'Añadir', html: icon('plus', 14), onclick: add }), prog)
    : h('div', { class: 'stock-card', title: `${it.title}\n${it.author} · ${it.license}`, onclick: preview },
        h('div', { class: 'sc-thumb', style: it.thumb ? { backgroundImage: `url("${it.thumb}")` } : {} },
          it.duration ? h('span', { class: 'mdur' }, fmtTime(it.duration)) : null, h('span', { class: 'sc-lic' }, it.license.replace('Public domain', 'Dominio público')),
          h('button', { class: 'madd', title: 'Añadir al vídeo', html: icon('plus', 16), onclick: add })),
        h('div', { class: 'mname' }, h('span', {}, it.title)), prog);
  return card;
}

function addCredits() {
  const text = creditsText();
  if (!text) { toast('No hay material de la biblioteca en la línea de tiempo'); return; }
  const end = store.project.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const keep = store.time; store.time = end;
  A.addOverlay('color', { color1: '#000000', gradient: false }, 6);
  A.addOverlay('text', { text, font: 'Roboto', size: 34, bold: false, lineHeight: 1.5, boxW: 0.85, animIn: { type: 'rise', duration: 1 } }, 6);
  store.time = keep; emit('time');
  toast('Créditos añadidos al final', 'ok');
}
