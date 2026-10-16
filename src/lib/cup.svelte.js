// Single source of truth for the cup. Everything in the UI binds to this,
// and the 3D scene reacts to it through $effect.

export const PRESETS = [
  { id: 'mug', name: 'Mug', points: [[38, 0], [40, 30], [41, 70], [41.5, 96]] },
  { id: 'tulip', name: 'Tulip', points: [[26, 0], [31, 14], [38, 46], [40, 74], [45, 100]] },
  { id: 'espresso', name: 'Espresso', points: [[20, 0], [24, 14], [28, 40], [31.5, 60]] },
  { id: 'bowl', name: 'Latte bowl', points: [[30, 0], [46, 18], [56, 46], [61, 74]] },
  { id: 'barrel', name: 'Barrel', points: [[34, 0], [40, 26], [42.5, 52], [39, 88], [37, 100]] },
  { id: 'tumbler', name: 'Tumbler', points: [[30, 0], [35, 60], [41, 122]] },
  { id: 'waist', name: 'Waisted', points: [[40, 0], [35, 42], [36, 70], [44, 106]] },
  { id: 'flare', name: 'Flared lip', points: [[35, 0], [37, 56], [39, 84], [47, 100]] }
];

export const FINISHES = {
  glossy: { name: 'Glossy glaze', roughness: 0.09, speckleOk: true },
  satin: { name: 'Satin glaze', roughness: 0.34, speckleOk: true },
  matte: { name: 'Matte stoneware', roughness: 0.78, speckleOk: true },
  porcelain: { name: 'Porcelain', roughness: 0.05, speckleOk: false },
  terracotta: { name: 'Raw terracotta', roughness: 0.94, speckleOk: true, clay: true },
  enamel: { name: 'Enamel', roughness: 0.12, speckleOk: false },
  metal: { name: 'Brushed steel', roughness: 0.3, metal: true },
  glass: { name: 'Glass', roughness: 0.03, glass: true }
};

export const FONTS = $state([
  { family: 'DM Serif Display', google: true },
  { family: 'Playfair Display', google: true },
  { family: 'Fraunces', google: true },
  { family: 'Abril Fatface', google: true },
  { family: 'Cinzel', google: true },
  { family: 'Yeseva One', google: true },
  { family: 'Pacifico', google: true },
  { family: 'Dancing Script', google: true },
  { family: 'Great Vibes', google: true },
  { family: 'Caveat', google: true },
  { family: 'Permanent Marker', google: true },
  { family: 'Lobster', google: true },
  { family: 'Shrikhand', google: true },
  { family: 'Bebas Neue', google: true },
  { family: 'Righteous', google: true },
  { family: 'Bungee', google: true },
  { family: 'Monoton', google: true },
  { family: 'Space Grotesk', google: true },
  { family: 'Josefin Sans', google: true },
  { family: 'Fredoka', google: true },
  { family: 'Rubik Mono One', google: true },
  { family: 'Georgia', google: false },
  { family: 'Helvetica', google: false },
  { family: 'Courier New', google: false }
]);

export const SWATCHES = ['#3d5a6c', '#e9e4d8', '#1f2326', '#8a9a7b', '#c2683f', '#d9b44a', '#6d4c7d', '#a8c3cf', '#7a2e2e', '#f2f0eb'];

const toPts = (arr) => arr.map(([r, y]) => ({ r, y }));

export const cup = $state({
  mode: 'spline', // 'spline' | 'freeform'
  points: toPts(PRESETS[0].points),
  freePoints: [],
  freeSmooth: 2,
  freeTool: 'draw', // 'draw' | 'sculpt'
  selected: -1,

  wall: 4,
  base: 6,
  footRound: 3,
  footRing: true,
  footDepth: 2.5,
  innerRound: 9,

  handle: { type: 'classic', reach: 30, top: 80, bottom: 26, thickness: 11, width: 15, flare: 0.25 },

  text: {
    content: 'first, coffee',
    family: 'DM Serif Display',
    fallback: 'serif',
    weight: 400,
    italic: false,
    size: 13,
    spacing: 0.4,
    lineHeight: 1.1,
    y: 52,
    angle: 0,
    repeat: 1,
    style: 'deboss', // deboss | emboss | print | etch
    depth: 0.6,
    pool: 0.75,
    ink: '#1b1b1b'
  },

  finish: 'glossy',
  color: '#3d5a6c',
  innerColor: '#ece6d8',
  rimMode: 'outside', // outside | inside | custom
  rimColor: '#20262a',
  speckle: true,
  speckleDensity: 0.45,
  rawFoot: 9,
  clayColor: '#b99877',

  saucer: { type: 'saucer', size: 76, match: true, color: '#ece6d8' },

  scene: { wood: 'oak', sun: 38, exposure: 1 },

  fontTick: 0
});

export function applyPreset(p) {
  cup.mode = 'spline';
  cup.points = toPts(p.points);
  cup.selected = -1;
}

// ---------- font loading ----------
const loaded = new Set();
export async function loadFont(f) {
  if (!f || !f.google || loaded.has(f.family)) return;
  loaded.add(f.family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}&display=block`;
  document.head.appendChild(link);
  await new Promise((res) => {
    link.onload = res;
    link.onerror = res;
    setTimeout(res, 4000);
  });
  try {
    await document.fonts.load(`400 64px "${f.family}"`);
  } catch {}
  cup.fontTick++;
}
