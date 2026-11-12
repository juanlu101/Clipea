// Subtítulos: importar/exportar SRT y VTT
import { store, makeClip, addTrack, clipEnd, commit } from './state.js';

const toSec = s => { const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); if (!m) return 0; return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]); };
const pad = (n, l = 2) => String(n).padStart(l, '0');
export function srtTime(t) {
  const ms = Math.round(t * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function parseSubs(text) {
  const out = [];
  const blocks = text.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.trim() !== '');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, z] = lines[i].split('-->');
    const txt = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (txt) out.push({ start: toSec(a), end: toSec(z.split(' ').filter(Boolean)[0]), text: txt });
  }
  return out;
}

export function subtitleTrack(create = true) {
  let tr = store.project.tracks.find(t => t.type === 'subtitle');
  if (!tr && create) tr = addTrack('subtitle', 0);
  return tr;
}

export function addSubtitles(list, offset = 0) {
  const tr = subtitleTrack();
  for (const s of list) {
    const c = makeClip('subtitle', { text: s.text, start: Math.max(0, s.start + offset), duration: Math.max(0.3, s.end - s.start), trackId: tr.id });
    store.project.clips.push(c);
  }
  // evitar solapes dentro de la pista
  const clips = store.project.clips.filter(c => c.trackId === tr.id).sort((a, b) => a.start - b.start);
  for (let i = 1; i < clips.length; i++) if (clips[i].start < clipEnd(clips[i - 1])) clips[i - 1].duration = Math.max(0.2, clips[i].start - clips[i - 1].start);
  commit();
}

export function exportSRT() {
  const tr = subtitleTrack(false); if (!tr) return '';
  const clips = store.project.clips.filter(c => c.trackId === tr.id).sort((a, b) => a.start - b.start);
  return clips.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(clipEnd(c))}\n${c.text}\n`).join('\n');
}

// Divide un texto largo en trozos legibles repartidos en el tiempo
export function chunkText(text, start, end, maxWords = 8) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const n = Math.ceil(words.length / maxWords);
  const per = (end - start) / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ start: start + i * per, end: start + (i + 1) * per, text: words.slice(i * maxWords, (i + 1) * maxWords).join(' ') });
  return out;
}
