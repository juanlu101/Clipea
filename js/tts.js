// Texto a voz: voces naturales (Piper, se descargan una vez) y voces básicas sin conexión (eSpeak NG)
const BASE = new URL('../lib/', import.meta.url).href;
const HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/';

export const NATURAL_VOICES = [
  { id: 'es_ES-davefx-medium', path: 'es/es_ES/davefx/medium/es_ES-davefx-medium.onnx', label: 'Español (España) · Dave, hombre', mb: 63 },
  { id: 'es_ES-sharvard-medium#0', path: 'es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx', label: 'Español (España) · Sharvard, voz A', sid: 0, mb: 77 },
  { id: 'es_ES-sharvard-medium#1', path: 'es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx', label: 'Español (España) · Sharvard, voz B', sid: 1, mb: 77 },
  { id: 'es_MX-claude-high', path: 'es/es_MX/claude/high/es_MX-claude-high.onnx', label: 'Español (México) · Claude, hombre', mb: 114 },
  { id: 'es_MX-ald-medium', path: 'es/es_MX/ald/medium/es_MX-ald-medium.onnx', label: 'Español (México) · Ald, hombre', mb: 63 },
  { id: 'ca_ES-upc_ona-medium', path: 'ca/ca_ES/upc_ona/medium/ca_ES-upc_ona-medium.onnx', label: 'Català · Ona, dona', mb: 63 },
  { id: 'en_GB-alba-medium', path: 'en/en_GB/alba/medium/en_GB-alba-medium.onnx', label: 'English (UK) · Alba, woman', mb: 63 },
  { id: 'en_US-lessac-medium', path: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx', label: 'English (US) · Lessac, woman', mb: 63 },
  { id: 'fr_FR-siwis-medium', path: 'fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx', label: 'Français · Siwis, femme', mb: 63 },
  { id: 'de_DE-thorsten-medium', path: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx', label: 'Deutsch · Thorsten, Mann', mb: 63 },
];
export const BASIC_VOICES = [
  ['es', 'Español · voz masculina'], ['es+f3', 'Español · voz femenina'], ['es-419', 'Español latinoamericano'], ['ca', 'Català'], ['eu', 'Euskara'],
  ['en-gb', 'English (UK)'], ['en-us', 'English (US)'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'],
];

function wav(samples, sr) {
  const n = samples.length, dv = new DataView(new ArrayBuffer(44 + n * 2));
  const ws = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([dv.buffer], { type: 'audio/wav' });
}

// ---------- eSpeak NG (sin conexión) ----------
let espeakMod = null;
export async function speakBasic(text, voice = 'es', { speed = 1, pitch = 50 } = {}) {
  espeakMod ||= (await import(BASE + 'espeak/espeak-ng.js')).default;
  const e = await espeakMod({ arguments: ['-v', voice, '-s', String(Math.round(165 * speed)), '-p', String(pitch), '-g', '4', '-w', 'out.wav', text.replace(/\s+/g, ' ').trim()], print: () => {}, printErr: () => {} });
  return new Blob([e.FS.readFile('out.wav')], { type: 'audio/wav' });
}

// ---------- Piper (voces naturales) ----------
async function opfsDir() { try { return await (await navigator.storage.getDirectory()).getDirectoryHandle('voces-piper', { create: true }); } catch { return null; } }
async function cachedFetch(url, onProgress) {
  const name = decodeURIComponent(url.split('/').pop());
  const dir = await opfsDir();
  if (dir) { try { const f = await (await dir.getFileHandle(name)).getFile(); if (f.size > 0) return f; } catch {} }
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo descargar la voz (' + r.status + ')');
  const total = +(r.headers.get('Content-Length') || 0), rd = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress?.(total ? got / total : 0); }
  const blob = new Blob(parts);
  if (dir) { try { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(blob); await w.close(); } catch {} }
  return blob;
}
export async function isDownloaded(v) {
  const dir = await opfsDir(); if (!dir) return false;
  try { const f = await (await dir.getFileHandle(decodeURIComponent(v.path.split('/').pop()))).getFile(); return f.size > 0; } catch { return false; }
}

let ort = null, phon = null; const sessions = new Map();
async function phonemize(text, espeakVoice) {
  phon ||= (await import(BASE + 'piper/piper-phonemize.js')).createPiperPhonemize;
  return await new Promise((res, rej) => {
    phon({
      print: l => { try { res(JSON.parse(l).phoneme_ids); } catch (e) { rej(e); } },
      printErr: () => {},
      locateFile: f => BASE + 'piper/' + (f.endsWith('.wasm') ? 'piper_phonemize.wasm' : f.endsWith('.data') ? 'piper_phonemize.data' : f),
    }).then(m => m.callMain(['-l', espeakVoice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data'])).catch(rej);
  });
}

export async function speakNatural(text, voiceId, { speed = 1 } = {}, onProgress) {
  const v = NATURAL_VOICES.find(x => x.id === voiceId); if (!v) throw new Error('Voz desconocida');
  if (!ort) {
    ort = await import(BASE + 'piper/ort.wasm.min.mjs');
    ort.env.wasm.numThreads = 1; ort.env.wasm.simd = true; ort.env.wasm.proxy = false; ort.env.wasm.wasmPaths = BASE + 'piper/';
  }
  const cfg = JSON.parse(await (await cachedFetch(HF + v.path + '.json')).text());
  let sess = sessions.get(v.path);
  if (!sess) { const model = await cachedFetch(HF + v.path, onProgress); sess = await ort.InferenceSession.create(new Uint8Array(await model.arrayBuffer())); sessions.set(v.path, sess); }
  const sr = cfg.audio.sample_rate, inf = cfg.inference;
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?¡¿;:\n]+[.!?;:]*|[.!?]+/g)?.map(s => s.trim()).filter(Boolean) || [text];
  const chunks = [];
  for (const s of sentences) {
    const ids = await phonemize(s, cfg.espeak.voice);
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale, inf.length_scale / speed, inf.noise_w]), [3]),
    };
    if (Object.keys(cfg.speaker_id_map || {}).length) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(v.sid || 0)]), [1]);
    const { output } = await sess.run(feeds);
    chunks.push(output.data, new Float32Array(Math.round(sr * 0.25)));
  }
  const total = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(total); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return wav(all, sr);
}
