// Plantillas de proyecto: estructura lista con huecos («Arrastra aquí…») para sustituir por tu material
import { newProject, makeClip, uid, SUB_STYLE } from './state.js';

const PH = (label, opts = {}) => makeClip('color', { placeholder: true, name: label, color1: '#2b2f45', color2: '#3d2b5a', gradient: true, angle: 135, ...opts });
const TXT = (text, opts = {}) => makeClip('text', { text, ...opts });

function builder(name, aspect) {
  const p = newProject(name, aspect);
  p.tracks = [];
  const track = (type, name) => { const t = { id: uid(), type, name, hidden: false, locked: false, muted: false }; if (type === 'subtitle') t.style = SUB_STYLE(); p.tracks.push(t); return t.id; };
  const add = (tid, c, start, dur) => { c.trackId = tid; c.start = start; if (dur != null) c.duration = dur; p.clips.push(c); return c; };
  return { p, track, add };
}

export const TEMPLATES = [
  {
    id: 'fotos', name: 'Presentación de fotos', aspect: '16:9', emoji: '🖼️', music: 'documental', desc: 'Título, 6 fotos con zoom suave y transiciones, y créditos',
    build() {
      const { p, track, add } = builder('Presentación de fotos', '16:9');
      const tx = track('visual', 'Textos'), v = track('visual', 'Fotos'); track('audio', 'Música');
      add(v, makeClip('color', { color1: '#0f172a', color2: '#312e81', gradient: true }), 0, 4);
      add(tx, TXT('Mi viaje', { font: 'Playfair Display', size: 150, animIn: { type: 'zoom-in', duration: 1 }, animOut: { type: 'fade', duration: 0.6 } }), 0.3, 3.5);
      for (let i = 0; i < 6; i++) { const c = add(v, PH(`Foto ${i + 1}`, { animLoop: { type: i % 2 ? 'kenburns-out' : 'kenburns-in', speed: 1 } }), 4 + i * 4, 4); c.transition = { type: 'crossfade', duration: 0.8 }; }
      add(v, makeClip('color', { color1: '#000000', gradient: false }), 28, 4).transition = { type: 'dip', duration: 1 };
      add(tx, TXT('Gracias por ver', { font: 'Playfair Display', size: 100, animIn: { type: 'fade', duration: 1 } }), 28.5, 3.5);
      return p;
    },
  },
  {
    id: 'noticias', name: 'Noticiario', aspect: '16:9', emoji: '📰', music: 'corporativo', desc: 'Cabecera, presentador con rótulo, reportaje y despedida',
    build() {
      const { p, track, add } = builder('Noticiario', '16:9');
      const tx = track('visual', 'Rótulos'), v = track('visual', 'Vídeo'); track('audio', 'Música');
      add(v, makeClip('color', { color1: '#7f1d1d', color2: '#1e3a8a', gradient: true, angle: 120 }), 0, 4);
      add(tx, TXT('NOTICIAS\nDEL INSTITUTO', { font: 'Anton', size: 150, letterSpacing: 8, lineHeight: 1, animIn: { type: 'pop', duration: 0.6 } }), 0.2, 3.6);
      add(v, PH('Presentador/a'), 4, 10).transition = { type: 'slide-left', duration: 0.6 };
      add(tx, TXT('Nombre Apellido\nPresentador/a', { font: 'Poppins', size: 46, align: 'left', bgColor: '#b91c1c', bgOpacity: 1, bgRadius: 6, shadow: false, x: 0.25, y: 0.83, boxW: 0.45, animIn: { type: 'slide-left', duration: 0.5 }, animOut: { type: 'slide-left', duration: 0.4 } }), 5, 5);
      add(v, PH('Reportaje (imágenes de la noticia)'), 14, 12).transition = { type: 'wipe-right', duration: 0.7 };
      add(tx, TXT('ÚLTIMA HORA', { font: 'Archivo Black', size: 50, color: '#111111', bgColor: '#ffd600', bgOpacity: 1, bgRadius: 4, shadow: false, x: 0.15, y: 0.1, animIn: { type: 'zoom-in', duration: 0.4 } }), 14.5, 11);
      add(v, makeClip('color', { color1: '#1e3a8a', color2: '#7f1d1d', gradient: true }), 26, 4).transition = { type: 'crossfade', duration: 0.6 };
      add(tx, TXT('¡Hasta la próxima!', { font: 'Montserrat', size: 110, animIn: { type: 'rise', duration: 0.7 } }), 26.3, 3.5);
      return p;
    },
  },
  {
    id: 'tutorial', name: 'Tutorial', aspect: '16:9', emoji: '🧑‍🏫', music: 'lofi', desc: 'Grabación de pantalla con tu cámara en un círculo y pasos',
    build() {
      const { p, track, add } = builder('Tutorial', '16:9');
      const tx = track('visual', 'Textos'), cam = track('visual', 'Cámara'), v = track('visual', 'Pantalla'); track('audio', 'Voz y música');
      add(v, makeClip('color', { color1: '#0f766e', color2: '#1e1b4b', gradient: true }), 0, 3);
      add(tx, TXT('Cómo hacer…', { font: 'Poppins', size: 120, animIn: { type: 'pop', duration: 0.6 } }), 0.2, 2.8);
      add(v, PH('Pantalla: selecciona este hueco y usa Grabar → Pantalla'), 3, 30).transition = { type: 'crossfade', duration: 0.5 };
      add(cam, PH('Cámara: selecciónalo y Grabar → Cámara', { mask: 'circle', borderWidth: 8, dropShadow: true, scale: 0.4, x: 0.85, y: 0.75, fit: 'cover' }), 3, 30);
      ['Paso 1', 'Paso 2', 'Paso 3'].forEach((s, i) => add(tx, TXT(s, { font: 'Montserrat', size: 56, color: '#111111', bgColor: '#ffffff', bgOpacity: 1, bgRadius: 30, shadow: false, x: 0.12, y: 0.1, animIn: { type: 'slide-left', duration: 0.4 } }), 3.5 + i * 10, 3));
      return p;
    },
  },
  {
    id: 'vertical', name: 'Vídeo vertical', aspect: '9:16', emoji: '📱', music: 'pop', desc: 'Para TikTok o Reels: gancho, vídeo y subtítulos karaoke',
    build() {
      const { p, track, add } = builder('Vídeo vertical', '9:16');
      p.settings.bgMode = 'blur';
      const sub = track('subtitle', 'Subtítulos'), tx = track('visual', 'Textos'), v = track('visual', 'Vídeo'); track('audio', 'Música');
      p.tracks.find(t => t.id === sub).style = { ...SUB_STYLE(), font: 'Montserrat', size: 72, bgOpacity: 0, stroke: 5, y: 0.7, karaoke: true, karaokeColor: '#ffd600' };
      add(v, PH('Tu vídeo vertical'), 0, 15);
      add(tx, TXT('¿SABÍAS QUE…?', { font: 'Bangers', size: 140, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, y: 0.15, animIn: { type: 'bounce', duration: 0.8 }, animLoop: { type: 'pulse', speed: 1 } }), 0, 3);
      add(tx, TXT('🤯', { size: 220, shadow: false, bold: false, font: 'Roboto', x: 0.8, y: 0.3, animIn: { type: 'pop', duration: 0.5 } }), 0.5, 2.5);
      add(sub, makeClip('subtitle', { text: 'Escribe aquí lo que dices en el vídeo' }), 3, 4);
      add(sub, makeClip('subtitle', { text: 'o usa Subtítulos → Generar desde el audio' }), 7.2, 4);
      add(tx, TXT('¡Sígueme para más!', { font: 'Montserrat', size: 80, bgColor: '#7c5cff', bgOpacity: 1, bgRadius: 40, shadow: false, y: 0.85, animIn: { type: 'rise', duration: 0.5 } }), 12, 3);
      return p;
    },
  },
  {
    id: 'entrevista', name: 'Entrevista', aspect: '16:9', emoji: '🎙️', music: 'documental', desc: 'Pantalla dividida con dos personas y sus rótulos',
    build() {
      const { p, track, add } = builder('Entrevista', '16:9');
      const tx = track('visual', 'Rótulos'), b = track('visual', 'Persona 2'), a = track('visual', 'Persona 1'); track('audio', 'Audio');
      add(a, makeClip('color', { color1: '#111827', color2: '#374151', gradient: true }), 0, 3);
      add(tx, TXT('ENTREVISTA', { font: 'Oswald', size: 140, letterSpacing: 12, animIn: { type: 'fade', duration: 0.8 } }), 0.2, 2.8);
      add(a, PH('Persona 1', { x: 0.25, scale: 0.5 }), 3, 20).transition = { type: 'crossfade', duration: 0.5 };
      add(b, PH('Persona 2', { x: 0.75, scale: 0.5 }), 3, 20);
      add(tx, TXT('Entrevistador/a', { font: 'Poppins', size: 40, bgColor: '#0f766e', bgOpacity: 1, bgRadius: 6, shadow: false, x: 0.25, y: 0.86, animIn: { type: 'rise', duration: 0.4 } }), 3.5, 6);
      add(tx, TXT('Invitado/a', { font: 'Poppins', size: 40, bgColor: '#7c3aed', bgOpacity: 1, bgRadius: 6, shadow: false, x: 0.75, y: 0.86, animIn: { type: 'rise', duration: 0.4 } }), 3.5, 6);
      return p;
    },
  },
  {
    id: 'trailer', name: 'Tráiler', aspect: '16:9', emoji: '🎬', music: 'epica', desc: 'Frases dramáticas, planos rápidos, bandas de cine y título final',
    build() {
      const { p, track, add } = builder('Tráiler', '16:9');
      const fx = track('visual', 'Efectos'), tx = track('visual', 'Textos'), v = track('visual', 'Planos'); track('audio', 'Música');
      add(fx, makeClip('effect', { effect: 'cinema', intensity: 0.6 }), 0, 30);
      const lines = ['ESTE CURSO…', 'NADA SERÁ IGUAL', 'UNA HISTORIA REAL'];
      let t = 0;
      lines.forEach((l, i) => {
        add(v, makeClip('color', { color1: '#000000', gradient: false }), t, 3);
        add(tx, TXT(l, { font: 'Bebas Neue', size: 140, letterSpacing: 10, animIn: { type: 'fade', duration: 0.8 }, animOut: { type: 'fade', duration: 0.6 } }), t + 0.2, 2.6);
        add(v, PH(`Plano ${i + 1}`, { animLoop: { type: 'kenburns-in', speed: 1.5 } }), t + 3, 4).transition = { type: 'crossfade', duration: 0.4 };
        t += 7;
      });
      add(v, makeClip('color', { color1: '#000000', gradient: false }), t, 5).transition = { type: 'dip', duration: 1 };
      add(tx, TXT('EL TÍTULO', { font: 'Anton', size: 200, letterSpacing: 20, animIn: { type: 'zoom-out', duration: 1.2 } }), t + 0.5, 3);
      add(tx, TXT('PRÓXIMAMENTE', { font: 'Oswald', size: 50, letterSpacing: 14, y: 0.7, animIn: { type: 'fade', duration: 1 } }), t + 2, 2.5);
      add(fx, makeClip('effect', { effect: 'flash', intensity: 1 }), t + 0.5, 0.6);
      return p;
    },
  },
  {
    id: 'ciencia', name: 'Experimento científico', aspect: '16:9', emoji: '🧪', music: 'documental', desc: 'Hipótesis, materiales, procedimiento, resultados y conclusión',
    build() {
      const { p, track, add } = builder('Experimento científico', '16:9');
      const tx = track('visual', 'Títulos'), v = track('visual', 'Vídeo'); track('audio', 'Voz y música');
      const parts = ['1. Hipótesis', '2. Materiales', '3. Procedimiento', '4. Resultados', '5. Conclusión'];
      let t = 0;
      add(v, makeClip('color', { color1: '#064e3b', color2: '#0c4a6e', gradient: true }), 0, 3);
      add(tx, TXT('Nuestro experimento', { font: 'Montserrat', size: 120, animIn: { type: 'pop', duration: 0.6 } }), 0.2, 2.8);
      t = 3;
      parts.forEach((s, i) => {
        add(v, makeClip('color', { color1: '#0f172a', color2: '#1e3a8a', gradient: true }), t, 2).transition = { type: 'slide-left', duration: 0.5 };
        add(tx, TXT(s, { font: 'Poppins', size: 110, animIn: { type: 'rise', duration: 0.5 } }), t + 0.1, 1.9);
        add(v, PH(`Vídeo o foto: ${s.slice(3)}`), t + 2, 6).transition = { type: 'crossfade', duration: 0.5 };
        add(tx, TXT(s.slice(3).toUpperCase(), { font: 'Montserrat', size: 40, bgColor: '#000000', bgOpacity: 0.6, bgRadius: 8, shadow: false, x: 0.15, y: 0.08 }), t + 2.2, 5.8);
        t += 8;
      });
      return p;
    },
  },
];
