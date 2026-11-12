// Reconocimiento de voz (Web Speech API): dictado y subtítulos automáticos a partir del audio de un clip
import { store, getMedia, fmtTime, commit, select } from './state.js';
import { h, ih, modal, toast, selectCtl, toggleCtl } from './ui.js';
import { cache } from './media.js';
import { addSubtitles, chunkText } from './subtitles.js';
import { pause } from './player.js';

export const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const LANGS = [['es-ES', 'Castellano'], ['ca-ES', 'Català'], ['gl-ES', 'Galego'], ['eu-ES', 'Euskara'], ['en-US', 'English'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-PT', 'Português']];

// ¿Permite el navegador reconocer el audio de una pista (no solo el micrófono)?
let trackSupport = null;
export function supportsTrack() {
  if (trackSupport !== null) return trackSupport;
  if (!SR) return (trackSupport = false);
  try {
    const ac = new AudioContext(); const tr = ac.createMediaStreamDestination().stream.getAudioTracks()[0]; tr.stop();
    const r = new SR();
    try { r.start(tr); r.abort(); trackSupport = false; } // lo ignoró: navegador antiguo
    catch (e) { trackSupport = e.name === 'InvalidStateError'; }
    ac.close().catch(() => {});
  } catch { trackSupport = false; }
  return trackSupport;
}

// Intenta usar el reconocimiento en el propio ordenador (sin enviar audio a internet) si está disponible
export async function makeRecognizer(lang) {
  const r = new SR();
  r.lang = lang; r.continuous = true; r.interimResults = true;
  try {
    if (typeof SR.available === 'function' && 'processLocally' in r) {
      const st = await SR.available({ langs: [lang], processLocally: true });
      if (st === 'available') { r.processLocally = true; r._local = true; }
    }
  } catch {}
  return r;
}

export async function autoSubtitlesFromClip(c) {
  if (!c || (c.kind !== 'video' && c.kind !== 'audio')) { toast('Selecciona en la línea de tiempo un clip de vídeo o audio con voz'); return; }
  const m = getMedia(c.mediaId);
  if (m?.hasAudio === false) { toast('Ese clip no tiene sonido'); return; }
  if (!supportsTrack()) { toast('Tu navegador no puede transcribir el audio de un vídeo. Actualiza Chrome o usa «Dictar subtítulos con tu voz».', 'error', 7000); return; }
  pause();
  const opts = { lang: 'es-ES', listen: true };
  const prog = h('div', { class: 'progress' }, h('div', { class: 'fill' }));
  const status = h('div', { class: 'exp-status' }, 'Pulsa «Empezar». La transcripción dura lo mismo que el clip.');
  const live = h('div', { class: 'rec-transcript' });
  const optsBox = h('div', { class: 'rec-opts' },
    selectCtl({ label: 'Idioma que se habla en el vídeo', value: 'es-ES', options: LANGS, onChange: v => { opts.lang = v; } }),
    toggleCtl({ label: 'Escuchar el audio mientras se transcribe', value: true, onChange: v => { opts.listen = v; } }));
  const startBtn = h('button', { class: 'btn primary big' }, ih('captions', 16), 'Empezar');
  const stopBtn = h('button', { class: 'btn danger big', style: { display: 'none' } }, ih('square', 16), 'Parar y guardar');
  let el, ac, rec, track, subs = [], running = false, finished = false, cancelled = false, failed = false, raf = 0;
  const srcStart = c.in, srcEnd = c.in + c.duration * c.speed;
  const toTimeline = st => c.start + (st - c.in) / c.speed;
  const md = modal({ title: 'Subtítulos automáticos del clip', width: 560, onClose: () => { cancelled = true; cleanup(); },
    body: h('div', { class: 'rec-body' }, h('p', { class: 'hint' }, `Clip: ${c.name || m?.name || ''} (${fmtTime(c.duration)}). Se escuchará su audio y se crearán subtítulos que luego puedes corregir.`), optsBox, prog, status, live, h('div', { class: 'btn-row center' }, startBtn, stopBtn)) });

  function cleanup() {
    running = false; cancelAnimationFrame(raf);
    try { rec && (rec.onend = null, rec.abort()); } catch {}
    try { el?.pause(); } catch {}
    if (ac && ac.state !== 'closed') ac.close().catch(() => {});
  }
  async function startRec() {
    rec = await makeRecognizer(opts.lang);
    let segStart = null;
    rec.onresult = e => {
      const now = el.currentTime;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (segStart == null) segStart = Math.max(srcStart, now - 1.5);
        if (r.isFinal) { const txt = r[0].transcript.trim(); if (txt) subs.push(...chunkText(txt, toTimeline(segStart), toTimeline(Math.min(now + 0.2, srcEnd)))); segStart = null; }
        else interim += r[0].transcript;
      }
      live.textContent = (subs.slice(-1).map(s => s.text).join(' ') + ' ' + interim).trim();
    };
    rec.onerror = ev => { if (['not-allowed', 'network', 'service-not-allowed', 'language-not-supported'].includes(ev.error)) { failed = true; toast(ev.error === 'language-not-supported' ? 'Ese idioma no está disponible para transcribir.' : 'No se pudo transcribir (' + ev.error + '). Hace falta conexión a internet.', 'error', 7000); finish(); } };
    rec.onend = () => { if (running && !finished) startRec().catch(() => {}); };
    rec.start(track);
  }
  async function finish() {
    if (finished) return; finished = true; running = false;
    try { rec && (rec.onend = null, rec.stop()); } catch {}
    await new Promise(r => setTimeout(r, 1200)); // últimos resultados
    cleanup();
    if (cancelled) return;
    md.close();
    if (!subs.length) { if (!failed) toast('No se ha reconocido ninguna frase. Comprueba el idioma y que el clip tenga voz clara.', 'error', 6000); return; }
    for (const s of subs) { s.start = Math.max(c.start, s.start); s.end = Math.min(c.start + c.duration, Math.max(s.end, s.start + 0.6)); }
    addSubtitles(subs);
    toast(`${subs.length} subtítulos creados. Revísalos en el panel «Subtítulos».`, 'ok', 6000);
  }
  startBtn.onclick = async () => {
    startBtn.style.display = 'none'; optsBox.style.display = 'none'; stopBtn.style.display = '';
    el = new Audio(); el.src = cache.urls.get(c.mediaId); el.preservesPitch = true;
    ac = new AudioContext();
    const srcNode = ac.createMediaElementSource(el), dest = ac.createMediaStreamDestination();
    srcNode.connect(dest); if (opts.listen) srcNode.connect(ac.destination);
    track = dest.stream.getAudioTracks()[0];
    await new Promise(r => { el.onloadedmetadata = r; el.onerror = r; });
    el.currentTime = srcStart;
    await el.play().catch(() => {});
    running = true;
    try { await startRec(); } catch (e) { toast('No se pudo iniciar el reconocimiento: ' + e.message, 'error'); cleanup(); md.close(); return; }
    status.textContent = rec._local ? 'Transcribiendo en este ordenador…' : 'Transcribiendo (usa el servicio de voz de Google)…';
    const loop = () => {
      if (!running) return;
      const p = (el.currentTime - srcStart) / (srcEnd - srcStart);
      prog.firstChild.style.width = Math.min(100, p * 100) + '%';
      status.textContent = `${rec._local ? 'Transcribiendo en este ordenador' : 'Transcribiendo'}… ${fmtTime(el.currentTime - srcStart)} / ${fmtTime(srcEnd - srcStart)}`;
      if (el.currentTime >= srcEnd - 0.05 || el.ended) { finish(); return; }
      raf = requestAnimationFrame(loop);
    };
    loop();
  };
  stopBtn.onclick = () => finish();
}
