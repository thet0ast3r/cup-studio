import * as THREE from 'three';

// ---------- 2D helpers (points are [r, y] in millimetres) ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function cumLen(p) {
  const s = [0];
  for (let i = 1; i < p.length; i++) s.push(s[i - 1] + len(sub(p[i], p[i - 1])));
  return s;
}

export function resample(p, n) {
  if (p.length < 2) return p.slice();
  const s = cumLen(p);
  const L = s[s.length - 1];
  if (L === 0) return p.slice();
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = (L * i) / (n - 1);
    while (j < s.length - 2 && s[j + 1] < t) j++;
    const seg = s[j + 1] - s[j] || 1;
    const f = clamp((t - s[j]) / seg, 0, 1);
    out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * f, p[j][1] + (p[j + 1][1] - p[j][1]) * f]);
  }
  return out;
}

export function chaikin(pts, iters) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    if (p.length < 3) return p;
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

// Ramer–Douglas–Peucker simplification, used to turn a sketch into spline points.
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const d = sub(b, a);
  const L = len(d) || 1;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const v = sub(pts[i], a);
    const dist = Math.abs(v[0] * d[1] - v[1] * d[0]) / L;
    if (dist > maxD) { maxD = dist; idx = i; }
  }
  if (maxD > eps) {
    const l = simplify(pts.slice(0, idx + 1), eps);
    const r = simplify(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}

function quad(p0, c, p2, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]]);
  }
  return out;
}

function cubic(a, b, c, d, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]
    ]);
  }
  return out;
}

const toward = (c, a, d) => add(c, mul(norm(sub(a, c)), d));

// Round every interior corner of a polyline.
function filletPoly(poly, rad, n = 8) {
  const out = [poly[0]];
  for (let i = 1; i < poly.length - 1; i++) {
    const A = poly[i - 1], C = poly[i], B = poly[i + 1];
    const d = Math.min(rad, len(sub(A, C)) * 0.5, len(sub(B, C)) * 0.5);
    out.push(...quad(toward(C, A, d), C, toward(C, B, d), n));
  }
  out.push(poly[poly.length - 1]);
  return out;
}

// ---------- the outer silhouette the person edits ----------
export function outerCurve(cup) {
  let pts;
  if (cup.mode === 'freeform' && cup.freePoints.length >= 2) {
    pts = resample(chaikin(cup.freePoints.map((p) => [p.r, p.y]), cup.freeSmooth), 180);
  } else {
    const ctrl = cup.points.map((p) => new THREE.Vector3(p.r, p.y, 0));
    if (ctrl.length < 3) pts = resample(ctrl.map((v) => [v.x, v.y]), 160);
    else {
      const c = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
      pts = c.getSpacedPoints(180).map((v) => [v.x, v.y]);
    }
  }
  let maxY = 0;
  return pts.map(([r, y]) => {
    y = Math.max(y, maxY);
    maxY = y;
    return [Math.max(r, 2), y];
  });
}

export function radiusAt(outer, y) {
  for (let i = 1; i < outer.length; i++) {
    if (outer[i][1] >= y) {
      const a = outer[i - 1], b = outer[i];
      const f = b[1] - a[1] > 1e-6 ? (y - a[1]) / (b[1] - a[1]) : 1;
      return a[0] + (b[0] - a[0]) * f;
    }
  }
  return outer[outer.length - 1][0];
}

// ---------- full body cross-section ----------
// Sections in traversal order: underside → outside → rim → inside.
export function buildBody(outer, o) {
  const H = outer[outer.length - 1][1];
  const t = clamp(o.wall, 1.5, 12);
  const b = clamp(o.base, 2, Math.max(2, H * 0.5));
  const R0 = outer[0][0];
  const s = cumLen(outer);
  const L = s[s.length - 1];

  // underside
  const under = [];
  if (o.footRing && R0 > 14) {
    const fd = Math.min(o.footDepth, b * 0.6);
    const xi = R0 - Math.max(4, R0 * 0.16);
    under.push([0, fd]);
    under.push(...quad(toward([xi, fd], [0, fd], 1.5), [xi, fd], toward([xi, fd], [xi + fd * 0.7, 0], 1.2), 4));
    const c2 = [xi + fd * 0.7, 0];
    under.push(...quad(toward(c2, [xi, fd], 1.2), c2, toward(c2, [R0, 0], 1.5), 4));
  } else under.push([0, 0]);

  // outside with rounded bottom edge
  const f = Math.min(o.footRound, R0 * 0.3, L * 0.2);
  let outerSec;
  if (f > 0.3) {
    let k = 1;
    while (k < outer.length - 2 && s[k] < f) k++;
    outerSec = [...quad([R0 - f, 0], outer[0], outer[k], 8), ...outer.slice(k + 1)];
  } else outerSec = outer.slice();

  // rim: half-round from outer lip to inner lip
  const O = outer[outer.length - 1];
  const T = norm(sub(O, outer[outer.length - 3]));
  const n = [T[1], -T[0]];
  const M = sub(O, mul(n, t / 2));
  const rim = [];
  for (let k = 1; k <= 14; k++) {
    const ph = (Math.PI * k) / 14;
    rim.push(add(M, add(mul(n, (Math.cos(ph) * t) / 2), mul(T, (Math.sin(ph) * t) / 2))));
  }
  const I = rim[rim.length - 1];

  // inside: offset of the outside curve, walking down
  const inner = [];
  let lastY = I[1];
  for (let i = outer.length - 2; i >= 0; i--) {
    const Ti = norm(sub(outer[Math.min(i + 1, outer.length - 1)], outer[Math.max(i - 1, 0)]));
    const ni = [Ti[1], -Ti[0]];
    const q = sub(outer[i], mul(ni, t));
    if (q[1] < lastY - 0.05 && q[1] > b) {
      inner.push([Math.max(q[0], 0.3), q[1]]);
      lastY = q[1];
    }
  }
  if (inner.length < 2) inner.push([Math.max(I[0] - 1, 0.5), (I[1] + b) / 2], [Math.max(I[0] - 1, 0.5), b + 0.5]);
  const Q1 = inner[inner.length - 2], Q2 = inner[inner.length - 1];
  const d = sub(Q2, Q1);
  let C = Math.abs(d[1]) > 1e-4 ? add(Q2, mul(d, (b - Q2[1]) / d[1])) : [Q2[0], b];
  C = [clamp(C[0], 0.5, Q2[0] + 10), b];
  const fr = Math.max(0.5, Math.min(o.innerRound, C[0] * 0.8, (H - b) * 0.4));
  while (inner.length > 2 && len(sub(inner[inner.length - 1], C)) < fr) inner.pop();
  const last = inner[inner.length - 1];
  const p0 = toward(C, last, Math.min(fr, len(sub(last, C)) * 0.95));
  const p2 = [Math.max(C[0] - fr, 0), b];
  inner.push(...quad(p0, C, p2, 10));
  if (p2[0] > 0.01) inner.push([0, b]);

  // assemble + dedupe + normals
  const raw = [];
  for (const [arr, sec] of [[under, 0], [outerSec, 1], [rim, 2], [inner, 3]]) for (const p of arr) raw.push({ p, sec });
  const pts = [];
  for (const it of raw) if (!pts.length || len(sub(it.p, pts[pts.length - 1].p)) > 0.02) pts.push(it);
  const P = pts.map((x) => x.p);
  const N = P.map((_, i) => {
    const tt = norm(sub(P[Math.min(i + 1, P.length - 1)], P[Math.max(i - 1, 0)]));
    return [tt[1], -tt[0]];
  });
  const sections = [];
  for (let sec = 0; sec < 4; sec++) {
    const first = pts.findIndex((x) => x.sec === sec);
    let end = pts.findIndex((x) => x.sec === sec + 1);
    if (end < 0) end = pts.length - 1;
    sections.push({ pts: P.slice(first, end + 1), nrm: N.slice(first, end + 1) });
  }

  // capacity (brim-full) from the inside cavity, frustum sum
  const cav = [I, ...inner];
  let vol = 0;
  for (let i = 1; i < cav.length; i++) {
    const [r1, y1] = cav[i - 1], [r2, y2] = cav[i];
    vol += (Math.PI * Math.abs(y1 - y2) * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;
  }

  const os = sections[1].pts;
  const osLen = cumLen(os);
  return {
    sections,
    outline: P, // closed cross-section for the editor
    outer,
    height: H,
    maxR: Math.max(...outer.map((p) => p[0])),
    capacityMl: vol / 1000,
    outerSec: { pts: os, s: osLen, L: osLen[osLen.length - 1] }
  };
}

// arc-length fraction (0..1) on the outer section for a given height
export function heightToV(outerSec, y) {
  const { pts, s, L } = outerSec;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][1] >= y) {
      const a = pts[i - 1], b = pts[i];
      const f = b[1] - a[1] > 1e-6 ? clamp((y - a[1]) / (b[1] - a[1]), 0, 1) : 1;
      return (s[i - 1] + (s[i] - s[i - 1]) * f) / L;
    }
  }
  return 1;
}

// ---------- lathe (revolve) a profile ----------
// position = (r·sinθ, y, r·cosθ): θ = 0 faces +Z (front), θ = 90° is +X (handle side).
export function lathe(pts, nrm, segs, uvMode = 'len', planarR = 1) {
  const n = pts.length, cols = segs + 1;
  const pos = new Float32Array(n * cols * 3);
  const nor = new Float32Array(n * cols * 3);
  const uv = new Float32Array(n * cols * 2);
  const s = cumLen(pts);
  const L = s[s.length - 1] || 1;
  for (let j = 0; j < n; j++) {
    const [r, y] = pts[j];
    const [nr, ny] = nrm[j];
    for (let i = 0; i < cols; i++) {
      const th = (i / segs) * Math.PI * 2;
      const sn = Math.sin(th), cs = Math.cos(th);
      const k = j * cols + i;
      pos[k * 3] = r * sn; pos[k * 3 + 1] = y; pos[k * 3 + 2] = r * cs;
      nor[k * 3] = nr * sn; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nr * cs;
      if (uvMode === 'planar') {
        uv[k * 2] = 0.5 + (r * sn) / (2 * planarR);
        uv[k * 2 + 1] = 0.5 - (r * cs) / (2 * planarR);
      } else {
        uv[k * 2] = i / segs;
        uv[k * 2 + 1] = s[j] / L;
      }
    }
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * cols + i, b = (j + 1) * cols + i, c = a + 1, d = b + 1;
      idx.push(a, c, b, c, d, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------- handles ----------
export const HANDLE_TYPES = [
  { id: 'classic', name: 'Classic' },
  { id: 'ear', name: 'Ear' },
  { id: 'square', name: 'D-shape' },
  { id: 'angular', name: 'Angular' },
  { id: 'ring', name: 'Teacup ring' },
  { id: 'none', name: 'No handle' }
];

// Path in the radial plane (x = distance from axis, y = height).
export function handlePath(type, outer, h, wall) {
  if (type === 'none') return null;
  const H = outer[outer.length - 1][1];
  const yA = H * (h.top / 100);
  const yB = Math.min(H * (h.bottom / 100), yA - 6);
  const inset = wall * 0.5;
  const rA = radiusAt(outer, yA), rB = radiusAt(outer, Math.max(yB, 0));
  const A = [rA - inset, yA], B = [rB - inset, Math.max(yB, 0)];
  const span = Math.max(A[1] - B[1], 6);
  const reach = h.reach;
  const xo = Math.max(rA, rB) + reach;
  let p;
  switch (type) {
    case 'ear':
      p = cubic(A, [rA + reach * 0.9, yA + span * 0.5], [rB + reach * 1.75, B[1] - span * 0.15], B, 90);
      break;
    case 'square':
      p = filletPoly([A, [xo, yA], [xo, B[1]], B], Math.min(reach * 0.55, span * 0.3), 12);
      break;
    case 'angular':
      p = filletPoly([A, [xo, yA - span * 0.22], B], 5, 10);
      break;
    case 'ring': {
      const R = clamp(reach * 0.5, 6, 30);
      const cy = yA - R;
      const rw = radiusAt(outer, cy);
      const cx = rw + 3 + R * 0.94;
      const top = [radiusAt(outer, cy + R * 0.34) - inset, cy + R * 0.34];
      const bot = [radiusAt(outer, cy - R * 0.34) - inset, cy - R * 0.34];
      const arc = [];
      for (let k = 0; k <= 60; k++) {
        const a = ((160 - (320 * k) / 60) * Math.PI) / 180;
        arc.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      }
      p = [top, ...arc, bot];
      break;
    }
    default:
      p = cubic(A, [rA + reach * 1.33, yA + span * 0.06], [rB + reach * 1.33, B[1] - span * 0.04], B, 90);
  }
  return resample(chaikin(p, 1), 110);
}

// Sweep an elliptical cross-section along a path in the XY plane (+X = outward).
export function sweepHandle(path, thickness, width, flare, ringN = 28) {
  const m = path.length;
  const a0 = thickness / 2, w0 = width / 2;
  const cols = ringN + 1;
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j < m; j++) {
    const P = path[j];
    const T = norm(sub(path[Math.min(j + 1, m - 1)], path[Math.max(j - 1, 0)]));
    const N = [-T[1], T[0]];
    const u = j / (m - 1);
    const sc = 1 + flare * (Math.exp(-((u / 0.12) ** 2)) + Math.exp(-(((1 - u) / 0.12) ** 2)));
    const a = a0 * sc, w = w0 * (1 + (sc - 1) * 0.6);
    for (let i = 0; i < cols; i++) {
      const ph = (i / ringN) * Math.PI * 2;
      const c = Math.cos(ph), s = Math.sin(ph);
      pos.push(P[0] + N[0] * a * c, P[1] + N[1] * a * c, w * s);
      const nx = (N[0] * c) / a, ny = (N[1] * c) / a, nz = s / w;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
      uv.push(u * 3, i / ringN);
    }
  }
  for (let j = 0; j < m - 1; j++)
    for (let i = 0; i < ringN; i++) {
      const a = j * cols + i, b = (j + 1) * cols + i, c = a + 1, d = b + 1;
      idx.push(a, c, b, c, d, b);
    }
  // end caps (hidden inside the wall, but keep the mesh closed for STL export)
  for (const [j, sign] of [[0, -1], [m - 1, 1]]) {
    const T = norm(sub(path[Math.min(j + 1, m - 1)], path[Math.max(j - 1, 0)]));
    const center = pos.length / 3;
    pos.push(path[j][0], path[j][1], 0);
    nor.push(T[0] * sign, T[1] * sign, 0);
    uv.push(0, 0);
    for (let i = 0; i < ringN; i++) {
      const a = j * cols + i, b = j * cols + i + 1;
      if (sign < 0) idx.push(center, a, b);
      else idx.push(center, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------- saucers ----------
export const SAUCER_TYPES = [
  { id: 'saucer', name: 'Saucer' },
  { id: 'plate', name: 'Side plate' },
  { id: 'wood', name: 'Walnut coaster' },
  { id: 'cork', name: 'Cork coaster' },
  { id: 'slate', name: 'Slate tile' },
  { id: 'none', name: 'Nothing' }
];

function profileNormals(P) {
  return P.map((_, i) => {
    const tt = norm(sub(P[Math.min(i + 1, P.length - 1)], P[Math.max(i - 1, 0)]));
    return [tt[1], -tt[0]];
  });
}

export function buildSaucer(type, R, cupR0) {
  let p, seat;
  if (type === 'saucer') {
    const well = Math.min(cupR0 + 4, R * 0.6);
    p = chaikin([[0, 1.2], [R * 0.4, 1.2], [R * 0.42, 0], [R * 0.5, 0], [R * 0.93, 7.5], [R, 10.2], [R - 1.6, 11], [R - 4, 9.6], [well + 6, 5.2], [well + 1, 5], [well, 4.2], [0, 4.2]], 3);
    seat = 4.2;
  } else if (type === 'plate') {
    p = chaikin([[0, 1], [R * 0.55, 1], [R * 0.57, 0], [R * 0.62, 0], [R * 0.96, 5.5], [R, 7.4], [R - 1.4, 8], [R - 5, 6.4], [R * 0.66, 3.4], [0, 3.4]], 3);
    seat = 3.4;
  } else if (type === 'wood' || type === 'cork') {
    const h = type === 'wood' ? 12 : 6;
    p = chaikin([[0, 0], [R - 2, 0], [R, 1.5], [R, h - 1.5], [R - 2, h], [0, h]], 2);
    seat = h;
  } else return null;
  const g = lathe(p, profileNormals(p), 128, 'planar', R);
  return { geometry: g, seat };
}

export function buildSlate(R) {
  const s = R * 1.7, r = 6, h = 7;
  const shape = new THREE.Shape();
  const x0 = -s / 2, y0 = -s / 2;
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x0 + s - r, y0);
  shape.quadraticCurveTo(x0 + s, y0, x0 + s, y0 + r);
  shape.lineTo(x0 + s, y0 + s - r);
  shape.quadraticCurveTo(x0 + s, y0 + s, x0 + s - r, y0 + s);
  shape.lineTo(x0 + r, y0 + s);
  shape.quadraticCurveTo(x0, y0 + s, x0, y0 + s - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 3, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 1, 0);
  // planar UVs from top view
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / s, 0.5 + pos.getZ(i) / s);
  return { geometry: g, seat: h };
}
