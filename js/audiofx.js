// Efectos de audio (vista previa y exportación comparten el mismo grafo) y atenuación automática de la música
import { store, clipEnd, getTrack, getMedia, audioGainAt } from './state.js';
import { cache } from './media.js';

export const VOICE_FX = [
  ['none', 'Ninguno'], ['enhance', 'Mejorar voz (más clara y con más presencia)'], ['echo', 'Eco'], ['cave', 'Cueva / catedral'],
  ['radio', 'Radio / teléfono'], ['megaphone', 'Megáfono'], ['robot', 'Robot'], ['alien', 'Alienígena'], ['underwater', 'Bajo el agua'],
];

const irCache = new WeakMap();
function impulse(ctx, seconds = 2.5, decay = 3) {
  let m = irCache.get(ctx); if (!m) irCache.set(ctx, m = {});
  const key = seconds + ':' + decay; if (m[key]) return m[key];
  const len = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return (m[key] = b);
}
function shaper(ctx, amount) {
  const s = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; curve[i] = (1 + amount) * x / (1 + amount * Math.abs(x)); }
  s.curve = curve; s.oversample = '2x'; return s;
}

// Devuelve { input, output, stop() }
export function buildChain(ctx, type = 'none') {
  const input = ctx.createGain(), output = ctx.createGain();
  const oscs = [];
  const osc = (f, t = 'sine') => { const o = ctx.createOscillator(); o.type = t; o.frequency.value = f; o.start(); oscs.push(o); return o; };
  const filt = (type, f, q = 0.7, g = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };
  switch (type) {
    case 'enhance': {
      const hp = filt('highpass', 90), lowcut = filt('peaking', 250, 1, -2), pres = filt('peaking', 3200, 0.8, 5), air = filt('highshelf', 9000, 0.7, 3);
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -26; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15; comp.knee.value = 8;
      const mk = ctx.createGain(); mk.gain.value = 1.6;
      input.connect(hp).connect(lowcut).connect(pres).connect(air).connect(comp).connect(mk).connect(output); break;
    }
    case 'echo': {
      const d = ctx.createDelay(2); d.delayTime.value = 0.32; const fb = ctx.createGain(); fb.gain.value = 0.42; const wet = ctx.createGain(); wet.gain.value = 0.55;
      input.connect(output); input.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(output); break;
    }
    case 'cave': {
      const cv = ctx.createConvolver(); cv.buffer = impulse(ctx, 3.5, 2.2); const wet = ctx.createGain(); wet.gain.value = 0.7; const dry = ctx.createGain(); dry.gain.value = 0.7;
      input.connect(dry).connect(output); input.connect(cv).connect(wet).connect(output); break;
    }
    case 'radio': {
      const hp = filt('highpass', 450, 0.9), lp = filt('lowpass', 3200, 0.9), sh = shaper(ctx, 4), g = ctx.createGain(); g.gain.value = 0.8;
      input.connect(hp).connect(lp).connect(sh).connect(g).connect(output); break;
    }
    case 'megaphone': {
      const bp = filt('bandpass', 1600, 1.1), sh = shaper(ctx, 18), g = ctx.createGain(); g.gain.value = 0.6;
      input.connect(bp).connect(sh).connect(g).connect(output); break;
    }
    case 'robot': {
      const ring = ctx.createGain(); ring.gain.value = 0; osc(55, 'square').connect(ring.gain);
      const d = ctx.createDelay(0.1); d.delayTime.value = 0.012; const fb = ctx.createGain(); fb.gain.value = 0.5;
      input.connect(ring); ring.connect(d); d.connect(fb).connect(d); d.connect(output); ring.connect(output); break;
    }
    case 'alien': {
      const ring = ctx.createGain(); ring.gain.value = 0; osc(320).connect(ring.gain);
      const trem = ctx.createGain(); trem.gain.value = 0.6; const lfo = osc(7); const depth = ctx.createGain(); depth.gain.value = 0.4; lfo.connect(depth).connect(trem.gain);
      const dry = ctx.createGain(); dry.gain.value = 0.35;
      input.connect(ring).connect(trem).connect(output); input.connect(dry).connect(output); break;
    }
    case 'underwater': {
      const lp = filt('lowpass', 420, 2), trem = ctx.createGain(); trem.gain.value = 0.8; const depth = ctx.createGain(); depth.gain.value = 0.25; osc(3).connect(depth).connect(trem.gain);
      const cv = ctx.createConvolver(); cv.buffer = impulse(ctx, 1.5, 3); const wet = ctx.createGain(); wet.gain.value = 0.4;
      input.connect(lp).connect(trem).connect(output); lp.connect(cv).connect(wet).connect(output); break;
    }
    default: input.connect(output);
  }
  return { input, output, type, stop() { oscs.forEach(o => { try { o.stop(); } catch {} }); try { input.disconnect(); output.disconnect(); } catch {} } };
}

// ---------- Atenuación automática (ducking) ----------
// Una pista de música con «duck» activado baja cuando suena otro clip con voz o sonido
function peakAt(mediaId, st) {
  const pk = cache.peaks.get(mediaId); if (!pk) return 0;
  let mx = 0; const i0 = Math.floor((st - 0.15) * pk.rate), i1 = Math.ceil((st + 0.15) * pk.rate);
  for (let i = Math.max(0, i0); i <= i1 && i < pk.data.length; i++) if (pk.data[i] > mx) mx = pk.data[i];
  return mx / 255;
}
export function duckLevelAt(c, t, p = store.project) {
  if (!c.duck?.enabled) return 1;
  for (const o of p.clips) {
    if (o === c || o.duck?.enabled || (o.kind !== 'video' && o.kind !== 'audio')) continue;
    if (t < o.start || t >= clipEnd(o) || o.muted || o.audioDetached || o.volume <= 0) continue;
    const tr = p.tracks.find(x => x.id === o.trackId); if (!tr || tr.muted) continue;
    if (getMedia(o.mediaId)?.hasAudio === false) continue;
    const st = o.in + (t - o.start) * o.speed;
    if (peakAt(o.mediaId, st) > 0.28) return c.duck.amount ?? 0.25;
  }
  return 1;
}
export const totalGainAt = (c, t) => audioGainAt(c, t) * duckLevelAt(c, t);
