// Decodificación rápida de fotogramas para exportar (MP4 + WebCodecs). Si no es posible, se usa <video>.
import { createFile, MP4BoxBuffer, DataStream, Endianness } from '../lib/mp4box/mp4box.all.mjs';
import { getMediaBlob } from './storage.js';

const metaCache = new Map(); // mediaId -> Promise<meta|null>

export function getMeta(mediaId) {
  if (!metaCache.has(mediaId)) metaCache.set(mediaId, loadMeta(mediaId).catch(e => { console.warn('decoder meta', e); return null; }));
  return metaCache.get(mediaId);
}

async function loadMeta(mediaId) {
  if (!('VideoDecoder' in window)) return null;
  const blob = await getMediaBlob(mediaId);
  if (!blob) return null;
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const tag = String.fromCharCode(...head.slice(4, 8));
  if (!['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'].includes(tag)) return null; // no es MP4/MOV (p. ej. WebM)
  const f = createFile();
  let info = null;
  f.onReady = i => { info = i; };
  f.onError = () => {};
  let pos = 0, guard = 0;
  const CH = 1 << 20;
  while (!info && pos < blob.size && guard++ < 4000) {
    const ab = await blob.slice(pos, pos + CH).arrayBuffer();
    if (!ab.byteLength) break;
    const next = f.appendBuffer(MP4BoxBuffer.fromArrayBuffer(ab, pos));
    pos = next && next > pos ? next : pos + ab.byteLength;
  }
  if (!info || info.isFragmented || !info.videoTracks.length) return null;
  const v = info.videoTracks[0];
  const m = v.matrix;
  let rot = 0;
  if (m) { rot = Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI); rot = ((rot % 360) + 360) % 360; if (rot % 90) return null; }
  const trak = f.getTrackById(v.id);
  const samples = trak.samples;
  if (!samples?.length) return null;
  const entry = trak.mdia.minf.stbl.stsd.entries[0];
  const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
  let description;
  if (box) { const st = new DataStream(undefined, 0, Endianness.BIG_ENDIAN); box.write(st); description = new Uint8Array(st.buffer, 8); }
  const config = { codec: v.codec.startsWith('vp08') ? 'vp8' : v.codec, codedWidth: v.track_width, codedHeight: v.track_height, description, optimizeForLatency: true };
  try { const s = await VideoDecoder.isConfigSupported(config); if (!s.supported) return null; } catch { return null; }
  const ts = v.timescale;
  let minCts = Infinity; for (const s of samples) if (s.cts < minCts) minCts = s.cts;
  const list = samples.map((s, i) => ({ i, off: s.offset, size: s.size, key: s.is_sync, pts: (s.cts - minCts) / ts, dur: s.duration / ts }));
  const byPts = [...list].sort((a, b) => a.pts - b.pts);
  for (const s of list) s.us = Math.round(s.pts * 1e6);
  return { blob, config, list, byPts, rot };
}

export class FrameReader {
  constructor(meta) { this.m = meta; this.frames = []; this.waiters = []; this.fed = -1; this.flushed = false; this.err = null; this.win = null; this.winOff = 0; this.make(); }
  make() {
    this.dec = new VideoDecoder({
      output: f => { this.frames.push(f); this.frames.sort((a, b) => a.timestamp - b.timestamp); this.wake(); },
      error: e => { this.err = e; this.wake(); },
    });
    this.dec.configure(this.m.config);
    this.fed = -1; this.flushed = false;
  }
  wake() { const w = this.waiters; this.waiters = []; w.forEach(r => r()); }
  wait(ms) { return new Promise(r => { const to = setTimeout(r, ms); this.waiters.push(() => { clearTimeout(to); r(); }); }); }
  clearFrames() { this.frames.forEach(f => f.close()); this.frames = []; }
  reset(fromIdx) {
    this.clearFrames();
    try { this.dec.reset(); this.dec.configure(this.m.config); } catch { try { this.dec.close(); } catch {} this.make(); }
    this.fed = fromIdx - 1; this.flushed = false; this.err = null;
  }
  async data(s) {
    if (!this.win || s.off < this.winOff || s.off + s.size > this.winOff + this.win.byteLength) {
      const len = Math.max(4 << 20, s.size);
      this.win = new Uint8Array(await this.m.blob.slice(s.off, s.off + len).arrayBuffer()); this.winOff = s.off;
    }
    return this.win.subarray(s.off - this.winOff, s.off - this.winOff + s.size);
  }
  async feed(idx) {
    const s = this.m.list[idx];
    const data = await this.data(s);
    this.dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.us, duration: Math.round(s.dur * 1e6), data }));
    this.fed = idx;
  }
  keyBefore(idx) { const L = this.m.list; for (let i = idx; i >= 0; i--) if (L[i].key) return i; return 0; }
  target(t) {
    const B = this.m.byPts; let lo = 0, hi = B.length - 1, r = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (B[mid].pts <= t + 1e-4) { r = mid; lo = mid + 1; } else hi = mid - 1; }
    return B[r];
  }
  // Devuelve el VideoFrame que se ve en el instante t (segundos del archivo)
  async frameAt(t) {
    const s = this.target(t), L = this.m.list;
    const have = () => this.frames.find(f => f.timestamp === s.us);
    let f = have();
    if (!f) {
      const maxOut = this.frames.length ? this.frames[this.frames.length - 1].timestamp : -1;
      const pendingAhead = s.i <= this.fed && s.us > maxOut;
      if (this.err || (s.i <= this.fed && !pendingAhead) || (this.flushed && s.i > this.fed) || this.fed < 0) this.reset(this.keyBefore(s.i));
      else if (s.i > this.fed + 30) { const k = this.keyBefore(s.i); if (k > this.fed) this.reset(k); }
      let idle = 0;
      while (!(f = have())) {
        if (this.err) throw this.err;
        if (this.fed < L.length - 1 && this.fed < s.i + 16 && this.dec.decodeQueueSize < 6) { await this.feed(this.fed + 1); continue; }
        if (this.fed >= L.length - 1 && !this.flushed) { this.flushed = true; await this.dec.flush().catch(() => {}); continue; }
        await this.wait(50);
        if (++idle > 60) break; // 3 s sin respuesta
      }
      if (!f) f = [...this.frames].reverse().find(x => x.timestamp <= s.us) || this.frames[0];
      if (!f) throw new Error('no frame');
    }
    // liberar fotogramas anteriores
    const keep = [];
    for (const x of this.frames) { if (x.timestamp < f.timestamp) x.close(); else keep.push(x); }
    this.frames = keep;
    return f;
  }
  close() { this.clearFrames(); try { this.dec.close(); } catch {} this.wake(); }
}
