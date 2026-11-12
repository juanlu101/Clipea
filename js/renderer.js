// Composición de un fotograma en un canvas 2D
import { visualItemsAt, subtitleItemsAt, prop, getMedia, clamp } from './state.js';
import { chromaKey } from './chroma.js';
import { applyEffect } from './effects.js';
import { getMask } from './segment.js';

const easeOut = x => 1 - Math.pow(1 - x, 3);
const backOut = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const bounceOut = x => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };

export const ANIMS = [
  ['none', 'Ninguna'], ['fade', 'Fundido'], ['slide-left', 'Deslizar izquierda'], ['slide-right', 'Deslizar derecha'],
  ['rise', 'Subir'], ['drop', 'Bajar'], ['zoom-in', 'Ampliar'], ['zoom-out', 'Reducir'], ['pop', 'Rebote (pop)'],
  ['bounce', 'Caída con rebote'], ['spin', 'Girar'], ['blur', 'Desenfoque'], ['wipe', 'Barrido'], ['typewriter', 'Máquina de escribir (texto)'],
];
export const LOOPS = [
  ['none', 'Ninguna'], ['kenburns-in', 'Zoom lento hacia dentro'], ['kenburns-out', 'Zoom lento hacia fuera'], ['pan-left', 'Panorámica izquierda'],
  ['pan-right', 'Panorámica derecha'], ['pulse', 'Latido'], ['float', 'Flotar'], ['swing', 'Balanceo'], ['shake', 'Temblor'], ['rotate', 'Rotación continua'], ['blink', 'Parpadeo'],
];
export const TRANSITIONS = [
  ['crossfade', 'Fundido cruzado'], ['dip', 'Fundido a negro'], ['flash', 'Destello blanco'], ['slide-left', 'Empujar izquierda'],
  ['slide-right', 'Empujar derecha'], ['slide-up', 'Empujar arriba'], ['slide-down', 'Empujar abajo'], ['wipe-left', 'Cortina izquierda'],
  ['wipe-right', 'Cortina derecha'], ['wipe-up', 'Cortina arriba'], ['wipe-down', 'Cortina abajo'], ['circle', 'Círculo'],
  ['zoom', 'Zoom'], ['blur', 'Desenfoque'], ['spin', 'Remolino'],
];

export const FILTER_PRESETS = {
  none:     ['Original',  {}],
  bw:       ['Blanco y negro', { grayscale: 100, contrast: 110 }],
  sepia:    ['Sepia',     { sepia: 80, contrast: 105 }],
  vintage:  ['Vintage',   { sepia: 35, contrast: 90, saturation: 80, brightness: 105, vignette: 40 }],
  warm:     ['Cálido',    { temperature: 40, saturation: 110 }],
  cold:     ['Frío',      { temperature: -40, saturation: 95 }],
  vivid:    ['Vívido',    { saturation: 150, contrast: 115 }],
  drama:    ['Drama',     { contrast: 140, saturation: 80, brightness: 92, vignette: 55 }],
  faded:    ['Desvaído',  { contrast: 80, saturation: 70, brightness: 110 }],
  night:    ['Noche',     { brightness: 70, temperature: -55, contrast: 110 }],
  cinema:   ['Cine',      { contrast: 120, saturation: 85, temperature: 15, vignette: 45 }],
  noir:     ['Noir',      { grayscale: 100, contrast: 160, brightness: 90, vignette: 60 }],
  pop:      ['Pop',       { saturation: 190, contrast: 120, hue: 10 }],
  dream:    ['Sueño',     { blur: 1, brightness: 112, saturation: 120, contrast: 90 }],
  invert:   ['Negativo',  { invert: 100 }],
  alien:    ['Alien',     { hue: 120, saturation: 140 }],
};
export const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, temperature: 0, vignette: 0 };

export function cssFilter(f, scale = 1, extraBlur = 0) {
  if (!f) return 'none';
  const parts = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
  if (f.invert) parts.push(`invert(${f.invert}%)`);
  const b = (f.blur || 0) + extraBlur;
  if (b > 0.01) parts.push(`blur(${(b * scale).toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

// ---------- Texto ----------
const mctx = document.createElement('canvas').getContext('2d');
const layoutCache = new Map();
export function fontString(c, px) { return `${c.italic ? 'italic ' : ''}${c.bold ? 700 : 400} ${px}px "${c.font}", Arial, sans-serif, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`; }

export function textLayout(c, W, H) {
  const key = [c.text, c.font, c.size, c.bold, c.italic, c.lineHeight, c.letterSpacing, c.boxW, c.bgOpacity > 0, W, H].join('|');
  let L = layoutCache.get(key); if (L) return L;
  const k = H / 1080, px = Math.max(1, c.size * k);
  mctx.font = fontString(c, px);
  mctx.letterSpacing = `${(c.letterSpacing || 0) * k}px`;
  const maxW = (c.boxW || 0.9) * W;
  const lines = [];
  for (const para of String(c.text ?? '').split('\n')) {
    const words = para.split(' ');
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (mctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    lines.push(cur);
  }
  const lh = px * (c.lineHeight || 1.2);
  const widths = lines.map(l => mctx.measureText(l).width);
  const pad = c.bgOpacity > 0 ? px * 0.35 : 0;
  const w = Math.max(10, ...widths) + pad * 2;
  const h = lh * lines.length + pad * 2;
  L = { lines, widths, lh, px, w, h, pad, font: mctx.font, ls: mctx.letterSpacing };
  if (layoutCache.size > 400) layoutCache.clear();
  layoutCache.set(key, L);
  return L;
}
export function clearTextCache() { layoutCache.clear(); }

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)) : ctx.rect(x, y, w, h); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }

function drawText(ctx, c, L, W, H, chars = 1, kp = null) {
  const k = H / 1080;
  const x0 = -L.w / 2, y0 = -L.h / 2;
  if (c.bgOpacity > 0) { ctx.fillStyle = hexA(c.bgColor, c.bgOpacity); roundRect(ctx, x0, y0, L.w, L.h, (c.bgRadius || 0) * k); ctx.fill(); }
  ctx.font = L.font; ctx.letterSpacing = L.ls; ctx.textBaseline = 'middle';
  let total = L.lines.reduce((s, l) => s + l.length, 0);
  let kwIndex = 0;
  let budget = chars >= 1 ? Infinity : Math.floor(total * chars);
  ctx.lineJoin = 'round';
  L.lines.forEach((line, i) => {
    if (budget <= 0) return;
    const text = budget < line.length ? line.slice(0, budget) : line; budget -= line.length;
    const lw = L.widths[i];
    let x = c.align === 'left' ? x0 + L.pad : c.align === 'right' ? x0 + L.w - L.pad - lw : -lw / 2;
    const y = y0 + L.pad + L.lh * (i + 0.5);
    ctx.textAlign = 'left';
    if (c.shadow) { ctx.shadowColor = hexA(c.shadowColor || '#000000', 0.6); ctx.shadowBlur = 12 * k; ctx.shadowOffsetX = 3 * k; ctx.shadowOffsetY = 3 * k; }
    if (c.strokeWidth > 0) { ctx.strokeStyle = c.strokeColor; ctx.lineWidth = c.strokeWidth * k * 2; ctx.strokeText(text, x, y); ctx.shadowColor = 'transparent'; }
    if (kp != null) {
      // resaltado palabra a palabra (karaoke)
      const words = text.split(' ');
      let xx = x;
      for (const w of words) {
        const done = kwIndex < kp.n;
        ctx.fillStyle = done ? c.karaokeColor : c.color;
        ctx.fillText(w, xx, y);
        xx += ctx.measureText(w + ' ').width; kwIndex++;
      }
    } else { ctx.fillStyle = c.color; ctx.fillText(text, x, y); }
    if (c.underline) { ctx.fillRect(x, y + L.px * 0.45, mctx.measureText ? ctx.measureText(text).width : lw, Math.max(2, L.px * 0.06)); }
    ctx.shadowColor = 'transparent';
  });
}

function drawShape(ctx, c, w, h, k, pathOnly = false) {
  if (!pathOnly) ctx.beginPath();
  const x = -w / 2, y = -h / 2;
  switch (c.shape) {
    case 'ellipse': ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'triangle': ctx.moveTo(0, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break;
    case 'star': for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.45 : 1, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * w / 2 * r, Math.sin(a) * h / 2 * r); } ctx.closePath(); break;
    case 'arrow': ctx.moveTo(x, y + h * 0.3); ctx.lineTo(x + w * 0.6, y + h * 0.3); ctx.lineTo(x + w * 0.6, y); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 0.6, y + h); ctx.lineTo(x + w * 0.6, y + h * 0.7); ctx.lineTo(x, y + h * 0.7); ctx.closePath(); break;
    case 'heart': { ctx.moveTo(0, y + h * 0.3); ctx.bezierCurveTo(0, y, x, y, x, y + h * 0.3); ctx.bezierCurveTo(x, y + h * 0.6, 0, y + h * 0.8, 0, y + h); ctx.bezierCurveTo(0, y + h * 0.8, x + w, y + h * 0.6, x + w, y + h * 0.3); ctx.bezierCurveTo(x + w, y, 0, y, 0, y + h * 0.3); break; }
    case 'line': ctx.rect(x, -Math.max(2, h * 0.04), w, Math.max(4, h * 0.08)); break;
    default: if (c.radius > 0) ctx.roundRect(x, y, w, h, Math.min(c.radius * k, w / 2, h / 2)); else ctx.rect(x, y, w, h);
  }
  if (pathOnly) return;
  if (c.fill && c.fill !== 'transparent') { ctx.fillStyle = c.fill; ctx.fill(); }
  if (c.strokeWidth > 0) { ctx.strokeStyle = c.stroke; ctx.lineWidth = c.strokeWidth * k; ctx.stroke(); }
}

// Tamaño base (sin escala) de un clip visual
export function baseSize(c, W, H) {
  if (c.kind === 'text') { const L = textLayout(c, W, H); return [L.w, L.h]; }
  if (c.kind === 'shape') return [c.w * W, c.h * H];
  if (c.kind === 'color' || c.kind === 'effect') return [W, H];
  const m = getMedia(c.mediaId);
  const sw = (m?.width || 16) * (1 - c.cropL - c.cropR), sh = (m?.height || 9) * (1 - c.cropT - c.cropB);
  const a = sw / sh, ca = W / H;
  if (c.fit === 'fill') return [W, H];
  if ((c.fit === 'cover') === (a > ca)) return [H * a, H];
  return [W, W / a];
}

function applyAnim(type, p, dir, e, W, H) {
  const v = easeOut(clamp(p, 0, 1)), sgn = dir === 'in' ? 1 : -1;
  switch (type) {
    case 'fade': e.alpha *= v; break;
    case 'slide-left': e.dx -= (1 - v) * W; break;
    case 'slide-right': e.dx += (1 - v) * W; break;
    case 'rise': e.dy += sgn * (1 - v) * H * 0.25; e.alpha *= v; break;
    case 'drop': e.dy -= sgn * (1 - v) * H * 0.25; e.alpha *= v; break;
    case 'zoom-in': e.s *= 0.3 + 0.7 * v; e.alpha *= v; break;
    case 'zoom-out': e.s *= 1 + (1 - v) * 1.2; e.alpha *= v; break;
    case 'pop': e.s *= dir === 'in' ? Math.max(0.001, backOut(clamp(p, 0, 1))) : Math.max(0.001, v); break;
    case 'bounce': if (dir === 'in') e.dy -= (1 - bounceOut(clamp(p, 0, 1))) * H * 0.5; else e.alpha *= v; break;
    case 'spin': e.rot += sgn * (1 - v) * -360; e.s *= Math.max(0.001, v); break;
    case 'blur': e.blur += (1 - v) * 30; e.alpha *= v; break;
    case 'wipe': e.wipe = Math.min(e.wipe, v); break;
    case 'typewriter': e.chars = Math.min(e.chars, clamp(p, 0, 1)); break;
  }
}

function applyLoop(type, sp, l, D, e, W, H) {
  const f = D > 0 ? clamp(l / D, 0, 1) : 0;
  switch (type) {
    case 'kenburns-in': e.s *= 1 + 0.18 * f * sp; break;
    case 'kenburns-out': e.s *= 1 + 0.18 * (1 - f) * sp; break;
    case 'pan-left': e.s *= 1.15; e.dx += (0.5 - f) * W * 0.12 * sp; break;
    case 'pan-right': e.s *= 1.15; e.dx -= (0.5 - f) * W * 0.12 * sp; break;
    case 'pulse': e.s *= 1 + 0.06 * Math.sin(l * Math.PI * 2 * sp); break;
    case 'float': e.dy += Math.sin(l * 2.2 * sp) * H * 0.02; break;
    case 'swing': e.rot += Math.sin(l * 3 * sp) * 8; break;
    case 'shake': e.dx += Math.sin(l * 53 * sp) * W * 0.006; e.dy += Math.cos(l * 47 * sp) * H * 0.006; break;
    case 'rotate': e.rot += l * 90 * sp; break;
    case 'blink': e.alpha *= Math.sin(l * 6 * sp) > 0 ? 1 : 0.2; break;
  }
}

function applyTrans(tr, e, W, H) {
  const p = tr.p, inn = tr.role === 'in';
  switch (tr.type) {
    case 'crossfade': if (inn) e.alpha *= p; break;
    case 'dip': e.alpha *= inn ? clamp(2 * p - 1, 0, 1) : clamp(1 - 2 * p, 0, 1); break;
    case 'flash': if (inn) { e.alpha *= p >= 0.5 ? 1 : 0; e.flash = 1 - Math.abs(2 * p - 1); } else e.alpha *= p < 0.5 ? 1 : 0; break;
    case 'slide-left': e.dx += inn ? (1 - p) * W : -p * W; break;
    case 'slide-right': e.dx += inn ? -(1 - p) * W : p * W; break;
    case 'slide-up': e.dy += inn ? (1 - p) * H : -p * H; break;
    case 'slide-down': e.dy += inn ? -(1 - p) * H : p * H; break;
    case 'wipe-left': case 'wipe-right': case 'wipe-up': case 'wipe-down': case 'circle': if (inn) e.screenClip = { type: tr.type, p }; break;
    case 'zoom': if (inn) { e.s *= 0.6 + 0.4 * p; e.alpha *= p; } else { e.s *= 1 + p; e.alpha *= 1 - p; } break;
    case 'blur': if (inn) { e.blur += (1 - p) * 25; e.alpha *= p; } else e.blur += p * 25; break;
    case 'spin': if (inn) { e.rot -= (1 - p) * 180; e.s *= Math.max(0.001, p); e.alpha *= p; } break;
  }
}

// Geometría y efectos de un elemento en el tiempo t
export function geometry(item, W, H) {
  const c = item.clip, l = item.t - c.start, D = c.duration;
  const e = { alpha: 1, dx: 0, dy: 0, s: 1, rot: 0, blur: 0, wipe: 1, chars: 1, flash: 0, screenClip: null };
  if (!item.trans || item.trans.role !== 'in') {
    const di = Math.min(c.animIn?.duration || 0, D);
    if (c.animIn && c.animIn.type !== 'none' && l < di) applyAnim(c.animIn.type, l / di, 'in', e, W, H);
  }
  if (!item.trans || item.trans.role !== 'out') {
    const dout = Math.min(c.animOut?.duration || 0, D);
    if (c.animOut && c.animOut.type !== 'none' && D - l < dout) applyAnim(c.animOut.type, (D - l) / dout, 'out', e, W, H);
  }
  if (c.animLoop && c.animLoop.type !== 'none') applyLoop(c.animLoop.type, c.animLoop.speed || 1, l, D, e, W, H);
  if (item.trans) applyTrans(item.trans, e, W, H);
  const lc = clamp(l, 0, D);
  const [bw, bh] = baseSize(c, W, H);
  const sc = prop(c, 'scale', lc) * e.s;
  return {
    cx: prop(c, 'x', lc) * W + e.dx, cy: prop(c, 'y', lc) * H + e.dy,
    w: bw * sc, h: bh * sc, bw, bh, scale: sc,
    rot: (prop(c, 'rotation', lc) + e.rot) * Math.PI / 180,
    alpha: clamp(prop(c, 'opacity', lc) * e.alpha, 0, 1),
    blur: e.blur, wipe: e.wipe, chars: e.chars, flash: e.flash, screenClip: e.screenClip,
  };
}

function screenClipPath(ctx, sc, W, H) {
  const p = sc.p; ctx.beginPath();
  if (sc.type === 'wipe-left') ctx.rect(W * (1 - p), 0, W * p + 1, H);
  else if (sc.type === 'wipe-right') ctx.rect(0, 0, W * p, H);
  else if (sc.type === 'wipe-up') ctx.rect(0, H * (1 - p), W, H * p + 1);
  else if (sc.type === 'wipe-down') ctx.rect(0, 0, W, H * p);
  else if (sc.type === 'circle') ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * p, 0, Math.PI * 2);
  ctx.clip();
}

function drawMedia(ctx, c, src, w, h) {
  const sw = src.videoWidth || src.naturalWidth || src.displayWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.displayHeight || src.height;
  if (!sw || !sh) return;
  let img = src, iw = sw, ih = sh;
  if (c.chroma?.enabled) {
    const cw = Math.min(sw, Math.max(64, Math.round(w))), chh = Math.round(cw * sh / sw);
    img = chromaKey(src, cw, chh, c.chroma); iw = img.width; ih = img.height;
  }
  ctx.drawImage(img, c.cropL * iw, c.cropT * ih, iw * (1 - c.cropL - c.cropR), ih * (1 - c.cropT - c.cropB), -w / 2, -h / 2, w, h);
}

function drawItem(ctx, item, W, H, getDrawable) {
  const c = item.clip;
  const g = geometry(item, W, H);
  if (g.alpha <= 0.001 || g.w < 0.5 || g.h < 0.5) { if (g.flash) flash(ctx, g.flash, W, H); return; }
  const k = H / 1080;
  ctx.save();
  if (g.screenClip) screenClipPath(ctx, g.screenClip, W, H);
  ctx.globalAlpha = g.alpha;
  ctx.globalCompositeOperation = c.blend || 'source-over';
  ctx.translate(g.cx, g.cy); ctx.rotate(g.rot);
  ctx.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
  if (g.wipe < 1) { ctx.beginPath(); ctx.rect(-g.w / 2, -g.h / 2, g.w * g.wipe, g.h); ctx.clip(); }
  const filt = cssFilter(c.filters, k, g.blur);
  if (c.kind === 'video' || c.kind === 'image') {
    const src = getDrawable(c, item.t);
    if (src) drawMediaFull(ctx, c, src, g.w, g.h, k, filt);
    ctx.restore();
    if (g.flash) flash(ctx, g.flash, W, H);
    return;
  }
  if (filt !== 'none') ctx.filter = filt;
  if (c.kind === 'color') {
    if (c.gradient) {
      const a = (c.angle || 0) * Math.PI / 180, r = Math.hypot(g.w, g.h) / 2;
      const gr = ctx.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
      gr.addColorStop(0, c.color1); gr.addColorStop(1, c.color2); ctx.fillStyle = gr;
    } else ctx.fillStyle = c.color1;
    if (c.mask && c.mask !== 'none') { ctx.save(); maskPath(ctx, c, g.w, g.h); ctx.fill(); ctx.restore(); if (c.borderWidth > 0) { maskPath(ctx, c, g.w, g.h); ctx.lineWidth = c.borderWidth * k; ctx.strokeStyle = c.borderColor || '#fff'; ctx.stroke(); } }
    else ctx.fillRect(-g.w / 2, -g.h / 2, g.w, g.h);
    if (c.placeholder) {
      const fs = Math.max(10, Math.min(g.w, g.h) * 0.07);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${fs * 1.6}px Inter, Arial, sans-serif`; ctx.fillText('⬇', 0, -fs * 1.2);
      ctx.font = `600 ${fs}px Inter, Arial, sans-serif`; ctx.fillText(c.name || 'Arrastra aquí tu vídeo o foto', 0, fs * 0.4, g.w * 0.9);
      ctx.font = `400 ${fs * 0.65}px Inter, Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('Arrastra aquí un archivo de «Multimedia»', 0, fs * 1.5, g.w * 0.9);
    }
  } else if (c.kind === 'shape') {
    ctx.scale(g.scale, g.scale); drawShape(ctx, c, g.bw, g.bh, k);
  } else if (c.kind === 'text') {
    let kp = null;
    if (c.karaoke) { const nw = String(c.text).split(/\s+/).filter(Boolean).length; kp = { n: Math.ceil(nw * Math.max(0, Math.min(1, (item.t - c.start) / Math.max(0.1, c.duration * 0.9)))) }; }
    ctx.scale(g.scale, g.scale); drawText(ctx, c, textLayout(c, W, H), W, H, g.chars, kp);
  }
  ctx.filter = 'none';
  const f = c.filters;
  if (f && (f.vignette > 0 || f.temperature) && c.kind === 'color') {
    ctx.globalCompositeOperation = 'source-atop';
    if (f.temperature) { ctx.globalAlpha = g.alpha * Math.abs(f.temperature) / 100 * 0.35; ctx.fillStyle = f.temperature > 0 ? '#ff8a00' : '#0077ff'; ctx.fillRect(-g.w / 2, -g.h / 2, g.w, g.h); }
    if (f.vignette > 0) {
      ctx.globalAlpha = g.alpha * f.vignette / 100;
      const r = Math.hypot(g.w, g.h) / 2;
      const gr = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = gr; ctx.fillRect(-g.w / 2, -g.h / 2, g.w, g.h);
    }
  }
  ctx.restore();
  if (g.flash) flash(ctx, g.flash, W, H);
}

// Máscara (forma) de un clip de vídeo/imagen
export const MASKS = [['none', 'Ninguna'], ['rounded', 'Esquinas redondeadas'], ['circle', 'Círculo'], ['ellipse', 'Óvalo'], ['heart', 'Corazón'], ['star', 'Estrella']];
function maskPath(ctx, c, w, h) {
  ctx.beginPath();
  const m = c.mask, x = -w / 2, y = -h / 2;
  if (m === 'rounded') { const r = Math.min(w, h) / 2 * (c.maskRadius ?? 0.25); ctx.roundRect(x, y, w, h, r); }
  else if (m === 'circle') ctx.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2);
  else if (m === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (m === 'heart' || m === 'star') drawShape(ctx, { shape: m }, Math.min(w, h), Math.min(w, h), 1, true);
  else ctx.rect(x, y, w, h);
}
const layers = [document.createElement('canvas')];
function drawMediaFull(ctx, c, src, w, h, k, filt) {
  const f = c.filters || {};
  const masked = c.mask && c.mask !== 'none';
  const mask = c.bgRemove ? getMask(c.id) : null;
  const overlays = f.vignette > 0 || f.temperature || mask;
  if (c.dropShadow) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40 * k; ctx.shadowOffsetY = 12 * k; ctx.fillStyle = '#000';
    maskPath(ctx, c, w, h); ctx.fill(); ctx.restore();
  }
  ctx.save();
  if (masked) { maskPath(ctx, c, w, h); ctx.clip(); }
  if (!overlays) {
    if (filt !== 'none') ctx.filter = filt;
    drawMedia(ctx, c, src, w, h);
    ctx.filter = 'none';
  } else {
    // capa intermedia para que temperatura y viñeta solo afecten a este clip
    const L = layers[0], lw = Math.max(2, Math.ceil(Math.abs(w))), lh = Math.max(2, Math.ceil(Math.abs(h)));
    if (L.width !== lw || L.height !== lh) { L.width = lw; L.height = lh; }
    const lx = L.getContext('2d');
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.globalAlpha = 1; lx.clearRect(0, 0, lw, lh);
    lx.filter = filt; lx.translate(lw / 2, lh / 2); drawMedia(lx, c, src, lw, lh); lx.filter = 'none';
    if (mask) {
      const mw = mask.width, mh = mask.height;
      lx.globalCompositeOperation = 'destination-in'; lx.filter = `blur(${Math.max(1, lw / 400)}px)`;
      if (c.flipH || c.flipV) { /* el volteo ya se aplica al dibujar la capa */ }
      lx.drawImage(mask, c.cropL * mw, c.cropT * mh, mw * (1 - c.cropL - c.cropR), mh * (1 - c.cropT - c.cropB), -lw / 2, -lh / 2, lw, lh);
      lx.filter = 'none';
    }
    lx.globalCompositeOperation = 'source-atop';
    if (f.temperature) { lx.globalAlpha = Math.abs(f.temperature) / 100 * 0.35; lx.fillStyle = f.temperature > 0 ? '#ff8a00' : '#0077ff'; lx.fillRect(-lw / 2, -lh / 2, lw, lh); }
    if (f.vignette > 0) {
      lx.globalAlpha = f.vignette / 100;
      const r = Math.hypot(lw, lh) / 2, gr = lx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      lx.fillStyle = gr; lx.fillRect(-lw / 2, -lh / 2, lw, lh);
    }
    ctx.drawImage(L, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
  if (c.borderWidth > 0) { maskPath(ctx, c, w, h); ctx.lineWidth = c.borderWidth * k; ctx.strokeStyle = c.borderColor || '#ffffff'; ctx.stroke(); }
}

function flash(ctx, a, W, H) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }

export function subtitleClipFor(item) {
  const s = item.track.style || {};
  return {
    kind: 'text', text: item.clip.text, font: s.font || 'Roboto', size: s.size || 54, color: s.color || '#fff', bold: s.bold !== false, italic: false,
    align: 'center', strokeColor: s.strokeColor || '#000', strokeWidth: s.stroke || 0, shadow: true, shadowColor: '#000000',
    bgColor: s.bg || '#000000', bgOpacity: s.bgOpacity ?? 0.55, bgRadius: 10, lineHeight: 1.2, letterSpacing: 0, boxW: 0.9,
    x: 0.5, y: s.y ?? 0.88, scale: 1, rotation: 0, opacity: 1, kf: {},
    karaoke: !!s.karaoke, karaokeColor: s.karaokeColor || '#ffd600',
  };
}

// Dibuja el fotograma completo
export function renderFrame(ctx, W, H, t, project, getDrawable) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = project.settings.bgColor || '#000'; ctx.fillRect(0, 0, W, H);
  const items = visualItemsAt(t, project);
  if (project.settings.bgMode === 'blur') {
    const base = items.find(i => i.clip.kind === 'video' || i.clip.kind === 'image');
    if (base) {
      const src = getDrawable(base.clip, t);
      if (src) {
        const sw = src.videoWidth || src.naturalWidth || src.displayWidth, sh = src.videoHeight || src.naturalHeight || src.displayHeight;
        if (sw && sh) {
          const s = Math.max(W / sw, H / sh) * 1.1;
          ctx.filter = `blur(${Math.round(40 * H / 1080)}px) brightness(0.7)`;
          ctx.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
          ctx.filter = 'none';
        }
      }
    }
  }
  for (const it of items) { if (it.clip.kind === 'effect') applyEffect(ctx, W, H, it.clip, t); else drawItem(ctx, it, W, H, getDrawable); }
  for (const s of subtitleItemsAt(t, project)) {
    const c = subtitleClipFor(s);
    drawItem(ctx, { clip: { ...c, start: s.clip.start, duration: s.clip.duration, animIn: { type: 'none' }, animOut: { type: 'none' } }, t, trans: null }, W, H, getDrawable);
  }
  ctx.restore();
}
