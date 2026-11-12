// Utilidades de interfaz: elementos, modales, avisos, menús, controles
import { icon } from './icons.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const ih = (name, size) => { const s = document.createElement('span'); s.className = 'icw'; s.innerHTML = icon(name, size); return s; };

export function toast(msg, type = 'info', ms = 3500) {
  const t = h('div', { class: `toast ${type}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

export function modal({ title, body, buttons = [], width = 480, onClose, closable = true }) {
  const root = document.getElementById('modalRoot');
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = e => { if (e.key === 'Escape' && closable) close(); };
  const footer = h('div', { class: 'modal-foot' }, ...buttons.map(b => h('button', { class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`, onclick: () => { if (b.onClick?.() !== false) close(); } }, b.label)));
  const box = h('div', { class: 'modal', style: { width: `min(${width}px, 94vw)` } },
    h('div', { class: 'modal-head' }, h('h3', {}, title), closable ? h('button', { class: 'icon-btn', title: 'Cerrar', onclick: close, html: icon('x') }) : null),
    h('div', { class: 'modal-body' }, body), buttons.length ? footer : null);
  const wrap = h('div', { class: 'modal-wrap', onmousedown: e => { if (e.target === wrap && closable) close(); } }, box);
  root.append(wrap);
  document.addEventListener('keydown', esc);
  return { close, box, footer };
}

export function confirmDialog(title, text, okLabel = 'Aceptar', danger = false) {
  return new Promise(res => {
    let v = false;
    modal({ title, body: h('p', {}, text), onClose: () => res(v), buttons: [{ label: 'Cancelar' }, { label: okLabel, primary: !danger, danger, onClick: () => { v = true; } }] });
  });
}

export function promptDialog(title, value = '', label = '') {
  return new Promise(res => {
    let v = null;
    const inp = h('input', { class: 'inp', value });
    const m = modal({ title, body: h('div', {}, label ? h('label', { class: 'lbl' }, label) : null, inp), onClose: () => res(v), buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, onClick: () => { v = inp.value; } }] });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { v = inp.value; m.close(); } });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

let menuEl = null;
export function contextMenu(x, y, items) {
  closeMenu();
  menuEl = h('div', { class: 'ctx-menu' }, ...items.map(it => it === '-' ? h('div', { class: 'sep' }) :
    h('button', { class: it.danger ? 'danger' : '', disabled: it.disabled, onclick: () => { closeMenu(); it.action(); } }, it.icon ? ih(it.icon, 15) : null, h('span', {}, it.label), it.key ? h('kbd', {}, it.key) : null)));
  document.body.append(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  menuEl.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
}
function outside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
export function closeMenu() { menuEl?.remove(); menuEl = null; document.removeEventListener('mousedown', outside); }

export function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

export function pickFiles(accept, multiple = true) {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept, multiple });
    i.onchange = () => res([...i.files]);
    i.click();
  });
}

// ---------- Controles del inspector ----------
// onInput: cambio en vivo; onCommit: fin del gesto (guardar en historial)
export function slider({ label, value, min, max, step = 1, unit = '', onInput, onCommit, kf, fmt }) {
  const show = v => fmt ? fmt(v) : (Math.round(v * 100) / 100) + unit;
  const num = h('input', { class: 'num', type: 'number', min, max, step, value: +(+value).toFixed(3) });
  const rng = h('input', { type: 'range', min, max, step, value });
  const out = h('span', { class: 'val' }, show(value));
  rng.addEventListener('input', () => { num.value = rng.value; out.textContent = show(+rng.value); onInput(+rng.value); });
  rng.addEventListener('change', () => onCommit?.());
  num.addEventListener('change', () => { const v = Math.max(min, Math.min(max, +num.value)); rng.value = v; onInput(v); onCommit?.(); });
  rng.addEventListener('dblclick', () => { });
  const row = h('div', { class: 'ctl slider' }, h('div', { class: 'ctl-head' }, h('label', {}, label), kf || null, num), rng);
  row.set = v => { rng.value = v; num.value = +(+v).toFixed(3); out.textContent = show(v); };
  return row;
}

export function colorCtl({ label, value, onInput, onCommit }) {
  const inp = h('input', { type: 'color', value });
  inp.addEventListener('input', () => onInput(inp.value));
  inp.addEventListener('change', () => onCommit?.());
  return h('div', { class: 'ctl inline' }, h('label', {}, label), inp);
}

export function selectCtl({ label, value, options, onChange }) {
  const s = h('select', { class: 'inp' }, ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  s.addEventListener('change', () => onChange(s.value));
  return h('div', { class: 'ctl' }, label ? h('label', {}, label) : null, s);
}

export function toggleCtl({ label, value, onChange }) {
  const i = h('input', { type: 'checkbox', checked: !!value });
  i.addEventListener('change', () => onChange(i.checked));
  return h('label', { class: 'ctl toggle' }, i, h('span', { class: 'sw' }), h('span', {}, label));
}

export function segCtl({ label, value, options, onChange }) {
  const wrap = h('div', { class: 'seg' });
  for (const [v, l, ic] of options) {
    const b = h('button', { class: v === value ? 'on' : '', title: l, onclick: () => { wrap.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); onChange(v); } }, ic ? ih(ic, 16) : l);
    wrap.append(b);
  }
  return h('div', { class: 'ctl' }, label ? h('label', {}, label) : null, wrap);
}

export function section(title, ...children) {
  return h('div', { class: 'sec' }, title ? h('div', { class: 'sec-title' }, title) : null, ...children);
}
