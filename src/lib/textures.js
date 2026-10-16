// All textures are painted on canvases at runtime — no image files needed.

export function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Smooth, seamlessly tiling value noise: upscale a tiny random canvas whose
// last row/column repeats the first, offset by half a cell so it wraps exactly.
function noiseCanvas(W, H, cx, cy, seed) {
  const small = makeCanvas(cx + 1, cy + 1);
  const sctx = small.getContext('2d');
  const id = sctx.createImageData(cx + 1, cy + 1);
  const r = rng(seed);
  const vals = new Float32Array(cx * cy);
  for (let i = 0; i < cx * cy; i++) vals[i] = r() * 255;
  for (let y = 0; y <= cy; y++)
    for (let x = 0; x <= cx; x++) {
      const v = vals[(y % cy) * cx + (x % cx)];
      const k = (y * (cx + 1) + x) * 4;
      id.data[k] = id.data[k + 1] = id.data[k + 2] = v;
      id.data[k + 3] = 255;
    }
  sctx.putImageData(id, 0, 0);
  const big = makeCanvas(W, H);
  const ctx = big.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const cw = W / cx, ch = H / cy;
  ctx.drawImage(small, -cw / 2, -ch / 2, W + cw, H + ch);
  return big;
}

function noiseLayer(W, H, cx, cy, seed) {
  return noiseCanvas(W, H, cx, cy, seed).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
}

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const shade = (h, k) => {
  const c = hex(h);
  return toHex(k < 0 ? c.map((v) => v * (1 + k)) : c.map((v) => v + (255 - v) * k));
};
export const luminance = (h) => {
  const [r, g, b] = hex(h);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

// ---------- wood ----------
export const WOODS = {
  oak: { name: 'Oak', light: [186, 156, 124], dark: [128, 96, 70] },
  walnut: { name: 'Walnut', light: [132, 90, 60], dark: [58, 36, 24] },
  ash: { name: 'Pale ash', light: [224, 206, 178], dark: [170, 142, 106] },
  smoked: { name: 'Smoked oak', light: [104, 76, 56], dark: [40, 28, 20] }
};

export function makeWood(kind, N = 2048, planks = 7, seed = 3) {
  const pal = WOODS[kind] || WOODS.oak;
  const L1 = noiseLayer(N, N, 5, 240, seed + 11);
  const L2 = noiseLayer(N, N, 36, 1000, seed + 23);
  const L3 = noiseLayer(N, N, 3, 26, seed + 37);
  const L4 = noiseLayer(N, N, 120, 1800, seed + 51);
  const color = makeCanvas(N, N), bump = makeCanvas(N, N), rough = makeCanvas(N, N);
  const cc = color.getContext('2d'), bc = bump.getContext('2d'), rc = rough.getContext('2d');
  const C = cc.createImageData(N, N), B = bc.createImageData(N, N), Rg = rc.createImageData(N, N);
  const r = rng(seed * 97 + 5);
  const ph = N / planks;
  const tone = [], shift = [], freq = [], joint2 = [];
  for (let i = 0; i < planks; i++) {
    tone.push((r() - 0.5) * 0.22);
    shift.push(Math.floor(r() * N));
    freq.push(0.035 + r() * 0.05);
    joint2.push(r() < 0.5 ? Math.floor(N * (0.3 + r() * 0.4)) : -1);
  }
  for (let y = 0; y < N; y++) {
    const pi = Math.min(planks - 1, Math.floor(y / ph));
    const yy = y - pi * ph;
    const edge = yy < 2.2 || yy > ph - 2.2;
    const nearEdge = yy < 9 || yy > ph - 9;
    for (let x = 0; x < N; x++) {
      const k = y * N + x, i4 = k * 4;
      const w = L3[i4] / 255 - 0.5, g1 = L1[i4] / 255, g2 = L2[i4] / 255, g4 = L4[i4] / 255;
      const ring = Math.sin(yy * freq[pi] + w * 9 + g1 * 5 + pi * 13.1);
      let v = 0.42 * g1 + 0.22 * g2 + 0.36 * Math.pow(0.5 + 0.5 * ring, 2.4) + tone[pi];
      v = Math.max(0, Math.min(1, v));
      const pore = g4 > 0.7 ? (g4 - 0.7) * 2.6 : 0;
      const xx = (x + shift[pi]) % N;
      const joint = xx < 2 || (joint2[pi] > 0 && Math.abs(xx - joint2[pi]) < 1.5);
      let dark = 1 - pore * 0.3;
      if (edge || joint) dark *= 0.45;
      else if (nearEdge) dark *= 0.93;
      C.data[i4] = (pal.light[0] + (pal.dark[0] - pal.light[0]) * v) * dark;
      C.data[i4 + 1] = (pal.light[1] + (pal.dark[1] - pal.light[1]) * v) * dark;
      C.data[i4 + 2] = (pal.light[2] + (pal.dark[2] - pal.light[2]) * v) * dark;
      C.data[i4 + 3] = 255;
      const hb = 140 - v * 40 - pore * 70 - (edge || joint ? 120 : 0);
      B.data[i4] = B.data[i4 + 1] = B.data[i4 + 2] = hb;
      B.data[i4 + 3] = 255;
      Rg.data[i4] = 0;
      Rg.data[i4 + 1] = 120 + pore * 90 + (g2 - 0.5) * 50 + v * 30;
      Rg.data[i4 + 2] = 0;
      Rg.data[i4 + 3] = 255;
    }
  }
  cc.putImageData(C, 0, 0);
  bc.putImageData(B, 0, 0);
  rc.putImageData(Rg, 0, 0);
  return { color, bump, rough };
}

// ---------- small tileable materials ----------
export function makeCork(N = 1024) {
  const c = makeCanvas(N, N), ctx = c.getContext('2d');
  ctx.fillStyle = '#b48a5c';
  ctx.fillRect(0, 0, N, N);
  const r = rng(77);
  for (let i = 0; i < 26000; i++) {
    const s = 1 + r() * r() * 7;
    const t = r();
    ctx.fillStyle = t < 0.45 ? `rgba(92,62,36,${0.3 + r() * 0.5})` : t < 0.8 ? `rgba(214,176,128,${0.3 + r() * 0.4})` : `rgba(60,38,20,${0.5 + r() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(r() * N, r() * N, s, s * (0.5 + r() * 0.5), r() * 3.14, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export function makeSlate(N = 1024) {
  const c = noiseCanvas(N, N, 4, 60, 91);
  const ctx = c.getContext('2d');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#3c4246';
  ctx.fillRect(0, 0, N, N);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.18;
  ctx.drawImage(noiseCanvas(N, N, 30, 400, 13), 0, 0);
  ctx.globalAlpha = 1;
  const r = rng(5);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(200,210,215,${r() * 0.12})`;
    ctx.fillRect(r() * N, r() * N, 1 + r() * 2, 1);
  }
  return c;
}

let mottleCache = null;
function mottle() {
  if (!mottleCache) mottleCache = noiseCanvas(512, 256, 18, 9, 101);
  return mottleCache;
}

// Glaze colour with speckles and thickness variation; tileable enough for small parts.
export function paintGlaze(canvas, color, opts) {
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  if (opts.mottle) {
    ctx.globalAlpha = opts.mottle;
    ctx.globalCompositeOperation = luminance(color) > 0.5 ? 'multiply' : 'overlay';
    ctx.drawImage(mottle(), 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (opts.speckle) speckles(ctx, W, H, opts.density, opts.seed || 7);
}

function speckles(ctx, W, H, density, seed) {
  const r = rng(seed);
  const count = Math.floor(((density * W * H) / 2600) * (W > 1500 ? 1 : 1.2));
  for (let i = 0; i < count; i++) {
    const s = 0.5 + Math.pow(r(), 3) * (W / 900);
    const t = r();
    ctx.fillStyle = t < 0.75 ? `rgba(58,38,24,${0.45 + r() * 0.5})` : t < 0.9 ? `rgba(110,72,40,${0.4 + r() * 0.4})` : `rgba(20,16,14,${0.6 + r() * 0.4})`;
    ctx.beginPath();
    ctx.arc(r() * W, r() * H, s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function paintClay(canvas, color) {
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  clayGrain(ctx, W, H, 31, 1);
}

function clayGrain(ctx, W, H, seed, strength) {
  const r = rng(seed);
  const n = Math.floor((W * H) / 220);
  for (let i = 0; i < n; i++) {
    const t = r();
    ctx.fillStyle = t < 0.5 ? `rgba(0,0,0,${0.05 * strength + r() * 0.08 * strength})` : `rgba(255,255,255,${0.04 * strength + r() * 0.06 * strength})`;
    ctx.fillRect(r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5);
  }
}

// ---------- outer surface: glaze + raw foot + lettering ----------
// u spans 360° around the cup; v spans arc length of the outside from bottom edge to lip.
export class OuterPainter {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.color = makeCanvas(W, H);
    this.rough = makeCanvas(W, H);
    this.height = makeCanvas(W, H);
  }

  paint(p) {
    const { W, H } = this;
    const cc = this.color.getContext('2d');
    const rc = this.rough.getContext('2d');
    const hc = this.height.getContext('2d');
    for (const c of [cc, rc, hc]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.filter = 'none';
    }

    // base layers
    paintGlaze(this.color, p.color, { speckle: p.speckle, density: p.density, mottle: p.mottle, seed: 7 });
    const g = Math.round(p.roughness * 255);
    rc.fillStyle = `rgb(0,${g},0)`;
    rc.fillRect(0, 0, W, H);
    if (p.mottle) {
      rc.globalAlpha = 0.12;
      rc.drawImage(mottle(), 0, 0, W, H);
      rc.globalAlpha = 1;
    }
    hc.fillStyle = 'rgb(128,128,128)';
    hc.fillRect(0, 0, W, H);
    if (p.clayBody) {
      // whole outside unglazed: add grain to height
      hc.globalAlpha = 0.6;
      clayGrain(hc, W, H, 3, 2);
      hc.globalAlpha = 1;
    }

    // raw clay foot with a wavy glaze line and a few drips
    if (p.footV > 0.002) {
      const yLine = H - p.footV * H;
      const amp = Math.max(2, p.pxPerMmY * 1.2);
      const r = rng(19);
      const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
      const path = new Path2D();
      path.moveTo(0, H + 2);
      for (let x = 0; x <= W; x += 4) {
        const t = (x / W) * Math.PI * 2;
        const y = yLine + amp * (0.6 * Math.sin(3 * t + ph[0]) + 0.3 * Math.sin(7 * t + ph[1]) + 0.18 * Math.sin(19 * t + ph[2]));
        path.lineTo(x, y);
      }
      path.lineTo(W, H + 2);
      path.closePath();
      const drips = new Path2D();
      const nd = 3 + Math.floor(r() * 4);
      for (let i = 0; i < nd; i++) {
        const x = r() * W, wd = p.pxPerMmX * (2 + r() * 2.5), ln = p.pxPerMmY * (2 + r() * 6);
        drips.rect(x - wd / 2, yLine - amp, wd, ln + amp - wd / 2);
        drips.ellipse(x, yLine + ln - wd / 2, wd / 2, wd / 2, 0, 0, Math.PI * 2);
      }

      cc.save();
      cc.fillStyle = p.clayColor;
      cc.fill(path);
      cc.clip(path);
      clayGrain(cc, W, H, 5, 1.2);
      cc.restore();
      cc.fillStyle = p.color;
      cc.fill(drips);
      // glaze pools darker along its edge
      cc.save();
      cc.filter = `blur(${Math.max(1.5, amp * 0.35)}px)`;
      cc.strokeStyle = shade(p.color, -0.35);
      cc.globalAlpha = 0.5;
      cc.lineWidth = Math.max(2, amp * 0.6);
      cc.stroke(path);
      cc.restore();

      rc.fillStyle = 'rgb(0,236,0)';
      rc.fill(path);
      rc.fillStyle = `rgb(0,${g},0)`;
      rc.fill(drips);

      hc.save();
      hc.clip(path);
      clayGrain(hc, W, H, 9, 3);
      hc.restore();
      hc.save();
      hc.filter = 'blur(1.5px)';
      hc.strokeStyle = 'rgb(165,165,165)';
      hc.lineWidth = Math.max(2, amp * 0.5);
      hc.stroke(path);
      hc.restore();
    }

    // lettering
    const t = p.text;
    if (t && t.content.trim()) {
      const style = t.style;
      const draw = (ctx, fill, op = 'source-over', alpha = 1, blur = 0) => {
        ctx.save();
        ctx.globalCompositeOperation = op;
        ctx.globalAlpha = alpha;
        if (blur) ctx.filter = `blur(${blur}px)`;
        ctx.fillStyle = fill;
        this.drawText(ctx, p);
        ctx.restore();
      };
      const dark = luminance(p.color) < 0.35;
      if (style === 'deboss') {
        draw(cc, shade(p.color, dark ? -0.45 : -0.3), 'source-over', t.pool, 1.2);
        draw(hc, 'rgb(0,0,0)', 'source-over', 1, 1.6);
      } else if (style === 'emboss') {
        draw(cc, shade(p.color, 0.35), 'source-over', t.pool * 0.6, 1.5);
        draw(hc, 'rgb(255,255,255)', 'source-over', 1, 1.6);
      } else if (style === 'print') {
        draw(cc, t.ink, 'source-over', 1, 0.4);
        draw(rc, `rgb(0,${Math.min(255, g + 40)},0)`);
        draw(hc, 'rgb(150,150,150)', 'source-over', 1, 0.6);
      } else if (style === 'etch') {
        draw(cc, '#ffffff', 'screen', 0.45, 0.6);
        draw(rc, 'rgb(0,215,0)', 'source-over', 1, 0.5);
        draw(hc, 'rgb(110,110,110)', 'source-over', 1, 0.8);
      }
    }
  }

  drawText(ctx, p) {
    const { W, H } = this;
    const t = p.text;
    const sy = p.pxPerMmY;
    const sx = W / (2 * Math.PI * p.textRadius); // px per mm around the circumference at text height
    const fontPx = t.size * sy;
    ctx.font = `${t.italic ? 'italic ' : ''}${t.weight} ${fontPx}px "${t.family}", ${t.fallback || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${t.spacing * sy}px`;
    const lines = t.content.split('\n');
    const lh = fontPx * t.lineHeight;
    const cy = H - p.textV * H;
    const n = Math.max(1, t.repeat | 0);
    for (let k = 0; k < n; k++) {
      let u = (((t.angle + (k * 360) / n) / 360) % 1 + 1) % 1;
      for (const off of [-W, 0, W]) {
        const cx = u * W + off;
        ctx.setTransform(sx / sy, 0, 0, 1, cx, cy);
        lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lh));
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// ---------- soft contact shadow ----------
export function makeContactShadow() {
  const N = 256, c = makeCanvas(N, N), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, N, N);
  return c;
}

export function makeBackdrop() {
  const c = makeCanvas(16, 512), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#3e3833');
  g.addColorStop(0.45, '#2a2520');
  g.addColorStop(1, '#2a2520');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  return c;
}
