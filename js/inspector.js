// Panel de propiedades del clip seleccionado (o del proyecto)
import { store, on, emit, commit, selected, getMedia, getTrack, clipEnd, prop, setProp, hasKf, kfAt, toggleKf, prevAdjacent,
  trackClips, clamp, ASPECTS, fmtTime, projectDuration, mediaMaxDuration } from './state.js';
import { h, ih, slider, colorCtl, selectCtl, toggleCtl, segCtl, section, toast } from './ui.js';
import { icon } from './icons.js';
import { ANIMS, LOOPS, TRANSITIONS, FILTER_PRESETS, DEFAULT_FILTERS, cssFilter, clearTextCache, MASKS } from './renderer.js';
import { detectKeyColor } from './chroma.js';
import { VOICE_FX } from './audiofx.js';
import { EFFECTS } from './effects.js';
import { initSegmenter } from './segment.js';
import { requestRender, seekTo, play, resizeCanvas, getDrawable } from './player.js';
import { thumbFor, cache } from './media.js';
import { FONTS, ensureFonts } from './fonts.js';
import * as A from './actions.js';

let root, lastTab = {}, rebuildQueued = false;

export function initInspector(el) {
  root = el;
  on('select', build); on('project', build);
  on('liveEdit', queueBuild);
  on('time', () => { const c = selected(); if (!store.playing && c && c.kf && Object.keys(c.kf).length) queueBuild(); });
  on('focusText', () => { lastTab.text = 'Texto'; build(); setTimeout(() => root.querySelector('textarea')?.focus(), 30); });
  build();
}
function queueBuild() { if (rebuildQueued) return; rebuildQueued = true; requestAnimationFrame(() => { rebuildQueued = false; build(); }); }

const live = () => { requestRender(); };
const done = () => commit();

const TABS = {
  video: ['Básico', 'Color', 'Animación', 'Audio', 'Velocidad', 'Croma'],
  image: ['Básico', 'Color', 'Animación', 'Croma'],
  text: ['Texto', 'Básico', 'Animación'],
  shape: ['Forma', 'Básico', 'Animación'],
  color: ['Fondo', 'Básico', 'Animación'],
  audio: ['Audio', 'Velocidad'],
  subtitle: ['Subtítulo'],
  effect: ['Efecto'],
};
const KIND_NAME = { video: 'Vídeo', image: 'Imagen', text: 'Texto', shape: 'Forma', color: 'Fondo', audio: 'Audio', subtitle: 'Subtítulo', effect: 'Efecto' };

function build() {
  if (!root || !store.project) return;
  const scroll = root.querySelector('.insp-body')?.scrollTop || 0;
  root.replaceChildren();
  const c = selected();
  if (store.sel.size > 1) { root.append(multiPanel()); return; }
  if (!c) { root.append(projectPanel()); return; }
  const tabs = TABS[c.kind];
  let tab = lastTab[c.kind] && tabs.includes(lastTab[c.kind]) ? lastTab[c.kind] : tabs[0];
  const head = h('div', { class: 'insp-head' },
    h('div', { class: 'insp-title' }, ih({ video: 'film', image: 'image', text: 'type', shape: 'shapes', color: 'palette', audio: 'music', subtitle: 'captions', effect: 'sparkles' }[c.kind], 16),
      h('span', {}, KIND_NAME[c.kind]), h('small', {}, `${fmtTime(c.start, true)} → ${fmtTime(clipEnd(c), true)}`)),
    h('div', { class: 'tabs' }, ...tabs.map(t => h('button', { class: t === tab ? 'on' : '', onclick: () => { lastTab[c.kind] = t; build(); } }, t))));
  const body = h('div', { class: 'insp-body' });
  const fn = { 'Básico': basicTab, 'Color': colorTab, 'Animación': animTab, 'Audio': audioTab, 'Velocidad': speedTab, 'Croma': chromaTab,
    'Texto': textTab, 'Forma': shapeTab, 'Fondo': bgTab, 'Subtítulo': subtitleTab, 'Efecto': effectTab }[tab];
  body.append(...[].concat(fn(c)));
  root.append(head, body);
  body.scrollTop = scroll;
}

// ---------- Controles de transformación con fotogramas clave ----------
function kfBtn(c, name) {
  const local = clamp(store.time - c.start, 0, c.duration);
  const active = hasKf(c, name), here = active && kfAt(c, name, local);
  return h('button', { class: 'kf-btn' + (active ? ' has' : '') + (here ? ' here' : ''), title: here ? 'Quitar fotograma clave' : 'Añadir fotograma clave en el cursor (animar esta propiedad)',
    onclick: () => {
      if (store.time < c.start || store.time > clipEnd(c)) { toast('Coloca el cursor dentro del clip'); return; }
      toggleKf(c, name, local); commit();
    }, html: icon('diamond', 13) });
}
function tSlider(c, name, label, min, max, step, toUi, fromUi, unit) {
  const local = clamp(store.time - c.start, 0, c.duration);
  return slider({ label, value: toUi(prop(c, name, local)), min, max, step, unit, kf: kfBtn(c, name),
    onInput: v => { setProp(c, name, fromUi(v), clamp(store.time - c.start, 0, c.duration)); live(); }, onCommit: done });
}

function durationCtl(c) {
  if (c.kind === 'video' || c.kind === 'audio') return null;
  return slider({ label: 'Duración (s)', value: c.duration, min: 0.2, max: 60, step: 0.1, onInput: v => {
    const list = trackClips(c.trackId); const next = list[list.indexOf(c) + 1];
    c.duration = next ? Math.min(v, next.start - c.start) : v; live();
  }, onCommit: done });
}

function basicTab(c) {
  const out = [];
  const d = durationCtl(c); if (d) out.push(section('Duración', d));
  out.push(section('Posición y tamaño',
    tSlider(c, 'x', 'Posición X', -50, 150, 0.5, v => +(v * 100).toFixed(1), v => v / 100, '%'),
    tSlider(c, 'y', 'Posición Y', -50, 150, 0.5, v => +(v * 100).toFixed(1), v => v / 100, '%'),
    tSlider(c, 'scale', 'Escala', 5, 500, 1, v => Math.round(v * 100), v => v / 100, '%'),
    tSlider(c, 'rotation', 'Rotación', -180, 180, 1, v => Math.round(v), v => v, '°'),
    tSlider(c, 'opacity', 'Opacidad', 0, 100, 1, v => Math.round(v * 100), v => v / 100, '%'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', onclick: () => { c.x = 0.5; c.y = 0.5; delete c.kf?.x; delete c.kf?.y; commit(); } }, ih('crop', 14), 'Centrar'),
      h('button', { class: 'btn sm', onclick: () => { Object.assign(c, { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }); c.kf = {}; commit(); } }, ih('rotate-ccw', 14), 'Restablecer')),
    h('p', { class: 'hint' }, ih('diamond', 12), ' Pulsa el rombo para crear fotogramas clave: mueve el cursor, cambia el valor y el elemento se animará entre esos puntos.'),
  ));
  if (c.kind === 'video' || c.kind === 'image') {
    out.push(section('Encuadre',
      segCtl({ label: 'Ajuste al lienzo', value: c.fit, options: [['contain', 'Ajustar'], ['cover', 'Rellenar'], ['fill', 'Estirar']], onChange: v => { c.fit = v; commit(); } }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm' + (c.flipH ? ' on' : ''), onclick: () => { c.flipH = !c.flipH; commit(); } }, ih('flip-horizontal-2', 14), 'Voltear H'),
        h('button', { class: 'btn sm' + (c.flipV ? ' on' : ''), onclick: () => { c.flipV = !c.flipV; commit(); } }, ih('flip-vertical-2', 14), 'Voltear V')),
    ));
    out.push(section('Pantalla dividida (diseño)',
      h('div', { class: 'layout-grid' }, ...LAYOUTS.map(([k, name, r]) => h('button', { class: 'layout-btn', title: name, onclick: () => applyLayout(c, r) },
        h('div', { class: 'lb-box' }, h('div', { class: 'lb-in', style: { left: r[0] * 100 + '%', top: r[1] * 100 + '%', width: r[2] * 100 + '%', height: r[3] * 100 + '%' } }))))),
      h('p', { class: 'hint' }, 'Pon dos o más vídeos en pistas distintas y elige una zona para cada uno.')));
    out.push(section('Quitar fondo con IA (sin croma)',
      toggleCtl({ label: 'Quitar el fondo detrás de las personas', value: !!c.bgRemove, onChange: async v => {
        c.bgRemove = v; commit();
        if (v) { toast('Cargando la IA de recorte… (solo la primera vez)'); try { await initSegmenter(); requestRender(); toast('Fondo eliminado. Pon otro fondo en una pista por debajo.', 'ok'); } catch (e) { toast('No se pudo cargar la IA: ' + e.message, 'error'); } }
      } }),
      h('p', { class: 'hint' }, 'Funciona con personas (vídeos de cámara, entrevistas…). Va mejor con buena luz y un fondo que contraste.')));
    out.push(section('Forma, borde y sombra',
      selectCtl({ label: 'Máscara (forma del vídeo)', value: c.mask || 'none', options: MASKS, onChange: v => { c.mask = v; commit(); } }),
      c.mask === 'rounded' ? slider({ label: 'Redondeo', value: Math.round((c.maskRadius ?? 0.25) * 100), min: 0, max: 100, unit: '%', onInput: v => { c.maskRadius = v / 100; live(); }, onCommit: done }) : null,
      h('div', { class: 'row-ctl' },
        colorCtl({ label: 'Borde', value: c.borderColor || '#ffffff', onInput: v => { c.borderColor = v; live(); }, onCommit: done }),
        toggleCtl({ label: 'Sombra', value: c.dropShadow, onChange: v => { c.dropShadow = v; commit(); } })),
      slider({ label: 'Grosor del borde', value: c.borderWidth || 0, min: 0, max: 40, onInput: v => { c.borderWidth = v; live(); }, onCommit: done }),
      h('button', { class: 'btn sm', title: 'Círculo con borde en la esquina inferior derecha, ideal para la cámara', onclick: () => {
        Object.assign(c, { mask: 'circle', borderWidth: 8, borderColor: '#ffffff', dropShadow: true, scale: 0.4, x: 0.82, y: 0.72, fit: 'cover' }); c.kf = {}; commit();
      } }, ih('webcam', 14), 'Burbuja de cámara')));
    out.push(section('Recortar bordes',
      ...[['cropL', 'Izquierda'], ['cropR', 'Derecha'], ['cropT', 'Arriba'], ['cropB', 'Abajo']].map(([k, l]) =>
        slider({ label: l, value: Math.round(c[k] * 100), min: 0, max: 45, step: 1, unit: '%', onInput: v => { c[k] = v / 100; live(); }, onCommit: done }))));
  }
  out.push(section('Mezcla',
    selectCtl({ label: 'Modo de fusión', value: c.blend || 'source-over', options: [['source-over', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Trama (aclarar)'], ['overlay', 'Superponer'], ['darken', 'Oscurecer'], ['lighten', 'Aclarar'], ['difference', 'Diferencia'], ['color-dodge', 'Sobreexponer']], onChange: v => { c.blend = v; commit(); } })));
  return out;
}

function effectTab(c) {
  return [section('Efecto de vídeo',
    h('div', { class: 'fx-grid small' }, ...EFFECTS.map(([k, name, emo]) => h('button', { class: 'fx-card' + (c.effect === k ? ' on' : ''), onclick: () => { c.effect = k; commit(); } }, h('span', { class: 'fx-emo' }, emo), h('span', {}, name)))),
    slider({ label: 'Intensidad', value: Math.round((c.intensity ?? 0.7) * 100), min: 0, max: 100, unit: '%', onInput: v => { c.intensity = v / 100; live(); }, onCommit: done }),
    durationCtl(c),
    h('p', { class: 'hint' }, 'El efecto se aplica a todo lo que esté por debajo de esta pista mientras dure el clip. Alárgalo o acórtalo desde sus bordes en la línea de tiempo.'))];
}

const LAYOUTS = [['full', 'Completa', [0, 0, 1, 1]], ['left', 'Mitad izquierda', [0, 0, .5, 1]], ['right', 'Mitad derecha', [.5, 0, .5, 1]], ['top', 'Mitad superior', [0, 0, 1, .5]], ['bottom', 'Mitad inferior', [0, .5, 1, .5]],
  ['q1', 'Cuarto sup. izq.', [0, 0, .5, .5]], ['q2', 'Cuarto sup. der.', [.5, 0, .5, .5]], ['q3', 'Cuarto inf. izq.', [0, .5, .5, .5]], ['q4', 'Cuarto inf. der.', [.5, .5, .5, .5]], ['pip', 'Ventana pequeña', [.66, .64, .3, .3]]];
function applyLayout(c, rect) {
  const [rx, ry, rw, rh] = rect, { width: W, height: H } = store.project.settings;
  const m = getMedia(c.mediaId); if (!m) return;
  const ra = (rw * W) / (rh * H), ma = m.width / m.height;
  let cl = 0, ct = 0;
  if (ma > ra) cl = (1 - ra / ma) / 2; else ct = (1 - ma / ra) / 2;
  Object.assign(c, { cropL: cl, cropR: cl, cropT: ct, cropB: ct, fit: 'contain', x: rx + rw / 2, y: ry + rh / 2, rotation: 0 });
  // tamaño base al ajustar el recorte (aspecto ra) dentro del lienzo
  const baseW = ra > W / H ? W : H * ra;
  c.scale = +(rw * W / baseW).toFixed(4);
  c.kf = {}; commit();
}

function colorTab(c) {
  const thumb = c.kind === 'image' ? cache.urls.get(c.mediaId) : thumbFor(c.mediaId, c.in);
  const grid = h('div', { class: 'filter-grid' }, ...Object.entries(FILTER_PRESETS).map(([k, [name, vals]]) => {
    const f = { ...DEFAULT_FILTERS, ...vals };
    return h('button', { class: 'filter-chip' + (c.filterPreset === k ? ' on' : ''), onclick: () => { c.filters = { ...DEFAULT_FILTERS, ...vals }; c.filterPreset = k; commit(); } },
      h('div', { class: 'fimg', style: { backgroundImage: thumb ? `url("${thumb}")` : '', filter: cssFilter(f) } }), h('span', {}, name));
  }));
  const f = c.filters;
  const sl = (k, label, min, max, unit = '') => slider({ label, value: f[k], min, max, step: 1, unit, onInput: v => { f[k] = v; c.filterPreset = 'custom'; live(); }, onCommit: done });
  return [
    section('Filtros', grid),
    section('Ajustes',
      sl('brightness', 'Brillo', 0, 200, '%'), sl('contrast', 'Contraste', 0, 200, '%'), sl('saturation', 'Saturación', 0, 300, '%'),
      sl('temperature', 'Temperatura', -100, 100), sl('hue', 'Tono', -180, 180, '°'), sl('vignette', 'Viñeta', 0, 100, '%'),
      sl('blur', 'Desenfoque', 0, 40, 'px'), sl('grayscale', 'Escala de grises', 0, 100, '%'), sl('sepia', 'Sepia', 0, 100, '%'), sl('invert', 'Invertir', 0, 100, '%'),
      h('button', { class: 'btn sm', onclick: () => { c.filters = { ...DEFAULT_FILTERS }; c.filterPreset = 'none'; commit(); } }, ih('rotate-ccw', 14), 'Restablecer color')),
  ];
}

function animTab(c) {
  const opts = c.kind === 'text' ? ANIMS : ANIMS.filter(a => a[0] !== 'typewriter');
  const maxD = Math.max(0.2, Math.min(5, c.duration));
  const out = [
    section('Entrada',
      selectCtl({ value: c.animIn.type, options: opts, onChange: v => { c.animIn.type = v; commit(); previewAnim(c, 'in'); } }),
      slider({ label: 'Duración', value: c.animIn.duration, min: 0.1, max: maxD, step: 0.1, unit: ' s', onInput: v => { c.animIn.duration = v; live(); }, onCommit: done })),
    section('Salida',
      selectCtl({ value: c.animOut.type, options: opts, onChange: v => { c.animOut.type = v; commit(); previewAnim(c, 'out'); } }),
      slider({ label: 'Duración', value: c.animOut.duration, min: 0.1, max: maxD, step: 0.1, unit: ' s', onInput: v => { c.animOut.duration = v; live(); }, onCommit: done })),
    section('Animación continua',
      selectCtl({ value: c.animLoop.type, options: LOOPS, onChange: v => { c.animLoop.type = v; commit(); previewAnim(c, 'loop'); } }),
      slider({ label: 'Intensidad / velocidad', value: c.animLoop.speed ?? 1, min: 0.2, max: 3, step: 0.1, unit: '×', onInput: v => { c.animLoop.speed = v; live(); }, onCommit: done })),
  ];
  if (prevAdjacent(c)) {
    const tr = c.transition || { type: 'none', duration: 0.8 };
    out.push(section('Transición desde el clip anterior',
      selectCtl({ value: tr.type, options: [['none', 'Ninguna'], ...TRANSITIONS], onChange: v => { c.transition = v === 'none' ? null : { type: v, duration: tr.duration || 0.8 }; commit(); previewAnim(c, 'trans'); } }),
      slider({ label: 'Duración', value: tr.duration, min: 0.2, max: 3, step: 0.1, unit: ' s', onInput: v => { if (c.transition) { c.transition.duration = v; live(); } }, onCommit: done })));
  }
  out.push(h('button', { class: 'btn sm', onclick: () => previewAnim(c, 'in') }, ih('play', 14), 'Ver el clip'));
  return out;
}

function previewAnim(c, which) {
  const t = which === 'out' ? Math.max(c.start, clipEnd(c) - (c.animOut.duration + 0.5)) : which === 'trans' ? Math.max(0, c.start - (c.transition?.duration || 1)) : c.start;
  seekTo(t); play();
}

function audioTab(c) {
  const m = getMedia(c.mediaId);
  if (c.kind === 'video' && m?.hasAudio === false) return [section('Audio', h('p', { class: 'hint' }, 'Este vídeo no tiene pista de sonido.'))];
  if (c.kind === 'video' && c.audioDetached) return [section('Audio', h('p', { class: 'hint' }, 'El audio de este vídeo está separado en una pista de audio. Selecciona ese clip para editarlo.'),
    h('button', { class: 'btn sm', onclick: () => { c.audioDetached = false; commit(); } }, 'Volver a activar el audio original'))];
  const maxF = Math.max(0.1, Math.min(10, c.duration / 2));
  const local = clamp(store.time - c.start, 0, c.duration);
  c.duck ||= { enabled: false, amount: 0.25 };
  return [section('Sonido',
    slider({ label: 'Volumen', value: Math.round(prop(c, 'volume', local) * 100), min: 0, max: 200, step: 1, unit: '%', kf: kfBtn(c, 'volume'), onInput: v => { setProp(c, 'volume', v / 100, clamp(store.time - c.start, 0, c.duration)); live(); }, onCommit: done }),
    slider({ label: 'Aparecer (fundido de entrada)', value: c.fadeIn, min: 0, max: maxF, step: 0.1, unit: ' s', onInput: v => { c.fadeIn = v; }, onCommit: done }),
    slider({ label: 'Desaparecer (fundido de salida)', value: c.fadeOut, min: 0, max: maxF, step: 0.1, unit: ' s', onInput: v => { c.fadeOut = v; }, onCommit: done }),
    toggleCtl({ label: 'Silenciar este clip', value: c.muted, onChange: v => { c.muted = v; commit(); } }),
    c.kind === 'video' ? h('button', { class: 'btn sm', onclick: () => A.detachAudio(c) }, ih('audio-lines', 14), 'Separar audio a su pista') : null,
  ), section('Efecto de voz',
    selectCtl({ value: c.audioFx || 'none', options: VOICE_FX, onChange: v => { c.audioFx = v; commit(); } }),
    h('p', { class: 'hint' }, '«Mejorar voz» quita graves molestos, iguala el volumen y da más claridad. Úsalo en las voces en off.'),
  ), section('Bajar automáticamente cuando hay voz',
    toggleCtl({ label: 'Atenuar este audio cuando suene otro clip (ideal para la música de fondo)', value: c.duck.enabled, onChange: v => { c.duck.enabled = v; commit(); } }),
    c.duck.enabled ? slider({ label: 'Volumen mientras se habla', value: Math.round((c.duck.amount ?? 0.25) * 100), min: 0, max: 90, unit: '%', onInput: v => { c.duck.amount = v / 100; }, onCommit: done }) : null,
  )];
}

function speedTab(c) {
  let pending = c.speed;
  const setSpeed = v => {
    v = clamp(+v, 0.1, 8);
    const old = c.speed, oldEnd = clipEnd(c);
    const srcLen = c.duration * old;
    c.speed = v;
    let nd = srcLen / v;
    nd = Math.min(nd, mediaMaxDuration(c));
    c.duration = nd;
    const delta = clipEnd(c) - oldEnd;
    for (const x of trackClips(c.trackId)) if (x !== c && x.start >= oldEnd - 0.01) x.start += delta;
    commit();
  };
  return [section('Velocidad',
    segCtl({ value: c.speed, options: [[0.25, '0.25×'], [0.5, '0.5×'], [1, '1×'], [1.5, '1.5×'], [2, '2×'], [4, '4×']], onChange: setSpeed }),
    slider({ label: 'Personalizada', value: c.speed, min: 0.1, max: 8, step: 0.05, unit: '×', onInput: v => { pending = v; }, onCommit: () => setSpeed(pending) }),
    h('p', { class: 'hint' }, 'Cámara lenta (< 1×) o rápida (> 1×). La duración del clip cambia y los clips siguientes se desplazan. El tono del sonido también cambia.'),
  ), section('Al revés',
    h('button', { class: 'btn sm', onclick: () => import('./reverse.js').then(r => r.reverseClip(c)) }, ih('rotate-ccw', 14), c.reversed ? 'Volver a invertir (normal)' : 'Invertir clip (reproducir al revés)'),
    h('p', { class: 'hint' }, 'Crea una copia invertida del trozo usado. Puede tardar unos segundos.'))];
}

function chromaTab(c) {
  const k = c.chroma;
  const detect = () => {
    const src = getDrawable(c);
    const col = src && detectKeyColor(src);
    if (!col) { toast('Coloca el cursor sobre el clip para detectar el color'); return false; }
    k.color = col; k.enabled = true; commit(); toast('Color de fondo detectado: ' + col, 'ok'); return true;
  };
  return [section('Croma (quitar fondo verde o azul)',
    h('ol', { class: 'steps' },
      h('li', {}, 'Pon este clip en una pista ', h('b', {}, 'por encima'), ' del fondo que quieras ver detrás.'),
      h('li', {}, 'Activa «Quitar color de fondo» (el color se detecta solo).'),
      h('li', {}, 'Si quedan restos verdes, sube la ', h('b', {}, 'Tolerancia'), '; si se borra parte de la persona, bájala.')),
    toggleCtl({ label: 'Quitar color de fondo', value: k.enabled, onChange: v => { k.enabled = v; if (v && !k.detected) { k.detected = true; if (!detect()) commit(); } else commit(); } }),
    h('div', { class: 'row-ctl' },
      colorCtl({ label: 'Color a quitar', value: k.color, onInput: v => { k.color = v; live(); }, onCommit: done }),
      h('button', { class: 'btn sm', onclick: detect, title: 'Analiza los bordes del fotograma actual' }, ih('wand-sparkles', 14), 'Detectar')),
    h('div', { class: 'btn-row' },
      window.EyeDropper ? h('button', { class: 'btn sm', title: 'Haz clic sobre el fondo en la vista previa', onclick: async () => { try { const r = await new EyeDropper().open(); k.color = r.sRGBHex; k.enabled = true; commit(); } catch {} } }, ih('crop', 14), 'Cuentagotas') : null,
      h('button', { class: 'btn sm', onclick: () => { k.color = '#00ff00'; k.enabled = true; commit(); } }, h('span', { class: 'dot', style: { background: '#00d000' } }), 'Verde'),
      h('button', { class: 'btn sm', onclick: () => { k.color = '#0047ff'; k.enabled = true; commit(); } }, h('span', { class: 'dot', style: { background: '#0047ff' } }), 'Azul')),
    slider({ label: 'Tolerancia', value: Math.round(k.similarity * 100), min: 1, max: 100, unit: '%', onInput: v => { k.similarity = v / 100; live(); }, onCommit: done }),
    slider({ label: 'Suavizado de bordes', value: Math.round(k.smoothness * 100), min: 0, max: 100, unit: '%', onInput: v => { k.smoothness = v / 100; live(); }, onCommit: done }),
    slider({ label: 'Quitar reflejo verde', value: Math.round(k.spill * 100), min: 0, max: 100, unit: '%', onInput: v => { k.spill = v / 100; live(); }, onCommit: done }),
    h('p', { class: 'hint' }, 'Consejo para grabar: fondo verde liso y bien iluminado, sin arrugas ni sombras, y nada de ropa verde.'),
  )];
}

function fontSelect(value, onChange) {
  const s = selectCtl({ label: 'Fuente', value, options: FONTS.map(f => [f, f]), onChange: async v => { await ensureFonts([v]); clearTextCache(); onChange(v); } });
  s.querySelectorAll('option').forEach(o => { o.style.fontFamily = `"${o.value}"`; });
  return s;
}

function textTab(c) {
  const ta = h('textarea', { class: 'inp text-area', rows: 3 }, c.text);
  ta.addEventListener('input', () => { c.text = ta.value; live(); });
  ta.addEventListener('change', done);
  ta.addEventListener('keydown', e => e.stopPropagation());
  return [
    section('Texto', ta,
      fontSelect(c.font, v => { c.font = v; commit(); }),
      slider({ label: 'Tamaño', value: c.size, min: 10, max: 400, step: 1, unit: 'px', onInput: v => { c.size = v; live(); }, onCommit: done }),
      h('div', { class: 'row-ctl' },
        colorCtl({ label: 'Color', value: c.color, onInput: v => { c.color = v; live(); }, onCommit: done }),
        h('div', { class: 'seg' },
          ...[['bold', 'N', 'Negrita'], ['italic', 'I', 'Cursiva'], ['underline', 'S', 'Subrayado']].map(([k, l, t]) =>
            h('button', { class: c[k] ? 'on' : '', title: t, style: { fontWeight: k === 'bold' ? 800 : 400, fontStyle: k === 'italic' ? 'italic' : 'normal', textDecoration: k === 'underline' ? 'underline' : 'none' }, onclick: () => { c[k] = !c[k]; clearTextCache(); commit(); } }, l)))),
      segCtl({ label: 'Alineación', value: c.align, options: [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], onChange: v => { c.align = v; commit(); } }),
    ),
    section('Contorno y sombra',
      h('div', { class: 'row-ctl' }, colorCtl({ label: 'Contorno', value: c.strokeColor, onInput: v => { c.strokeColor = v; live(); }, onCommit: done }),
        toggleCtl({ label: 'Sombra', value: c.shadow, onChange: v => { c.shadow = v; commit(); } })),
      slider({ label: 'Grosor del contorno', value: c.strokeWidth, min: 0, max: 20, step: 0.5, onInput: v => { c.strokeWidth = v; live(); }, onCommit: done })),
    section('Fondo del texto',
      colorCtl({ label: 'Color de fondo', value: c.bgColor, onInput: v => { c.bgColor = v; live(); }, onCommit: done }),
      slider({ label: 'Opacidad del fondo', value: Math.round(c.bgOpacity * 100), min: 0, max: 100, unit: '%', onInput: v => { c.bgOpacity = v / 100; clearTextCache(); live(); }, onCommit: done }),
      slider({ label: 'Esquinas redondeadas', value: c.bgRadius, min: 0, max: 80, onInput: v => { c.bgRadius = v; live(); }, onCommit: done })),
    section('Espaciado',
      slider({ label: 'Interlineado', value: c.lineHeight, min: 0.8, max: 3, step: 0.05, onInput: v => { c.lineHeight = v; live(); }, onCommit: done }),
      slider({ label: 'Espacio entre letras', value: c.letterSpacing, min: -10, max: 60, step: 1, onInput: v => { c.letterSpacing = v; live(); }, onCommit: done }),
      slider({ label: 'Ancho máximo', value: Math.round(c.boxW * 100), min: 10, max: 100, unit: '%', onInput: v => { c.boxW = v / 100; live(); }, onCommit: done })),
  ];
}

function shapeTab(c) {
  return [section('Forma',
    selectCtl({ label: 'Tipo', value: c.shape, options: [['rect', 'Rectángulo'], ['ellipse', 'Círculo / elipse'], ['triangle', 'Triángulo'], ['star', 'Estrella'], ['arrow', 'Flecha'], ['heart', 'Corazón'], ['line', 'Línea']], onChange: v => { c.shape = v; commit(); } }),
    h('div', { class: 'row-ctl' },
      colorCtl({ label: 'Relleno', value: c.fill === 'transparent' ? '#000000' : c.fill, onInput: v => { c.fill = v; live(); }, onCommit: done }),
      toggleCtl({ label: 'Sin relleno', value: c.fill === 'transparent', onChange: v => { c.fill = v ? 'transparent' : '#7c5cff'; commit(); } })),
    colorCtl({ label: 'Borde', value: c.stroke, onInput: v => { c.stroke = v; live(); }, onCommit: done }),
    slider({ label: 'Grosor del borde', value: c.strokeWidth, min: 0, max: 40, onInput: v => { c.strokeWidth = v; live(); }, onCommit: done }),
    c.shape === 'rect' ? slider({ label: 'Esquinas redondeadas', value: c.radius, min: 0, max: 300, onInput: v => { c.radius = v; live(); }, onCommit: done }) : null,
    slider({ label: 'Ancho', value: Math.round(c.w * 100), min: 1, max: 150, unit: '%', onInput: v => { c.w = v / 100; live(); }, onCommit: done }),
    slider({ label: 'Alto', value: Math.round(c.h * 100), min: 1, max: 150, unit: '%', onInput: v => { c.h = v / 100; live(); }, onCommit: done }),
  )];
}

function bgTab(c) {
  return [section('Fondo de color',
    colorCtl({ label: 'Color 1', value: c.color1, onInput: v => { c.color1 = v; live(); }, onCommit: done }),
    toggleCtl({ label: 'Degradado', value: c.gradient, onChange: v => { c.gradient = v; commit(); } }),
    c.gradient ? colorCtl({ label: 'Color 2', value: c.color2, onInput: v => { c.color2 = v; live(); }, onCommit: done }) : null,
    c.gradient ? slider({ label: 'Ángulo', value: c.angle, min: 0, max: 360, unit: '°', onInput: v => { c.angle = v; live(); }, onCommit: done }) : null,
  ), durationCtl(c)];
}

function subtitleTab(c) {
  const tr = getTrack(c.trackId); const s = tr.style;
  const ta = h('textarea', { class: 'inp text-area', rows: 3 }, c.text);
  ta.addEventListener('input', () => { c.text = ta.value; live(); });
  ta.addEventListener('change', done);
  ta.addEventListener('keydown', e => e.stopPropagation());
  const upd = () => { clearTextCache(); live(); };
  return [
    section('Texto del subtítulo', ta,
      h('div', { class: 'row-ctl' },
        slider({ label: 'Inicio (s)', value: +c.start.toFixed(2), min: 0, max: Math.max(10, projectDuration() + 10), step: 0.05, onInput: v => { c.start = v; live(); }, onCommit: done }),
      ),
      slider({ label: 'Duración (s)', value: +c.duration.toFixed(2), min: 0.2, max: 15, step: 0.05, onInput: v => { c.duration = v; live(); }, onCommit: done })),
    section('Estilo de todos los subtítulos de la pista',
      fontSelect(s.font, v => { s.font = v; commit(); }),
      slider({ label: 'Tamaño', value: s.size, min: 16, max: 160, onInput: v => { s.size = v; upd(); }, onCommit: done }),
      h('div', { class: 'row-ctl' },
        colorCtl({ label: 'Color', value: s.color, onInput: v => { s.color = v; live(); }, onCommit: done }),
        toggleCtl({ label: 'Negrita', value: s.bold, onChange: v => { s.bold = v; clearTextCache(); commit(); } })),
      colorCtl({ label: 'Fondo', value: s.bg, onInput: v => { s.bg = v; live(); }, onCommit: done }),
      slider({ label: 'Opacidad del fondo', value: Math.round(s.bgOpacity * 100), min: 0, max: 100, unit: '%', onInput: v => { s.bgOpacity = v / 100; upd(); }, onCommit: done }),
      colorCtl({ label: 'Contorno', value: s.strokeColor, onInput: v => { s.strokeColor = v; live(); }, onCommit: done }),
      slider({ label: 'Grosor del contorno', value: s.stroke, min: 0, max: 12, step: 0.5, onInput: v => { s.stroke = v; live(); }, onCommit: done }),
      slider({ label: 'Posición vertical', value: Math.round(s.y * 100), min: 5, max: 95, unit: '%', onInput: v => { s.y = v / 100; live(); }, onCommit: done }),
      h('div', { class: 'row-ctl' },
        toggleCtl({ label: 'Estilo karaoke (resaltar palabras)', value: !!s.karaoke, onChange: v => { s.karaoke = v; commit(); } }),
        s.karaoke ? colorCtl({ label: 'Resaltado', value: s.karaokeColor || '#ffd600', onInput: v => { s.karaokeColor = v; live(); }, onCommit: done }) : null)),
  ];
}

function multiPanel() {
  const clips = [...store.sel].map(id => store.project.clips.find(c => c.id === id)).filter(Boolean);
  const sound = clips.filter(c => c.kind === 'video' || c.kind === 'audio');
  const vis = clips.filter(c => !['audio', 'subtitle'].includes(c.kind));
  const wrap = h('div', { class: 'insp-body' });
  wrap.append(h('div', { class: 'insp-head' }, h('div', { class: 'insp-title' }, ih('layers', 16), h('span', {}, `${clips.length} clips seleccionados`))),
    section('Acciones',
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm', onclick: A.duplicateSelected }, ih('copy', 14), 'Duplicar'),
        h('button', { class: 'btn sm', onclick: A.copySelected }, ih('copy', 14), 'Copiar'),
        h('button', { class: 'btn sm danger', onclick: () => A.deleteSelected(false) }, ih('trash-2', 14), 'Eliminar')),
      h('p', { class: 'hint' }, 'Arrastra cualquiera de ellos en la línea de tiempo para moverlos todos a la vez. Mayús o Ctrl + clic añade o quita clips de la selección.')),
    sound.length ? section('Volumen de todos', slider({ label: 'Volumen', value: Math.round(sound[0].volume * 100), min: 0, max: 200, unit: '%', onInput: v => { sound.forEach(c => { c.volume = v / 100; }); }, onCommit: done })) : null,
    vis.length ? section('Aspecto de todos',
      slider({ label: 'Opacidad', value: Math.round((vis[0].opacity ?? 1) * 100), min: 0, max: 100, unit: '%', onInput: v => { vis.forEach(c => { c.opacity = v / 100; }); live(); }, onCommit: done }),
      vis.some(c => c.kind === 'video' || c.kind === 'image') ? h('div', { class: 'filter-grid' }, ...Object.entries(FILTER_PRESETS).slice(0, 8).map(([k, [name, vals]]) =>
        h('button', { class: 'filter-chip', onclick: () => { vis.forEach(c => { if (c.filters) { c.filters = { ...DEFAULT_FILTERS, ...vals }; c.filterPreset = k; } }); commit(); } },
          h('div', { class: 'fimg', style: { background: 'linear-gradient(135deg,#f97316,#8b5cf6 50%,#06b6d4)', filter: cssFilter({ ...DEFAULT_FILTERS, ...vals }) } }), h('span', {}, name)))) : null) : null,
  );
  return wrap;
}

function projectPanel() {
  const p = store.project, s = p.settings;
  const wrap = h('div', { class: 'insp-body' });
  wrap.append(
    h('div', { class: 'insp-head' }, h('div', { class: 'insp-title' }, ih('settings-2', 16), h('span', {}, 'Proyecto'))),
    section('Formato del vídeo',
      selectCtl({ value: s.aspect, options: Object.entries(ASPECTS).map(([k, v]) => [k, v.label]), onChange: v => { s.aspect = v; s.width = ASPECTS[v].w; s.height = ASPECTS[v].h; clearTextCache(); commit(); resizeCanvas(); } }),
      selectCtl({ label: 'Fotogramas por segundo', value: String(s.fps), options: [['24', '24 fps (cine)'], ['25', '25 fps'], ['30', '30 fps (recomendado)'], ['60', '60 fps (fluido, exporta más lento)']], onChange: v => { s.fps = +v; commit(); } })),
    section('Fondo del lienzo',
      segCtl({ value: s.bgMode, options: [['color', 'Color'], ['blur', 'Desenfocado']], onChange: v => { s.bgMode = v; commit(); } }),
      colorCtl({ label: 'Color de fondo', value: s.bgColor, onInput: v => { s.bgColor = v; live(); }, onCommit: done }),
      h('p', { class: 'hint' }, '«Desenfocado» rellena los huecos con una versión borrosa del vídeo (útil al pasar vídeo vertical a horizontal).')),
    section('Resumen',
      h('p', { class: 'stat' }, `Duración: ${fmtTime(projectDuration(), true)} · Clips: ${p.clips.length} · Archivos: ${p.media.length}`),
      h('p', { class: 'hint' }, 'Selecciona un clip en la línea de tiempo o en la vista previa para editar sus propiedades.')),
  );
  return wrap;
}
