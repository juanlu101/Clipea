// Efectos de sonido sintetizados (sin derechos de autor) y codificador WAV
export function encodeWAV(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const ws = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  ws(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

function noise(ctx, dur) {
  const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b; return s;
}
function tone(ctx, type, f0, f1, t, dur, vol = 0.5) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
}

export const SFX = {
  ding: ['Campanita', 1.6, ctx => { tone(ctx, 'sine', 1318, 0, 0, 1.5, 0.5); tone(ctx, 'sine', 2637, 0, 0, 0.8, 0.15); }],
  pop: ['Pop', 0.25, ctx => tone(ctx, 'sine', 900, 200, 0, 0.18, 0.7)],
  whoosh: ['Whoosh', 0.9, ctx => {
    const n = noise(ctx, 0.9), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(4000, 0.45); f.frequency.exponentialRampToValueAtTime(500, 0.9);
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.8, 0.4); g.gain.exponentialRampToValueAtTime(0.0001, 0.9);
    n.connect(f).connect(g).connect(ctx.destination); n.start(0);
  }],
  beep: ['Pitido', 0.5, ctx => tone(ctx, 'square', 1000, 0, 0, 0.4, 0.25)],
  success: ['Éxito', 1.0, ctx => [523, 659, 784, 1046].forEach((f, i) => tone(ctx, 'triangle', f, 0, i * 0.11, 0.5, 0.35))],
  error: ['Error', 0.7, ctx => { tone(ctx, 'sawtooth', 220, 0, 0, 0.25, 0.3); tone(ctx, 'sawtooth', 160, 0, 0.28, 0.35, 0.3); }],
  drum: ['Bombo', 0.6, ctx => tone(ctx, 'sine', 150, 40, 0, 0.5, 1)],
  drumroll: ['Redoble', 2.2, ctx => { for (let i = 0; i < 40; i++) { const n = noise(ctx, 0.06), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; const t = i * 0.05; g.gain.setValueAtTime(0.15 + i * 0.008, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); n.connect(f).connect(g).connect(ctx.destination); n.start(t); } tone(ctx, 'sine', 120, 40, 2.0, 0.2, 1); }],
  magic: ['Magia', 1.4, ctx => { for (let i = 0; i < 12; i++) tone(ctx, 'sine', 1200 + Math.random() * 2400, 0, i * 0.08, 0.4, 0.15); }],
  clap: ['Aplausos', 2.5, ctx => { for (let i = 0; i < 70; i++) { const n = noise(ctx, 0.05), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 1500; const t = Math.random() * 2.2; g.gain.setValueAtTime(0.4 * (1 - t / 2.6), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); n.connect(f).connect(g).connect(ctx.destination); n.start(t); } }],
  tick: ['Tic-tac', 2.0, ctx => { for (let i = 0; i < 4; i++) tone(ctx, 'square', i % 2 ? 1500 : 1900, 0, i * 0.5, 0.03, 0.3); }],
  laser: ['Láser', 0.5, ctx => tone(ctx, 'sawtooth', 1800, 120, 0, 0.4, 0.3)],
  rise: ['Subida', 1.5, ctx => tone(ctx, 'sine', 200, 1600, 0, 1.4, 0.35)],
};

export async function renderSfx(key) {
  const [, dur, fn] = SFX[key];
  const ctx = new OfflineAudioContext(1, Math.ceil(44100 * dur), 44100);
  fn(ctx);
  return encodeWAV(await ctx.startRendering());
}
