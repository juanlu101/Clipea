// Grabación de pantalla, cámara, pantalla + cámara y voz en off (con subtítulos automáticos opcionales)
import { store, fmtTime, commit, makeClip, placeClip, select, overlaps, selected } from './state.js';
import { h, ih, modal, toast, toggleCtl, selectCtl } from './ui.js';
import { importFile } from './media.js';
import { addMediaToTimeline, replaceMedia } from './actions.js';
import { play, pause, seekTo } from './player.js';
import { addSubtitles, chunkText } from './subtitles.js';
import { makeRecognizer } from './speech.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const TITLES = { screen: 'Grabar pantalla', camera: 'Grabar cámara', screencam: 'Pantalla + cámara', voice: 'Grabar voz en off' };

function pickMime(audioOnly) {
  const list = audioOnly
    ? ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
    : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find(m => MediaRecorder.isTypeSupported(m)) || '';
}

export async function openRecorder(mode, preset = {}) {
  if (!navigator.mediaDevices) { toast('Tu navegador no permite grabar. Usa Chrome o Edge.', 'error'); return; }
  const opts = { mic: true, subs: !!preset.subs, lang: 'es-ES', playAlong: mode === 'voice' };
  let streams = [], finalStream = null, recorder = null, chunks = [], t0 = 0, timerId = 0, recognition = null, subs = [], raf = 0, recording = false, cancelled = false;
  const preview = h('video', { class: 'rec-preview', autoplay: true, muted: true, playsinline: true });
  const meter = h('div', { class: 'rec-meter' }, h('div', { class: 'bar' }));
  const status = h('div', { class: 'rec-status' }, 'Pulsa «Empezar» cuando estés listo.');
  const transcript = h('div', { class: 'rec-transcript' });
  const startBtn = h('button', { class: 'btn primary big' }, ih('mic', 16), 'Empezar');
  const stopBtn = h('button', { class: 'btn danger big', style: { display: 'none' } }, ih('square', 16), 'Detener');

  const optsBox = h('div', { class: 'rec-opts' });
  if (mode === 'screen') optsBox.append(toggleCtl({ label: 'Grabar también mi micrófono', value: true, onChange: v => { opts.mic = v; } }));
  if (mode === 'voice') optsBox.append(toggleCtl({ label: 'Reproducir el vídeo mientras grabo (usa auriculares)', value: true, onChange: v => { opts.playAlong = v; } }));
  if (SR && mode !== 'screen') {
    optsBox.append(toggleCtl({ label: 'Crear subtítulos automáticos de lo que digo', value: opts.subs, onChange: v => { opts.subs = v; } }));
    optsBox.append(selectCtl({ label: 'Idioma de los subtítulos', value: 'es-ES', options: [['es-ES', 'Castellano'], ['ca-ES', 'Català'], ['gl-ES', 'Galego'], ['eu-ES', 'Euskara'], ['en-US', 'English'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-PT', 'Português']], onChange: v => { opts.lang = v; } }));
  }

  const body = h('div', { class: 'rec-body' }, mode === 'voice' ? meter : preview, status, transcript, optsBox, h('div', { class: 'btn-row center' }, startBtn, stopBtn));
  const m = modal({ title: TITLES[mode], body, width: 640, onClose: () => { cancelled = true; cleanup(); } });

  function cleanup() {
    clearInterval(timerId); cancelAnimationFrame(raf);
    try { recognition && (recognition.onend = null, recognition.stop()); } catch {}
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    streams.forEach(s => s.getTracks().forEach(t => t.stop()));
    if (store.playing) pause();
  }

  // Preparar fuentes
  try {
    if (mode === 'camera') {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } });
      streams.push(s); finalStream = s;
    } else if (mode === 'voice') {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streams.push(s); finalStream = s;
      const ac = new AudioContext(); const an = ac.createAnalyser(); ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => { an.getByteTimeDomainData(buf); let mx = 0; for (const v of buf) mx = Math.max(mx, Math.abs(v - 128)); meter.firstChild.style.width = Math.min(100, mx / 128 * 180) + '%'; raf = requestAnimationFrame(loop); };
      loop();
    } else {
      status.textContent = 'Elige qué pantalla, ventana o pestaña quieres grabar…';
      const scr = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      streams.push(scr);
      scr.getVideoTracks()[0].addEventListener('ended', () => { if (recording) stopBtn.click(); });
      let cam = null;
      if (mode === 'screencam') { cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: { echoCancellation: true, noiseSuppression: true } }); streams.push(cam); }
      else if (opts.mic) { try { cam = await navigator.mediaDevices.getUserMedia({ audio: true }); streams.push(cam); } catch { toast('No se pudo usar el micrófono', 'error'); } }
      // mezcla de audio
      const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
      let hasAudio = false;
      for (const s of [scr, cam]) if (s && s.getAudioTracks().length) { ac.createMediaStreamSource(s).connect(dest); hasAudio = true; }
      let vtrack = scr.getVideoTracks()[0];
      if (mode === 'screencam') {
        const sv = h('video', { muted: true, autoplay: true, playsinline: true }); sv.srcObject = scr;
        const cv = h('video', { muted: true, autoplay: true, playsinline: true }); cv.srcObject = cam;
        await Promise.all([sv.play(), cv.play()]);
        const canvas = h('canvas', { width: 1280, height: 720 }); const ctx = canvas.getContext('2d');
        const draw = () => {
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 720);
          const s = Math.min(1280 / sv.videoWidth, 720 / sv.videoHeight) || 1;
          ctx.drawImage(sv, (1280 - sv.videoWidth * s) / 2, (720 - sv.videoHeight * s) / 2, sv.videoWidth * s, sv.videoHeight * s);
          const r = 110, cx = 1280 - r - 30, cy = 720 - r - 30;
          ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
          const cs = Math.max(2 * r / cv.videoWidth, 2 * r / cv.videoHeight) || 1;
          ctx.translate(cx, cy); ctx.scale(-1, 1);
          ctx.drawImage(cv, -cv.videoWidth * cs / 2, -cv.videoHeight * cs / 2, cv.videoWidth * cs, cv.videoHeight * cs);
          ctx.restore();
          ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
          raf = requestAnimationFrame(draw);
        };
        draw();
        vtrack = canvas.captureStream(30).getVideoTracks()[0];
      }
      finalStream = new MediaStream([vtrack, ...(hasAudio ? dest.stream.getAudioTracks() : [])]);
    }
  } catch (e) {
    m.close();
    toast(e.name === 'NotAllowedError' ? 'Permiso denegado. Permite el acceso a la cámara/micrófono/pantalla en el candado de la barra de direcciones.' : 'No se pudo iniciar la grabación: ' + e.message, 'error', 7000);
    return;
  }
  if (cancelled) return cleanup();
  if (mode !== 'voice') preview.srcObject = finalStream;
  if (mode === 'camera') preview.style.transform = 'scaleX(-1)';
  status.textContent = 'Listo para grabar.';

  const startAt = store.time;
  startBtn.onclick = async () => {
    startBtn.style.display = 'none'; optsBox.style.display = 'none';
    for (let i = 3; i > 0; i--) { status.innerHTML = `<span class="countdown">${i}</span>`; await new Promise(r => setTimeout(r, 800)); if (cancelled) return; }
    const mime = pickMime(mode === 'voice');
    recorder = new MediaRecorder(finalStream, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : {});
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = finish;
    recorder.start(1000);
    recording = true; t0 = performance.now();
    if (opts.playAlong && mode === 'voice') { seekTo(startAt); play(); }
    if (opts.subs && SR) startRecognition();
    stopBtn.style.display = '';
    timerId = setInterval(() => { status.innerHTML = `<span class="rec-dot"></span> Grabando… ${fmtTime((performance.now() - t0) / 1000)}`; }, 250);
  };
  stopBtn.onclick = () => { recording = false; stopBtn.disabled = true; status.textContent = 'Procesando…'; recorder?.stop(); };

  async function startRecognition() {
    recognition = await makeRecognizer(opts.lang);
    let segStart = null;
    recognition.onresult = e => {
      const now = (performance.now() - t0) / 1000;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (segStart == null) segStart = Math.max(0, now - 1.2);
        if (r.isFinal) { subs.push(...chunkText(r[0].transcript, segStart, now + 0.3)); segStart = null; }
        else interim += r[0].transcript;
      }
      transcript.textContent = (subs.slice(-2).map(s => s.text).join(' ') + ' ' + interim).trim();
    };
    recognition.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'network') toast('Subtítulos automáticos no disponibles (' + ev.error + ')', 'error'); };
    recognition.onend = () => { if (recording) startRecognition().catch(() => {}); };
    try { recognition.start(); } catch {}
  }

  async function finish() {
    if (cancelled) { toast('Grabación descartada'); return; }
    const dur = (performance.now() - t0) / 1000;
    if (store.playing) pause();
    const type = recorder.mimeType || (mode === 'voice' ? 'audio/webm' : 'video/webm');
    const ext = type.includes('mp4') ? (mode === 'voice' ? 'm4a' : 'mp4') : 'webm';
    const blob = new Blob(chunks, { type });
    streams.forEach(s => s.getTracks().forEach(t => t.stop()));
    cancelAnimationFrame(raf); clearInterval(timerId);
    try { recognition && (recognition.onend = null, recognition.stop()); } catch {}
    const names = { screen: 'Pantalla', camera: 'Cámara', screencam: 'Pantalla+cámara', voice: 'Voz' };
    const name = `${names[mode]} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.${ext}`;
    try {
      const file = new File([blob], name, { type });
      const media = await importFile(file, name);
      if (!isFinite(media.duration)) media.duration = dur;
      if (mode === 'voice' || media.type === 'audio') {
        const c = makeClip('audio', { mediaId: media.id, duration: media.duration, name, start: startAt });
        const tr = store.project.tracks.find(t => t.type === 'audio' && !t.locked && !overlaps(t.id, startAt, startAt + c.duration));
        placeClip(c, tr?.id, startAt); select(c.id); commit();
      } else {
        const ph = selected();
        if (ph?.placeholder) replaceMedia(ph, media); // si había un hueco de plantilla seleccionado, lo rellena
        else addMediaToTimeline(media, null, startAt);
      }
      if (subs.length) { addSubtitles(subs, startAt); toast(`${subs.length} subtítulos creados. Revísalos en el panel «Subtítulos».`, 'ok', 5000); }
      toast('Grabación añadida a la línea de tiempo', 'ok');
    } catch (e) { toast('Error al guardar la grabación: ' + e.message, 'error', 6000); }
    m.close();
  }
}
