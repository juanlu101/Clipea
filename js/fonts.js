// Fuentes disponibles (Google Fonts, cargadas en index.html) + fuentes del sistema
export const FONTS = [
  'Montserrat', 'Roboto', 'Poppins', 'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Bangers', 'Righteous', 'Orbitron',
  'Lobster', 'Pacifico', 'Dancing Script', 'Caveat', 'Permanent Marker', 'Shadows Into Light', 'Press Start 2P',
  'Playfair Display', 'Merriweather', 'Comic Neue', 'Arial', 'Georgia', 'Courier New', 'Impact',
];

export async function ensureFonts(names) {
  if (!document.fonts) return;
  await Promise.all([...new Set(names)].flatMap(n => [document.fonts.load(`400 40px "${n}"`), document.fonts.load(`700 40px "${n}"`)]).map(p => p.catch(() => {})));
}
