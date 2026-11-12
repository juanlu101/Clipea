// Biblioteca de contenido libre: Wikimedia Commons (vídeos, fotos, música y sonidos) con licencia y autoría
import { store, commit, fmtTime, getMedia } from './state.js';
import { importFile } from './media.js';
import { toast } from './ui.js';

const API = 'https://commons.wikimedia.org/w/api.php';
// Filtro de contenido para el aula (se excluyen resultados con estas palabras)
const BLOCK = ['nude', 'naked', 'nudity', 'sex', 'sexual', 'porn', 'erotic', 'erotica', 'penis', 'vagina', 'vulva', 'breast', 'nipple', 'genital', 'masturbat', 'fetish', 'bdsm', 'nsfw', 'xxx', 'desnud', 'pornogr', 'topless', 'bikini', 'lingerie', 'gore', 'corpse', 'cadaver', 'autopsy', 'execution', 'beheading', 'nazi propaganda'];
const NEG = ' -nude -naked -nudity -sex -porn -erotic -penis -vagina -topless -genitals';

export const KINDS = {
  video: { label: 'Vídeos', filetype: 'filetype:video', ex: ['naturaleza', 'océano', 'ciudad', 'espacio', 'animales', 'nubes', 'fuego', 'ciencia', 'deporte', 'historia', 'lluvia', 'tráfico'] },
  image: { label: 'Fotos', filetype: 'filetype:bitmap', ex: ['paisaje', 'montaña', 'playa', 'bosque', 'planeta', 'célula', 'volcán', 'arquitectura', 'cuadro museo', 'mapa antiguo', 'animales', 'flores'] },
  audio: { label: 'Música y sonidos', filetype: 'filetype:audio', ex: ['música clásica', 'piano', 'jazz', 'orquesta', 'guitarra', 'aplausos', 'pájaros', 'lluvia', 'olas', 'tormenta', 'campanas', 'tren'] },
};
// Traducciones para obtener más resultados (Commons está sobre todo en inglés)
const EN = { naturaleza: 'nature', océano: 'ocean', ciudad: 'city timelapse', espacio: 'space nasa', animales: 'animals wildlife', nubes: 'clouds timelapse', fuego: 'fire flames', ciencia: 'science experiment', deporte: 'sport', historia: 'historical footage', lluvia: 'rain', tráfico: 'traffic', paisaje: 'landscape', montaña: 'mountain', playa: 'beach', bosque: 'forest', planeta: 'planet', célula: 'cell microscope', volcán: 'volcano', arquitectura: 'architecture', 'cuadro museo': 'painting museum', 'mapa antiguo': 'old map', flores: 'flowers', 'música clásica': 'classical music', piano: 'piano music', jazz: 'jazz music', orquesta: 'orchestra', guitarra: 'guitar music', aplausos: 'applause', pájaros: 'birds singing', olas: 'ocean waves sound', tormenta: 'thunderstorm', campanas: 'bells', tren: 'train sound' };

const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const blocked = s => { const t = s.toLowerCase(); return BLOCK.some(w => t.includes(w)); };

export async function search(kind, q, offset = 0) {
  const K = KINDS[kind];
  const term = (EN[q.trim().toLowerCase()] || q.trim()) || K.ex[0];
  const p = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6', gsrlimit: '30', gsroffset: String(offset),
    gsrsearch: `${K.filetype} ${term}${NEG}`, prop: kind === 'image' ? 'imageinfo' : 'imageinfo|videoinfo',
    iiprop: 'url|size|mime|extmetadata|mediatype', iiurlwidth: '360', iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName|ImageDescription|Categories',
  });
  if (kind !== 'image') p.set('viprop', 'derivatives');
  const r = await fetch(`${API}?${p}`, { headers: { 'Api-User-Agent': 'Clipea/1.0 (uso educativo)' } });
  if (!r.ok) throw new Error('Wikimedia Commons no responde (' + r.status + ')');
  const j = await r.json();
  const pages = Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const out = [];
  for (const pg of pages) {
    const ii = pg.imageinfo?.[0]; if (!ii) continue;
    const md = ii.extmetadata || {};
    const title = strip(md.ObjectName?.value) || pg.title.replace(/^File:|^Archivo:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const text = [pg.title, title, strip(md.ImageDescription?.value), strip(md.Categories?.value)].join(' ');
    if (blocked(text)) continue;
    const derivs = pg.videoinfo?.[0]?.derivatives || [];
    const item = {
      kind, title, page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(pg.title)}`,
      author: strip(md.Artist?.value) || 'Autor desconocido', license: strip(md.LicenseShortName?.value) || 'Licencia libre',
      thumb: ii.thumburl || (kind === 'image' ? ii.url : null), duration: ii.duration || pg.videoinfo?.[0]?.duration || null,
      width: ii.width, height: ii.height, size: ii.size, mime: ii.mime,
    };
    item.url = pickUrl(kind, ii, derivs);
    if (!item.url) continue;
    if (kind === 'video' && item.duration && item.duration > 900) continue; // demasiado largos
    out.push(item);
  }
  return { items: out, next: j.continue?.gsroffset ?? null };
}

function pickUrl(kind, ii, derivs) {
  if (kind === 'image') {
    if (/svg|tiff|xcf|djvu|pdf/.test(ii.mime)) return ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, '/1920px-') : null;
    if ((ii.width || 0) > 2400 && ii.thumburl) return ii.thumburl.replace(/\/\d+px-/, '/1920px-');
    return ii.url;
  }
  if (kind === 'video') {
    if (ii.mime && !/video|ogg/.test(ii.mime)) return null;
    const ok = derivs.filter(d => /webm|mp4/.test(d.type || d.src) && !/ogg|theora/.test(d.type || ''));
    const sized = ok.filter(d => (d.height || 0) <= 720).sort((a, b) => (b.height || 0) - (a.height || 0) || (/vp9/.test(b.type) - /vp9/.test(a.type)));
    if (sized.length) return sized[0].src;
    if (/webm|mp4/.test(ii.mime) && (ii.size || 0) < 150e6) return ii.url;
    return ok[0]?.src || null;
  }
  // audio
  if (ii.mime && /^video\//.test(ii.mime)) return null;
  const mp3 = derivs.find(d => /mpeg|mp3/.test(d.type || d.src));
  if (mp3) return mp3.src;
  if (/mpeg|ogg|opus|wav|flac|webm/.test(ii.mime) && (ii.size || 0) < 80e6) return ii.url;
  return derivs[0]?.src || null;
}

// Descarga el archivo y lo añade al proyecto con sus créditos
export async function download(item, onProgress) {
  const r = await fetch(item.url);
  if (!r.ok) throw new Error('No se pudo descargar (' + r.status + ')');
  const total = +(r.headers.get('Content-Length') || item.size || 0);
  const reader = r.body.getReader(); const parts = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress?.(total ? got / total : 0, got); }
  const type = r.headers.get('Content-Type') || '';
  const ext = (item.url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || (item.kind === 'image' ? 'jpg' : item.kind === 'video' ? 'webm' : 'mp3')).toLowerCase();
  const name = `${item.title.slice(0, 60)}.${ext}`;
  const m = await importFile(new File(parts, name, { type }), name);
  m.credit = { title: item.title, author: item.author, license: item.license, url: item.page, source: 'Wikimedia Commons' };
  commit();
  return m;
}

// Texto de créditos de todo el material de terceros usado en el proyecto
export function creditsText() {
  const used = new Set(store.project.clips.map(c => c.mediaId).filter(Boolean));
  const list = store.project.media.filter(m => m.credit && used.has(m.id));
  if (!list.length) return '';
  const lines = list.map(m => m.credit.source === 'generada' ? `«${m.credit.title}» — música generada con el editor` : `«${m.credit.title}» — ${m.credit.author} — ${m.credit.license} — ${m.credit.source}`);
  return 'CRÉDITOS\n\n' + lines.join('\n');
}

export function fmtDur(s) { return s ? fmtTime(s) : ''; }
