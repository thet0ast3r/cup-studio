import * as THREE from 'three';

// Binary STL from a list of meshes (transforms relative to `root`), converted to Z-up.
export function meshesToSTL(meshes, root) {
  const tris = [];
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.updateMatrixWorld();
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const idx = g.index ? g.index.array : null;
    const count = idx ? idx.length : pos.count;
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx[i] : i, ib = idx ? idx[i + 1] : i + 1, ic = idx ? idx[i + 2] : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      tris.push(a.x, -a.z, a.y, b.x, -b.z, b.y, c.x, -c.z, c.y);
    }
  }
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const header = 'Cup studio export, units: mm';
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, n, true);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50, k = t * 9;
    a.set(tris[k], tris[k + 1], tris[k + 2]);
    b.set(tris[k + 3], tris[k + 4], tris[k + 5]);
    c.set(tris[k + 6], tris[k + 7], tris[k + 8]);
    nn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    const vals = [nn.x, nn.y, nn.z, a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z];
    vals.forEach((v, i) => dv.setFloat32(o + i * 4, v, true));
    dv.setUint16(o + 48, 0, true);
  }
  return new Uint8Array(buf);
}

// ---------- minimal zip (store, no compression) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipFiles(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// ---------- saving files ----------
// Inside a claude.ai artifact, files go through the viewer's download capability.
// Anywhere else (local dev build), a normal download link is used.
let dl;
export function downloadsApi() {
  if (!dl) {
    dl = (async () => {
      const c = typeof window !== 'undefined' ? window.claude : undefined;
      if (!c || typeof c.use !== 'function') return { mode: 'anchor' };
      const api = await c.use('downloads');
      return api ? { mode: 'claude', api } : { mode: 'none' };
    })();
  }
  return dl;
}

export async function saveFile(filename, blob) {
  const d = await downloadsApi();
  if (d.mode === 'claude') {
    try {
      await d.api.save({ filename, data: blob });
      return { ok: true, msg: `Saved ${filename}` };
    } catch (e) {
      if (e?.code === 'declined') return { ok: false, msg: 'Save cancelled' };
      return { ok: false, msg: e?.message || 'Saving is not available here' };
    }
  }
  if (d.mode === 'anchor') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, msg: `Saved ${filename}` };
  }
  return { ok: false, msg: 'Saving is not available in this view' };
}
