// Efectos de vídeo tipo «capa de ajuste»: afectan a todo lo que hay debajo durante el clip
export const EFFECTS = [
  ['glitch', 'Glitch', '⚡'], ['vhs', 'VHS retro', '📼'], ['oldfilm', 'Cine antiguo', '🎞️'], ['shake', 'Terremoto', '〰️'],
  ['zoompulse', 'Zoom al ritmo', '🔍'], ['rgb', 'Separación RGB', '🌈'], ['pixelate', 'Pixelado', '👾'], ['mirror', 'Espejo', '🪞'],
  ['blur', 'Desenfoque', '💧'], ['bw', 'Blanco y negro', '⚫'], ['lightleak', 'Destellos de luz', '🌅'], ['flash', 'Flash', '💥'],
  ['spotlight', 'Foco', '🔦'], ['confetti', 'Confeti', '🎉'], ['snow', 'Nieve', '❄️'], ['hearts', 'Corazones', '❤️'],
  ['sparkles', 'Brillos', '✨'], ['rain', 'Lluvia', '🌧️'], ['dream', 'Sueño', '☁️'], ['cinema', 'Bandas de cine', '🎬'],
];

const scratch = [document.createElement('canvas'), document.createElement('canvas'), document.createElement('canvas')];
function sc(i, W, H) { const c = scratch[i]; if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } return c; }
// pseudoaleatorio determinista (igual en vista previa y exportación)
const rnd = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
let grain = null;
function grainTile() {
  if (grain) return grain;
  grain = document.createElement('canvas'); grain.width = grain.height = 256;
  const x = grain.getContext('2d'), d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); return grain;
}

function copyCanvas(ctx, W, H) { const c = sc(0, W, H); const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'copy'; x.filter = 'none'; x.drawImage(ctx.canvas, 0, 0, W, H); return c; }

function rgbSplit(ctx, src, W, H, dx, dy = 0) {
  // separa los canales usando multiplicación por colores puros y los suma desplazados
  const ch = sc(1, W, H), x = ch.getContext('2d');
  ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [col, ox, oy] of [['#ff0000', -dx, -dy], ['#00ff00', 0, 0], ['#0000ff', dx, dy]]) {
    x.globalCompositeOperation = 'copy'; x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, W, H);
    ctx.drawImage(ch, ox, oy);
  }
  ctx.restore();
}

function particles(ctx, W, H, t, n, draw, seed = 1) {
  for (let i = 0; i < n; i++) {
    const r1 = rnd(i * 7.1 + seed), r2 = rnd(i * 3.3 + seed * 2), r3 = rnd(i * 1.7 + seed * 3);
    const speed = 0.08 + r2 * 0.25, y = ((r3 + t * speed) % 1.15) - 0.1, x = r1 + Math.sin(t * (0.5 + r2) + i) * 0.02;
    draw(x * W, y * H, i, r1, r2, r3);
  }
}

export function applyEffect(ctx, W, H, c, t) {
  const k = H / 1080, I = Math.max(0, Math.min(1, c.intensity ?? 0.7)), l = t - c.start;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  const frameN = Math.floor(t * 30);
  switch (c.effect) {
    case 'glitch': {
      const src = copyCanvas(ctx, W, H);
      const strong = rnd(frameN) < 0.35 + I * 0.4;
      if (strong) rgbSplit(ctx, src, W, H, Math.round((6 + 20 * I) * k * (rnd(frameN + 1) - 0.3)));
      const slices = Math.round(3 + I * 8);
      for (let i = 0; i < slices; i++) {
        if (rnd(frameN * 13 + i) > 0.6) continue;
        const y = rnd(frameN * 7 + i) * H, h = (5 + rnd(i + frameN) * 50) * k, off = (rnd(frameN * 3 + i) - 0.5) * 120 * k * I;
        ctx.drawImage(src, 0, y, W, h, off, y, W, h);
      }
      break;
    }
    case 'vhs': {
      const src = copyCanvas(ctx, W, H);
      rgbSplit(ctx, src, W, H, Math.round(4 * k * (0.5 + I)));
      ctx.globalAlpha = 0.18 * I; ctx.fillStyle = '#000';
      for (let y = 0; y < H; y += Math.max(2, 4 * k)) ctx.fillRect(0, y, W, Math.max(1, 1.5 * k));
      const by = ((l * 0.25) % 1.2 - 0.1) * H; ctx.globalAlpha = 0.25 * I; ctx.fillStyle = '#fff'; ctx.fillRect(0, by, W, 18 * k);
      ctx.globalAlpha = 0.12 * I; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(grainTile(), rnd(frameN) * 200, rnd(frameN + 5) * 200, W * 1.5, H * 1.5, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(46 * k)}px "Courier New", monospace`;
      ctx.shadowColor = '#000'; ctx.shadowBlur = 6 * k; ctx.fillText('PLAY ▶', 50 * k, 80 * k);
      const secs = Math.floor(t); ctx.fillText(`00:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, W - 330 * k, H - 50 * k);
      break;
    }
    case 'oldfilm': {
      const src = copyCanvas(ctx, W, H);
      ctx.globalCompositeOperation = 'copy'; ctx.filter = `sepia(${0.8 * I}) contrast(1.1) brightness(${1 - 0.08 * I + rnd(frameN) * 0.12 * I})`;
      const jy = (rnd(frameN * 2) < 0.1 ? 4 : 0) * k; ctx.drawImage(src, 0, jy); ctx.filter = 'none';
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.5 * I; ctx.drawImage(grainTile(), rnd(frameN) * 128, rnd(frameN + 9) * 128, 128, 128, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.5 * I; ctx.strokeStyle = 'rgba(30,20,10,.8)'; ctx.lineWidth = 1.5 * k;
      for (let i = 0; i < 3; i++) if (rnd(frameN + i * 31) < 0.5) { const x = rnd(frameN * 5 + i) * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rnd(i) - 0.5) * 20 * k, H); ctx.stroke(); }
      vignette(ctx, W, H, 0.7 * I);
      break;
    }
    case 'shake': {
      const src = copyCanvas(ctx, W, H), a = 30 * k * I;
      const dx = (rnd(frameN) - 0.5) * 2 * a, dy = (rnd(frameN + 77) - 0.5) * 2 * a, s = 1 + 0.06 * I;
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(src, (W - W * s) / 2 + dx, (H - H * s) / 2 + dy, W * s, H * s); break;
    }
    case 'zoompulse': {
      const src = copyCanvas(ctx, W, H), beat = Math.pow(Math.max(0, Math.sin(l * Math.PI * 2 * 1.0)), 6), s = 1 + 0.15 * I * beat;
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(src, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s); break;
    }
    case 'rgb': { const src = copyCanvas(ctx, W, H); rgbSplit(ctx, src, W, H, Math.round((4 + 26 * I) * k * (0.6 + 0.4 * Math.sin(l * 4))), Math.round(4 * k * I)); break; }
    case 'pixelate': {
      const src = copyCanvas(ctx, W, H), px = Math.max(2, Math.round((6 + 40 * I) * k)), sw = Math.max(2, Math.round(W / px)), sh = Math.max(2, Math.round(H / px));
      const t2 = sc(1, sw, sh), x = t2.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(src, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = 'copy'; ctx.drawImage(t2, 0, 0, sw, sh, 0, 0, W, H); ctx.imageSmoothingEnabled = true; break;
    }
    case 'mirror': { const src = copyCanvas(ctx, W, H); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, W / 2, H, 0, 0, W / 2, H); break; }
    case 'blur': { const src = copyCanvas(ctx, W, H); ctx.globalCompositeOperation = 'copy'; ctx.filter = `blur(${(2 + 18 * I) * k}px)`; ctx.drawImage(src, 0, 0); break; }
    case 'bw': { const src = copyCanvas(ctx, W, H); ctx.globalCompositeOperation = 'copy'; ctx.filter = `grayscale(${I}) contrast(${1 + 0.2 * I})`; ctx.drawImage(src, 0, 0); break; }
    case 'dream': { const src = copyCanvas(ctx, W, H); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.6 * I; ctx.filter = `blur(${14 * k}px) brightness(1.1) saturate(1.3)`; ctx.drawImage(src, 0, 0); break; }
    case 'lightleak': {
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) {
        const cx = (0.5 + 0.6 * Math.sin(l * (0.3 + i * 0.17) + i * 2)) * W, cy = (0.5 + 0.5 * Math.cos(l * (0.25 + i * 0.13) + i)) * H, r = (0.4 + 0.2 * i) * Math.max(W, H);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); const col = ['255,120,40', '255,60,140', '255,210,90'][i];
        g.addColorStop(0, `rgba(${col},${0.55 * I})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'flash': { const a = Math.max(0, 1 - l / 0.5) * I; if (a > 0) { ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); } break; }
    case 'spotlight': {
      const cx = (0.5 + 0.3 * Math.sin(l * 0.9)) * W, cy = (0.5 + 0.2 * Math.cos(l * 1.3)) * H, r = Math.min(W, H) * (0.45 - 0.2 * I);
      const g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.3); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.5 + 0.45 * I})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break;
    }
    case 'confetti': {
      const cols = ['#ff3b6b', '#ffd600', '#22c55e', '#3b82f6', '#a855f7', '#f97316'];
      particles(ctx, W, H, l, Math.round(40 + 120 * I), (x, y, i, r1, r2) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(l * (2 + r2 * 4) + i); ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-7 * k, -4 * k, 14 * k, 8 * k * (0.4 + Math.abs(Math.sin(l * 5 + i)))); ctx.restore();
      }, 3);
      break;
    }
    case 'snow': {
      ctx.fillStyle = '#fff';
      particles(ctx, W, H, l * 0.5, Math.round(60 + 160 * I), (x, y, i, r1, r2) => { ctx.globalAlpha = 0.5 + r2 * 0.5; ctx.beginPath(); ctx.arc(x, y, (2 + r2 * 5) * k, 0, 7); ctx.fill(); }, 5);
      break;
    }
    case 'hearts': {
      ctx.font = `${Math.round(48 * k)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center';
      particles(ctx, W, H, l, Math.round(10 + 30 * I), (x, y, i, r1, r2) => { ctx.globalAlpha = 0.9; ctx.save(); ctx.translate(x, H - y); ctx.scale(0.6 + r2, 0.6 + r2); ctx.fillText(['❤️', '💖', '💕'][i % 3], 0, 0); ctx.restore(); }, 9);
      break;
    }
    case 'sparkles': {
      for (let i = 0; i < Math.round(15 + 40 * I); i++) {
        const x = rnd(i * 4.1) * W, y = rnd(i * 9.7) * H, ph = Math.sin(l * (2 + rnd(i) * 3) + i * 1.3); if (ph < 0.2) continue;
        const r = (6 + rnd(i * 2) * 16) * k * ph; ctx.globalAlpha = ph; ctx.fillStyle = '#fff8d0';
        ctx.beginPath(); for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4, rr = j % 2 ? r * 0.25 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'rain': {
      ctx.strokeStyle = 'rgba(200,220,255,0.55)'; ctx.lineWidth = 1.5 * k;
      ctx.fillStyle = `rgba(20,30,50,${0.25 * I})`; ctx.fillRect(0, 0, W, H);
      particles(ctx, W, H, l * 4, Math.round(80 + 220 * I), (x, y) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6 * k, y + 30 * k); ctx.stroke(); }, 7);
      break;
    }
    case 'cinema': { const b = H * (0.06 + 0.08 * I); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); break; }
  }
  ctx.restore();
}

function vignette(ctx, W, H, a) {
  const r = Math.hypot(W, H) / 2, g = ctx.createRadialGradient(W / 2, H / 2, r * 0.4, W / 2, H / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
