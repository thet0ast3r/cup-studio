<script>
  import { cup } from './cup.svelte.js';
  import { clamp, chaikin, resample } from './geometry.js';

  /** @type {{ body: any, handle: [number, number][] | null }} */
  let { body, handle } = $props();

  let g; // the flipped <g>, used for pointer → mm conversion
  let dragging = $state(-1);
  let stroke = $state(null); // in-progress freeform sketch
  let cursor = $state(null); // sculpt brush position
  let frozen = $state(null);
  let lastSculpt = null;
  const BRUSH = 14;

  const view = $derived.by(() => {
    const hx = handle ? Math.max(...handle.map((p) => p[0])) + cup.handle.thickness / 2 : 0;
    const left = Math.max(body.maxR, 30) + 8;
    const right = Math.max(body.maxR, hx, 30) + 8;
    const top = Math.max(body.height, 40) + 10;
    return { left, right, top };
  });
  const vb = $derived(frozen ?? view);
  const viewBox = $derived(`${-vb.left} ${-vb.top} ${vb.left + vb.right} ${vb.top + 8}`);

  const grid = $derived.by(() => {
    const xs = [], ys = [];
    for (let x = Math.ceil(-vb.left / 10) * 10; x <= vb.right; x += 10) xs.push(x);
    for (let y = 0; y <= vb.top; y += 10) ys.push(y);
    return { xs, ys };
  });

  const poly = (pts, sx = 1) => pts.map(([r, y]) => `${(r * sx).toFixed(2)},${y.toFixed(2)}`).join(' ');
  const section = $derived(poly(body.outline));
  const mirror = $derived(poly(body.outline, -1));
  const outerLine = $derived(poly(body.outer));
  const handleLine = $derived(handle ? poly(handle) : '');
  const textBand = $derived({ y: cup.text.y - (cup.text.size * 0.75) / 2, h: cup.text.size * 0.75 });

  function toMm(e) {
    const m = g.getScreenCTM();
    if (!m) return { r: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { r: p.x, y: p.y };
  }

  function startPoint(e, i) {
    e.stopPropagation();
    dragging = i;
    cup.selected = i;
    frozen = { ...view };
    e.currentTarget.ownerSVGElement.setPointerCapture(e.pointerId);
  }

  function down(e) {
    if (cup.mode !== 'freeform') return;
    frozen = { ...view };
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toMm(e);
    if (cup.freeTool === 'draw') stroke = [[Math.abs(p.r), p.y]];
    else lastSculpt = p;
  }

  function move(e) {
    const p = toMm(e);
    if (cup.mode === 'spline' && dragging >= 0) {
      const pts = cup.points;
      const i = dragging;
      pts[i].r = Math.round(clamp(p.r, 3, 160) * 10) / 10;
      if (i === 0) pts[i].y = 0;
      else {
        const lo = pts[i - 1].y + 1;
        const hi = i < pts.length - 1 ? pts[i + 1].y - 1 : 320;
        pts[i].y = Math.round(clamp(p.y, lo, hi) * 10) / 10;
      }
      return;
    }
    if (cup.mode !== 'freeform') return;
    cursor = p;
    if (stroke) {
      const l = stroke[stroke.length - 1];
      if (Math.hypot(Math.abs(p.r) - l[0], p.y - l[1]) > 0.8) stroke.push([Math.abs(p.r), p.y]);
    } else if (lastSculpt && cup.freeTool === 'sculpt') {
      const dr = p.r - lastSculpt.r, dy = p.y - lastSculpt.y;
      const fp = cup.freePoints;
      for (let i = 0; i < fp.length; i++) {
        const w = Math.exp(-((Math.hypot(fp[i].r - p.r, fp[i].y - p.y) / BRUSH) ** 2));
        fp[i].r = Math.max(3, fp[i].r + dr * w);
        if (i > 0) fp[i].y = Math.max(fp[i - 1].y + 0.2, fp[i].y + dy * w);
      }
      lastSculpt = p;
    }
  }

  function up() {
    if (stroke && stroke.length > 4) {
      let s = stroke;
      if (s[0][1] > s[s.length - 1][1]) s = s.slice().reverse();
      const kept = [s[0]];
      for (const p of s) if (p[1] > kept[kept.length - 1][1] + 0.3) kept.push(p);
      if (kept.length > 3) {
        const y0 = kept[0][1];
        const pts = resample(chaikin(kept.map(([r, y]) => [Math.max(3, r), y - y0]), 1), 70);
        cup.freePoints = pts.map(([r, y]) => ({ r, y }));
      }
    }
    stroke = null;
    lastSculpt = null;
    dragging = -1;
    frozen = null;
  }

  function dbl(e) {
    if (cup.mode !== 'spline') return;
    const p = toMm(e);
    if (p.y <= 1) return;
    const pts = cup.points;
    let k = pts.findIndex((q) => q.y > p.y);
    if (k === -1) k = pts.length;
    pts.splice(k, 0, { r: Math.round(clamp(p.r, 3, 160) * 10) / 10, y: Math.round(p.y * 10) / 10 });
    cup.selected = k;
  }

  function removePoint(i) {
    if (cup.points.length <= 3 || i === 0) return;
    cup.points.splice(i, 1);
    cup.selected = -1;
  }

  function key(e) {
    if (cup.mode !== 'spline' || cup.selected < 0) return;
    const i = cup.selected;
    const pt = cup.points[i];
    if (!pt) return;
    const step = e.shiftKey ? 2 : 0.5;
    const pts = cup.points;
    if (e.key === 'Delete' || e.key === 'Backspace') removePoint(i);
    else if (e.key === 'ArrowLeft') pt.r = Math.max(3, pt.r - step);
    else if (e.key === 'ArrowRight') pt.r += step;
    else if (e.key === 'ArrowUp' && i > 0) pt.y = Math.min(i < pts.length - 1 ? pts[i + 1].y - 1 : 320, pt.y + step);
    else if (e.key === 'ArrowDown' && i > 0) pt.y = Math.max(pts[i - 1].y + 1, pt.y - step);
    else return;
    e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<svg
  class="editor"
  class:free={cup.mode === 'freeform'}
  {viewBox}
  preserveAspectRatio="xMidYMid meet"
  role="application"
  aria-label="Cup profile editor"
  tabindex="0"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onpointerleave={() => (cursor = null)}
  ondblclick={dbl}
  onkeydown={key}
>
  <g bind:this={g} transform="scale(1,-1)">
    {#each grid.xs as x (x)}
      <line class="grid" class:axis={x === 0} x1={x} x2={x} y1="0" y2={vb.top} />
    {/each}
    {#each grid.ys as y (y)}
      <line class="grid" x1={-vb.left} x2={vb.right} y1={y} y2={y} />
    {/each}
    <line class="table" x1={-vb.left} x2={vb.right} y1="0" y2="0" />

    <rect class="band" x="-1000" width="2000" y={textBand.y} height={textBand.h} />

    {#if handle}
      <polyline class="handle" points={handleLine} style:stroke-width={cup.handle.thickness} />
    {/if}
    <polygon class="mirror" points={mirror} />
    <polygon class="section" points={section} />
    <polyline class="outer" points={outerLine} />

    {#if cup.mode === 'spline'}
      {#each cup.points as p, i (i)}
        <g class="pt" class:sel={cup.selected === i} class:base={i === 0}>
          <circle
            class="hit"
            cx={p.r}
            cy={p.y}
            r="7"
            role="button"
            tabindex="-1"
            aria-label={`Point ${i + 1}`}
            onpointerdown={(e) => startPoint(e, i)}
            ondblclick={(e) => {
              e.stopPropagation();
              removePoint(i);
            }}
          />
          <circle class="dot" cx={p.r} cy={p.y} r="3.2" />
        </g>
      {/each}
    {:else}
      {#if stroke}
        <polyline class="sketch" points={poly(stroke)} />
      {/if}
      {#if cursor && cup.freeTool === 'sculpt'}
        <circle class="brush" cx={cursor.r} cy={cursor.y} r={BRUSH} />
      {/if}
    {/if}
  </g>
</svg>

<style>
  .editor {
    width: 100%;
    height: 260px;
    display: block;
    background: var(--paper);
    border-radius: 10px;
    border: 1px solid var(--line);
    touch-action: none;
    cursor: default;
  }
  .editor.free {
    cursor: crosshair;
  }
  .editor:focus-visible {
    outline: 2px solid var(--cobalt);
    outline-offset: 2px;
  }
  .grid {
    stroke: var(--grid);
    stroke-width: 0.35;
  }
  .grid.axis {
    stroke: var(--muted);
    stroke-dasharray: 2 2;
    stroke-width: 0.5;
  }
  .table {
    stroke: var(--ink);
    stroke-width: 0.8;
  }
  .band {
    fill: var(--cobalt);
    opacity: 0.07;
  }
  .handle {
    fill: none;
    stroke: var(--cobalt-soft);
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .mirror {
    fill: var(--cobalt-soft);
    opacity: 0.45;
  }
  .section {
    fill: var(--cobalt-soft);
    stroke: var(--cobalt);
    stroke-width: 0.6;
    stroke-linejoin: round;
  }
  .outer {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1;
  }
  .sketch {
    fill: none;
    stroke: var(--cobalt);
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  .brush {
    fill: var(--cobalt);
    fill-opacity: 0.08;
    stroke: var(--cobalt);
    stroke-width: 0.5;
    pointer-events: none;
  }
  .hit {
    fill: transparent;
    cursor: grab;
  }
  .dot {
    fill: var(--paper);
    stroke: var(--cobalt);
    stroke-width: 1.2;
    pointer-events: none;
  }
  .pt.base .dot {
    fill: var(--line);
  }
  .pt.sel .dot {
    fill: var(--cobalt);
  }
</style>
