// Generador de música original (sintetizada en el navegador): libre de derechos y sin conexión
import { encodeWAV } from './sfx.js';

export const STYLES = {
  lofi:        { name: 'Lo-fi tranquilo', desc: 'Relajado, para estudiar o vlogs', emoji: '☕', bpm: 78, key: 2, minor: false, prog: [[1, 7], [4, 7], [0, 7], [5, 7]], swing: 0.16 },
  pop:         { name: 'Pop alegre', desc: 'Optimista y pegadizo', emoji: '😄', bpm: 116, key: 0, minor: false, prog: [[0], [4], [5], [3]] },
  epica:       { name: 'Épica', desc: 'Tráileres, deportes, momentos grandes', emoji: '🏔️', bpm: 92, key: 9, minor: true, prog: [[0], [5], [2], [6]] },
  electro:     { name: 'Electrónica', desc: 'Energía y ritmo de baile', emoji: '🎧', bpm: 124, key: 5, minor: true, prog: [[0], [5], [3], [4]] },
  ambient:     { name: 'Ambiente', desc: 'Calma, naturaleza, espacio', emoji: '🌌', bpm: 66, key: 4, minor: false, prog: [[0, 9], [3, 9], [5, 7], [3, 9]] },
  suspense:    { name: 'Suspense', desc: 'Misterio y tensión', emoji: '🕵️', bpm: 96, key: 1, minor: true, prog: [[0], [0], [5], [4]] },
  documental:  { name: 'Documental', desc: 'Ciencia, historia, reportajes', emoji: '🔬', bpm: 100, key: 7, minor: false, prog: [[3], [0], [4], [5]] },
  hiphop:      { name: 'Hip hop', desc: 'Ritmo urbano con piano', emoji: '🎤', bpm: 88, key: 10, minor: true, prog: [[0, 7], [5, 7], [3, 7], [4, 7]], swing: 0.12 },
  rock:        { name: 'Rock', desc: 'Guitarras con fuerza', emoji: '🎸', bpm: 132, key: 4, minor: true, prog: [[0], [5], [2], [6]] },
  infantil:    { name: 'Divertida', desc: 'Infantil, humor, animales', emoji: '🎈', bpm: 138, key: 7, minor: false, prog: [[0], [3], [4], [0]] },
  corporativo: { name: 'Tecnología', desc: 'Presentaciones e inventos', emoji: '💡', bpm: 112, key: 2, minor: false, prog: [[0], [5], [3], [4]] },
  emotivo:     { name: 'Emotiva', desc: 'Recuerdos, despedidas, homenajes', emoji: '🕊️', bpm: 70, key: 9, minor: true, prog: [[5], [3], [0], [4]] },
};

const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export async function generateMusic(styleKey, seconds = 60, variation = 1, onProgress) {
  const S = STYLES[styleKey]; if (!S) throw new Error('Estilo desconocido');
  const sr = 44100, ctx = new OfflineAudioContext(2, Math.ceil(sr * (seconds + 0.1)), sr);
  const R = rng(variation * 7919 + Object.keys(STYLES).indexOf(styleKey) * 104729);
  const scale = S.minor ? MIN : MAJ, root = 48 + S.key; // C3 + tono
  const beat = 60 / S.bpm, bar = beat * 4, step = beat / 4;
  const nBars = Math.max(2, Math.ceil(seconds / bar));

  // ---- bus maestro ----
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
  let out = master;
  if (styleKey === 'lofi') { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800; master.connect(lp); out = lp; }
  out.connect(comp).connect(ctx.destination);
  master.gain.setValueAtTime(0.9, 0); master.gain.setValueAtTime(0.9, Math.max(0, seconds - 3)); master.gain.linearRampToValueAtTime(0, seconds);
  const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, styleKey === 'ambient' || styleKey === 'epica' ? 4 : 2.2); const revG = ctx.createGain(); revG.gain.value = 0.35; rev.connect(revG).connect(master);
  const bus = (vol, pan = 0, send = 0) => { const g = ctx.createGain(); g.gain.value = vol; const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(master); if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(rev); } return g; };
  const B = {
    drums: bus(0.9, 0, 0.12), hats: bus(0.35, 0.25), bass: bus(0.75), pad: bus(0.22, 0, 0.6), keys: bus(0.4, -0.1, 0.4), arp: bus(0.25, 0.2, 0.45),
    lead: bus(0.3, -0.05, 0.4), strings: bus(0.28, 0, 0.6), gtr: bus(0.32), bell: bus(0.3, 0.15, 0.6),
  };
  const DEF = { kick: 'drums', snare: 'drums', clap: 'drums', tom: 'drums', hat: 'hats', shaker: 'hats', bass: 'bass', pad: 'pad', strings: 'strings', epiano: 'keys', piano: 'keys', pluck: 'arp', lead: 'lead', bell: 'bell', power: 'gtr' };
  // Primero se anotan los eventos; luego cada nota distinta se sintetiza una sola vez y se reutiliza
  const events = [];
  const I = new Proxy({}, { get: (_, name) => (t, ...args) => {
    let bus = B[DEF[name]];
    if (args.length && args[args.length - 1] instanceof AudioNode) bus = args.pop();
    if (t < seconds) events.push({ name, t, args: args.map(a => Array.isArray(a) ? a : (typeof a === 'number' ? Math.round(a * 1000) / 1000 : a)), bus });
  } });

  // ---- armonía y melodía ----
  const chordNotes = (deg, ext, oct = 0) => {
    const n = [0, 2, 4].map(i => scale[(deg + i) % 7] + 12 * Math.floor((deg + i) / 7));
    if (ext === 7) n.push(scale[(deg + 6) % 7] + 12 * Math.floor((deg + 6) / 7));
    if (ext === 9) n.push(scale[(deg + 8) % 7] + 12 * Math.floor((deg + 8) / 7));
    return n.map(x => root + 12 + x + oct * 12);
  };
  const scaleNote = (idx) => root + 24 + scale[((idx % 7) + 7) % 7] + 12 * Math.floor(idx / 7);
  // en los tiempos fuertes la melodía cae en una nota del acorde (suena más consonante)
  const mel = (p, i, ch, oct = 12) => { const n = scaleNote(p) + oct; if (i % 2) return n; const cands = ch.flatMap(m => [m + oct, m + 12 + oct, m - 12 + oct]); return cands.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a); };
  const motif = []; { let p = 2; for (let i = 0; i < 8; i++) { p += [-2, -1, 1, 2, 0, 1, -1][Math.floor(R() * 7)]; p = Math.max(-1, Math.min(9, p)); motif.push({ p, rest: R() < 0.2 && i % 2 === 1, len: R() < 0.3 ? 2 : 1 }); } }

  // forma: intro, A, B, A, puente, B, final
  const form = [];
  const pushSec = (name, n) => { for (let i = 0; i < n; i++) form.push(name); };
  pushSec('intro', 2); while (form.length < nBars) { pushSec('A', 8); pushSec('B', 8); if (R() < 0.6) pushSec('break', 4); }
  form.length = nBars; if (nBars > 6) { form[nBars - 1] = 'outro'; form[nBars - 2] = 'outro'; }

  const sw = S.swing || 0, stepT = (b, s) => b * bar + s * step + (s % 2 === 1 ? sw * step * 2 : 0);
  for (let b = 0; b < nBars; b++) {
    const sec = form[b], t0 = b * bar;
    if (t0 > seconds) break;
    const [deg, ext] = S.prog[b % S.prog.length];
    const ch = chordNotes(deg, ext), bassNote = root - 12 + scale[deg % 7];
    const full = sec === 'A' || sec === 'B', B2 = sec === 'B', intro = sec === 'intro' || sec === 'outro', brk = sec === 'break';
    const play = (fn, ...a) => fn(...a);
    switch (styleKey) {
      case 'lofi':
        ch.forEach((m, i) => play(I.epiano, t0 + i * 0.02, m, bar * 0.95, 0.22));
        if (!intro) { for (const s of [0, 10]) I.kick(stepT(b, s), 0.7); for (const s of [4, 12]) I.snare(stepT(b, s), 0.35); for (let s = 0; s < 16; s += 2) I.hat(stepT(b, s), s % 4 ? 0.15 : 0.25); I.bass(t0, bassNote, beat * 2.5, 'sub', 0.7); I.bass(t0 + beat * 2.5, bassNote, beat * 1.4, 'sub', 0.6); }
        if (B2) motif.forEach((n, i) => { if (!n.rest && i % 2 === 0) I.epiano(stepT(b, i * 2), mel(n.p, i, ch), step * 2 * n.len, 0.18); });
        break;
      case 'pop':
        if (!intro) { for (const s of [0, 8]) I.kick(stepT(b, s), 0.9); I.kick(stepT(b, 10), 0.5); for (const s of [4, 12]) I.clap(stepT(b, s), 0.5); for (let s = 0; s < 16; s += 2) I.hat(stepT(b, s), 0.22); }
        for (let s = 0; s < 16; s += 2) I.pluck(stepT(b, s), ch[(s / 2) % ch.length] + 12, step * 1.8, 0.2);
        if (full) for (let s = 0; s < 16; s += 2) I.bass(stepT(b, s), bassNote, step * 1.7, 'pluck', 0.7);
        if (B2) motif.forEach((n, i) => { if (!n.rest) I.lead(stepT(b, i * 2), mel(n.p, i, ch), step * 2 * n.len, 0.2); });
        if (intro || brk) I.pad(t0, ch, bar, 0.5);
        break;
      case 'epica':
        I.strings(t0, ch.map(m => m - 12), bar, 0.6); I.strings(t0, [ch[0] + 12], bar, 0.35);
        if (!intro) { I.tom(t0, 1); I.tom(t0 + beat * 1.5, 0.7); I.tom(t0 + beat * 2, 0.9); if (B2) { I.tom(t0 + beat * 3, 0.8); I.tom(t0 + beat * 3.5, 0.8); } }
        if (full) for (let s = 0; s < 16; s += 2) I.bass(stepT(b, s), bassNote, step * 1.8, 'saw', 0.55);
        if (B2) motif.forEach((n, i) => { if (!n.rest && i % 2 === 0) I.lead(stepT(b, i * 2), mel(n.p, i, ch, 0), step * 4, 0.18); });
        if (b % 4 === 0 && !intro) I.kick(t0, 1, true);
        break;
      case 'electro':
        if (!intro && !brk) { for (let s = 0; s < 16; s += 4) I.kick(stepT(b, s), 1); for (let s = 2; s < 16; s += 4) I.hat(stepT(b, s), 0.3, true); for (const s of [4, 12]) I.clap(stepT(b, s), 0.45); for (let s = 2; s < 16; s += 4) I.bass(stepT(b, s), bassNote, step * 1.8, 'saw', 0.75); }
        for (let s = 0; s < 16; s++) if (full || brk) I.pluck(stepT(b, s), ch[s % ch.length] + 12 + (s % 8 > 3 ? 12 : 0), step * 0.9, 0.14);
        if (B2) for (const s of [0, 3, 6, 10]) ch.forEach(m => I.pluck(stepT(b, s), m + 12, step * 2, 0.12, B.lead));
        if (intro || brk) I.pad(t0, ch, bar, 0.6);
        break;
      case 'ambient':
        I.pad(t0, ch.map(m => m - 12), bar * 1.05, 0.8);
        for (let k = 0; k < 3; k++) if (R() < 0.7) I.bell(t0 + Math.floor(R() * 8) * beat / 2, ch[Math.floor(R() * ch.length)] + 24, 2, 0.15);
        if (!intro && b % 2 === 0) I.bass(t0, bassNote, bar * 1.9, 'sub', 0.4);
        break;
      case 'suspense':
        I.strings(t0, [ch[0] + 12, ch[1] + 12], bar, 0.25);
        for (let s = 0; s < 16; s += 2) I.bass(stepT(b, s), bassNote, step * 1.5, 'saw', full ? 0.6 : 0.35);
        if (!intro) for (let s = 0; s < 16; s += 4) I.hat(stepT(b, s), 0.18);
        if (B2 && b % 2 === 0) { I.kick(t0, 0.9, true); I.bell(t0 + beat * 2, ch[2] + 24, 1.5, 0.1); }
        if (brk) I.pad(t0, ch, bar, 0.4);
        break;
      case 'documental':
        for (let s = 0; s < 16; s += 2) I.piano(stepT(b, s), [ch[0], ch[1], ch[2], ch[1] + 12][(s / 2) % 4] + 12, step * 2.5, 0.2);
        I.strings(t0, ch, bar, full ? 0.35 : 0.2);
        if (full) { for (let s = 0; s < 16; s += 2) I.shaker(stepT(b, s), 0.2); I.kick(t0, 0.5); I.kick(t0 + beat * 2.5, 0.4); I.bass(t0, bassNote, bar * 0.95, 'sub', 0.5); }
        if (B2) motif.forEach((n, i) => { if (!n.rest && i % 2 === 0) I.piano(stepT(b, i * 2), mel(n.p, i, ch), step * 4, 0.22); });
        break;
      case 'hiphop':
        if (!intro) { for (const s of [0, 7, 10]) I.kick(stepT(b, s), 0.95); for (const s of [4, 12]) I.snare(stepT(b, s), 0.6); for (let s = 0; s < 16; s += 2) I.hat(stepT(b, s), s % 4 ? 0.12 : 0.22); I.bass(t0, bassNote, beat * 1.5, 'sub', 0.85); I.bass(t0 + beat * 1.75, bassNote + (R() < 0.5 ? 3 : 7), beat, 'sub', 0.7); }
        for (const s of [0, 6]) ch.forEach(m => I.piano(stepT(b, s), m + 12, step * 3, 0.13));
        if (B2) motif.forEach((n, i) => { if (!n.rest && i % 2 === 0) I.epiano(stepT(b, i * 2), mel(n.p, i, ch), step * 2, 0.15); });
        break;
      case 'rock':
        if (!intro) { for (const s of [0, 6, 8]) I.kick(stepT(b, s), 1); for (const s of [4, 12]) I.snare(stepT(b, s), 0.8); for (let s = 0; s < 16; s += 2) I.hat(stepT(b, s), 0.25, B2 && s % 4 === 2); }
        if (!intro || b % 2 === 0) for (let s = 0; s < 16; s += 2) I.power(stepT(b, s), ch[0] - 12, step * 1.8, full ? 0.28 : 0.18);
        if (full) for (let s = 0; s < 16; s += 2) I.bass(stepT(b, s), bassNote, step * 1.8, 'saw', 0.6);
        if (B2) motif.forEach((n, i) => { if (!n.rest) I.lead(stepT(b, i * 2), mel(n.p, i, ch), step * 2 * n.len, 0.17); });
        break;
      case 'infantil':
        if (!intro) { for (const s of [0, 8]) I.kick(stepT(b, s), 0.7); for (const s of [4, 12]) I.clap(stepT(b, s), 0.45); for (let s = 0; s < 16; s += 4) I.shaker(stepT(b, s + 2), 0.25); }
        for (const s of [0, 4, 8, 12]) I.bass(stepT(b, s), s % 8 ? bassNote + 7 : bassNote, step * 2, 'pluck', 0.8);
        for (const s of [2, 6, 10, 14]) ch.forEach(m => I.pluck(stepT(b, s), m + 12, step * 1.5, 0.08, B.keys));
        if (!intro) motif.forEach((n, i) => { if (!n.rest) I.bell(stepT(b, i * 2), scaleNote(n.p + (B2 ? 2 : 0)) + 12, 0.6, 0.22); });
        break;
      case 'corporativo':
        for (let s = 0; s < 16; s++) I.pluck(stepT(b, s), ch[s % ch.length] + 12 + (s % 8 > 3 ? 12 : 0), step * 0.9, 0.11);
        if (!intro) { for (const s of [0, 8]) I.kick(stepT(b, s), 0.8); for (const s of [4, 12]) I.clap(stepT(b, s), 0.4); for (let s = 0; s < 16; s += 2) I.shaker(stepT(b, s + 1), 0.18); I.bass(t0, bassNote, beat * 1.9, 'pluck', 0.7); I.bass(t0 + beat * 2, bassNote, beat * 1.9, 'pluck', 0.7); }
        I.pad(t0, ch, bar, 0.35);
        if (B2) motif.forEach((n, i) => { if (!n.rest && i % 2 === 0) I.piano(stepT(b, i * 2), mel(n.p, i, ch), step * 3, 0.2); });
        break;
      case 'emotivo':
        for (let s = 0; s < 16; s += 2) I.piano(stepT(b, s), [ch[0] - 12, ch[2] - 12, ch[1], ch[2]][(s / 2) % 4] + 12, step * 3, 0.17);
        if (!intro) I.strings(t0, ch, bar, 0.4);
        if (full) I.bass(t0, bassNote, bar * 0.95, 'sub', 0.45);
        if (B2) motif.forEach((n, i) => { if (!n.rest && i % 2 === 0) I.piano(stepT(b, i * 2), mel(n.p, i, ch), step * 4, 0.25); });
        break;
    }
    // redoble antes de cada sección B
    if (form[b + 1] === 'B' && sec !== 'B' && !['ambient', 'emotivo'].includes(styleKey)) for (let s = 12; s < 16; s++) I.snare(stepT(b, s), 0.2 + (s - 12) * 0.08);
  }
  // ---- sintetizar cada nota distinta una vez ----
  const cache = new Map(), keyOf = e => e.name + '|' + JSON.stringify(e.args);
  const uniq = []; for (const e of events) { const k = keyOf(e); if (!cache.has(k)) { cache.set(k, null); uniq.push(e); } }
  let done = 0;
  for (let i = 0; i < uniq.length; i += 16) {
    await Promise.all(uniq.slice(i, i + 16).map(async e => { cache.set(keyOf(e), await renderNote(e.name, e.args, sr)); done++; }));
    onProgress?.(0.6 * done / uniq.length);
  }
  for (const e of events) { const src = ctx.createBufferSource(); src.buffer = cache.get(keyOf(e)); src.connect(e.bus); src.start(e.t); }
  if (styleKey === 'lofi') { const nb = ctx.createBuffer(1, sr, sr), d = nb.getChannelData(0); for (let i = 0; i < sr; i++) d[i] = Math.random() < 0.0015 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.15; const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; const g = ctx.createGain(); g.gain.value = 0.06; s.connect(f).connect(g).connect(master); s.start(0); s.stop(seconds); }
  onProgress?.(0.7);
  const buf = await ctx.startRendering();
  normalize(buf, 0.89);
  onProgress?.(1);
  return encodeWAV(buf);
}

// ---- instrumentos (cada nota se sintetiza en su propio contexto y se guarda como muestra) ----
const TAIL = { piano: 2.5, epiano: 1.5, bell: 1.8, pad: 1.5, strings: 1.2, tom: 1.3, kick: 1, snare: 0.4, clap: 0.4, hat: 0.5, shaker: 0.2 };
async function renderNote(name, args, sr) {
  const dur = typeof args[1] === 'number' ? args[1] : 0.5;
  const len = Math.ceil(sr * (Math.max(0.05, dur) + (TAIL[name] ?? 0.8)));
  const ctx = new OfflineAudioContext(1, len, sr);
  makeInstruments(ctx, ctx.destination)[name](0, ...args);
  return await ctx.startRendering();
}

function makeInstruments(ctx, dest) {
  const sr = ctx.sampleRate;
  let nb = null; const noiseBuf = () => nb || (nb = (() => { const b = ctx.createBuffer(1, sr, sr), d = b.getChannelData(0); for (let i = 0; i < sr; i++) d[i] = Math.random() * 2 - 1; return b; })());
  const env = (g, t, a, peak, d, sus, rel, end) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(peak * sus, t + a, d); g.gain.setTargetAtTime(0.0001, end, rel); };
  const osc = (type, f, t, end, d, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.connect(d); o.start(t); o.stop(end + 0.5); return o; };
  const noise = (t, dur, d) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf(); s.loop = true; s.connect(d); s.start(t, Math.random() * 0.5); s.stop(t + dur); return s; };
  return {
    kick(t, v = 1, low = false) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(low ? 110 : 150, t); o.frequency.exponentialRampToValueAtTime(low ? 35 : 45, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (low ? 0.9 : 0.45)); o.connect(g).connect(dest); o.start(t); o.stop(t + 1); },
    snare(t, v = 0.7) { const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); noise(t, 0.25, f); f.connect(g).connect(dest); const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = 185; og.gain.setValueAtTime(v * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(og).connect(dest); o.start(t); o.stop(t + 0.15); },
    clap(t, v = 0.6) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2; f.connect(dest); for (let i = 0; i < 3; i++) { const g = ctx.createGain(), tt = t + i * 0.011; g.gain.setValueAtTime(v, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 2 ? 0.18 : 0.03)); noise(tt, 0.2, g); g.connect(f); } },
    hat(t, v = 0.4, open = false) { const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.3 : 0.05)); noise(t, open ? 0.35 : 0.08, f); f.connect(g).connect(dest); },
    shaker(t, v = 0.25) { const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6000; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09); noise(t, 0.1, f); f.connect(g).connect(dest); },
    tom(t, v = 1) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.4); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2); o.connect(g).connect(dest); o.start(t); o.stop(t + 1.3); },
    bass(t, m, dur, kind = 'saw', v = 0.8) {
      const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
      const fq = mtof(m);
      if (kind === 'sub') { osc('sine', fq, t, t + dur, g); osc('triangle', fq * 2, t, t + dur, g, 3); f.frequency.value = 900; }
      else if (kind === 'pluck') { osc('triangle', fq, t, t + dur, g); f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.2); }
      else { osc('sawtooth', fq, t, t + dur, g); osc('square', fq / 2, t, t + dur, g); f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.25); }
      const e = ctx.createGain(); g.connect(f).connect(e).connect(dest); env(e, t, 0.01, v, 0.25, kind === 'pluck' ? 0.2 : 0.7, 0.05, t + dur);
    },
    pad(t, ms, dur, v = 0.5) {
      const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300; f.Q.value = 0.6;
      for (const m of ms) for (const d of [-9, 0, 8]) osc('sawtooth', mtof(m), t, t + dur, f, d);
      f.connect(g).connect(dest); env(g, t, Math.min(1.2, dur * 0.4), v / ms.length, 1, 0.8, 0.6, t + dur);
    },
    strings(t, ms, dur, v = 0.5) {
      const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.value = 6; lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + 1);
      for (const m of ms) for (const d of [-6, 5]) { const o = osc('sawtooth', mtof(m), t, t + dur, f, d); lg.connect(o.detune); }
      f.connect(g).connect(dest); env(g, t, Math.min(0.8, dur * 0.3), v / ms.length, 1, 0.9, 0.5, t + dur);
    },
    epiano(t, m, dur, v = 0.35) {
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), f = mtof(m);
      car.frequency.value = f; mod.frequency.value = f * 2; mg.gain.setValueAtTime(f * 1.8, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.6);
      mod.connect(mg).connect(car.frequency); car.connect(g).connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(v * 0.3, t + 0.5); g.gain.setTargetAtTime(0.0001, t + dur, 0.15);
      car.start(t); mod.start(t); car.stop(t + dur + 1); mod.stop(t + dur + 1);
    },
    piano(t, m, dur, v = 0.35) {
      const g = ctx.createGain(), f = mtof(m), f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(Math.min(9000, f * 9), t); f2.frequency.exponentialRampToValueAtTime(Math.min(4000, f * 3), t + 1);
      [[1, 1], [2, 0.45], [3, 0.2], [4, 0.12], [5, 0.06]].forEach(([h, a]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * h * (1 + 0.0004 * h * h); og.gain.value = a; o.connect(og).connect(f2); o.start(t); o.stop(t + dur + 2); });
      f2.connect(g).connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(v * 0.25, t + 0.9); g.gain.setTargetAtTime(0.0001, t + dur, 0.25);
    },
    pluck(t, m, dur, v = 0.3) {
      const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.18);
      osc('sawtooth', mtof(m), t, t + dur, f); osc('square', mtof(m) * 1.003, t, t + dur, f); f.connect(g).connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(0.5, dur + 0.2));
    },
    lead(t, m, dur, v = 0.28) {
      const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2800;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.4, dur)); lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + 0.5);
      const o1 = osc('sawtooth', mtof(m), t, t + dur, f), o2 = osc('square', mtof(m), t, t + dur, f, 7); lg.connect(o1.detune); lg.connect(o2.detune);
      f.connect(g).connect(dest); env(g, t, 0.02, v, 0.3, 0.7, 0.08, t + dur * 0.95);
    },
    bell(t, m, dur, v = 0.3) {
      const f = mtof(m); [[1, 1, 1.5], [2.76, 0.4, 0.6], [5.4, 0.2, 0.3]].forEach(([r, a, d]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * r; g.gain.setValueAtTime(v * a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(dest); o.start(t); o.stop(t + d + 0.1); });
    },
    power(t, m, dur, v = 0.3) {
      const g = ctx.createGain(), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; cv[i] = Math.tanh(x * 8); } sh.curve = cv;
      for (const [iv, d] of [[0, -6], [0, 6], [7, 0], [12, 3]]) osc('sawtooth', mtof(m + iv), t, t + dur, sh, d);
      sh.connect(lp).connect(g).connect(dest); env(g, t, 0.005, v, 0.2, 0.75, 0.03, t + dur * 0.92);
    },
  };
}

function impulse(ctx, sec) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
  return b;
}
function normalize(buf, peak) {
  let mx = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > mx) mx = a; } }
  if (mx < 1e-6) return; const k = peak / mx;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
}
