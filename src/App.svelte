<script>
  import { onMount } from 'svelte';
  import Scene from './lib/Scene.svelte';
  import ProfileEditor from './lib/ProfileEditor.svelte';
  import Slider from './lib/ui/Slider.svelte';
  import Seg from './lib/ui/Seg.svelte';
  import ColorField from './lib/ui/ColorField.svelte';
  import { cup, PRESETS, FINISHES, FONTS, applyPreset, loadFont } from './lib/cup.svelte.js';
  import { outerCurve, buildBody, handlePath, HANDLE_TYPES, SAUCER_TYPES, simplify, resample, chaikin } from './lib/geometry.js';
  import { WOODS } from './lib/textures.js';
  import { downloadsApi } from './lib/exporters.js';

  // ---- derived model shared by the editor and the 3D scene ----
  const outer = $derived(outerCurve(cup));
  const body = $derived(
    buildBody(outer, {
      wall: cup.wall,
      base: cup.base,
      footRound: cup.footRound,
      footRing: cup.footRing,
      footDepth: cup.footDepth,
      innerRound: cup.innerRound
    })
  );
  const hPath = $derived(handlePath(cup.handle.type, outer, cup.handle, cup.wall));
  const finish = $derived(FINISHES[cup.finish]);

  let scene;
  let canSave = $state(false);
  let status = $state('');
  let customFamily = $state('');
  let fontError = $state('');

  onMount(async () => {
    const d = await downloadsApi();
    canSave = d.mode !== 'none';
  });

  // load the chosen font (Google Fonts), then the scene repaints via fontTick
  $effect(() => {
    const f = FONTS.find((x) => x.family === cup.text.family);
    if (f) loadFont(f);
  });

  // ---- shape helpers ----
  function setMode(m) {
    if (m === 'freeform' && cup.mode !== 'freeform') {
      cup.freePoints = resample(outer, 70).map(([r, y]) => ({ r, y }));
    }
    cup.mode = m;
  }
  function toSpline() {
    let eps = 0.6, pts;
    const src = resample(chaikin(cup.freePoints.map((p) => [p.r, p.y]), cup.freeSmooth), 120);
    do {
      pts = simplify(src, eps);
      eps *= 1.4;
    } while (pts.length > 10);
    cup.points = pts.map(([r, y], i) => ({ r: Math.round(r * 10) / 10, y: i === 0 ? 0 : Math.round(y * 10) / 10 }));
    cup.mode = 'spline';
  }
  function scaleShape(k, axis) {
    const list = cup.mode === 'freeform' ? cup.freePoints : cup.points;
    for (const p of list) p[axis] = Math.round(p[axis] * k * 100) / 100;
  }
  const getHeight = () => Math.round(body.height);
  const setHeight = (v) => scaleShape(v / body.height, 'y');
  const getWidth = () => Math.round(body.maxR * 2);
  const setWidth = (v) => scaleShape(v / (body.maxR * 2), 'r');

  function presetPath(p) {
    const o = outerCurve({ mode: 'spline', points: p.points.map(([r, y]) => ({ r, y })) });
    const right = o.map(([r, y]) => `${r.toFixed(1)},${(-y).toFixed(1)}`);
    const left = o.slice().reverse().map(([r, y]) => `${(-r).toFixed(1)},${(-y).toFixed(1)}`);
    return 'M' + right.join(' L') + ' L' + left.join(' L') + 'Z';
  }
  const handleIcons = Object.fromEntries(
    HANDLE_TYPES.map((t) => {
      const p = handlePath(t.id, [[22, 0], [22, 60]], { reach: 20, top: 80, bottom: 25 }, 2);
      return [t.id, p ? 'M' + p.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join(' L') : ''];
    })
  );

  // ---- fonts ----
  function addGoogleFont() {
    const name = customFamily.trim();
    if (!name) return;
    if (!FONTS.some((f) => f.family === name)) FONTS.push({ family: name, google: true });
    cup.text.family = name;
    customFamily = '';
  }
  async function uploadFont(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    fontError = '';
    try {
      const name = file.name.replace(/\.[^.]+$/, '');
      const face = new FontFace(name, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      if (!FONTS.some((f) => f.family === name)) FONTS.push({ family: name, google: false });
      cup.text.family = name;
      cup.fontTick++;
    } catch {
      fontError = 'That file could not be read as a font. Use a .ttf, .otf, .woff or .woff2 file.';
    }
  }

  async function run(fn) {
    status = 'Preparing file…';
    const r = await fn();
    status = r.msg;
    setTimeout(() => (status = ''), 3500);
  }

  const styleOpts = [
    { id: 'deboss', name: 'Pressed in' },
    { id: 'emboss', name: 'Raised' },
    { id: 'print', name: 'Printed' },
    { id: 'etch', name: 'Etched' }
  ];
  const finishOpts = Object.entries(FINISHES).map(([id, f]) => ({ id, name: f.name }));
  const woodOpts = Object.entries(WOODS).map(([id, w]) => ({ id, name: w.name }));
</script>

<main>
  <div class="stage">
    <Scene bind:this={scene} {body} handle={hPath} />
    <p class="caption">
      Holds about {Math.round(body.capacityMl)} ml, {Math.round(body.height)} mm tall, {Math.round(body.maxR * 2)} mm across
    </p>
    <button class="ghost reset" type="button" onclick={() => scene?.resetView()}>Reset view</button>
  </div>

  <aside class="panel">
    <header>
      <h1>Cup studio</h1>
      <p>Draw the profile, pick a handle, letter it and glaze it. The model updates as you go.</p>
    </header>

    <details open>
      <summary>Shape</summary>
      <Seg
        label="Profile mode"
        options={[{ id: 'spline', name: 'Spline points' }, { id: 'freeform', name: 'Freeform' }]}
        bind:value={() => cup.mode, setMode}
      />
      {#if cup.mode === 'freeform'}
        <Seg small label="Freeform tool" options={[{ id: 'draw', name: 'Draw' }, { id: 'sculpt', name: 'Push and pull' }]} bind:value={cup.freeTool} />
      {/if}
      <ProfileEditor {body} handle={hPath} />
      <p class="hint">
        {#if cup.mode === 'spline'}
          Drag a point to reshape. Double-click empty space to add a point, double-click a point to remove it. Arrow keys nudge the selected point.
        {:else if cup.freeTool === 'draw'}
          Draw the outside line in one stroke, from the base up to the lip. The bottom snaps to the table.
        {:else}
          Drag across the line to push or pull it, like a rib on the wheel.
        {/if}
      </p>
      {#if cup.mode === 'freeform'}
        <Slider label="Smoothing" bind:value={cup.freeSmooth} min={0} max={4} step={1} />
        <button class="ghost" type="button" onclick={toSpline}>Turn into spline points</button>
      {/if}

      <div class="presets" role="group" aria-label="Starting shapes">
        {#each PRESETS as p (p.id)}
          <button type="button" onclick={() => applyPreset(p)} title={p.name}>
            <svg viewBox="-66 -128 132 132" aria-hidden="true"><path d={presetPath(p)} /></svg>
            <span>{p.name}</span>
          </button>
        {/each}
      </div>
      <Slider label="Height" bind:value={getHeight, setHeight} min={40} max={180} unit=" mm" />
      <Slider label="Widest diameter" bind:value={getWidth, setWidth} min={40} max={180} unit=" mm" />
    </details>

    <details>
      <summary>Wall and base</summary>
      <Slider label="Wall thickness" bind:value={cup.wall} min={2} max={9} step={0.1} digits={1} unit=" mm" />
      <Slider label="Base thickness" bind:value={cup.base} min={3} max={16} step={0.5} digits={1} unit=" mm" />
      <Slider label="Bottom edge rounding" bind:value={cup.footRound} min={0} max={10} step={0.5} digits={1} unit=" mm" />
      <Slider label="Inside corner rounding" bind:value={cup.innerRound} min={1} max={25} step={0.5} digits={1} unit=" mm" />
      <label class="check"><input type="checkbox" bind:checked={cup.footRing} /> Carved foot ring underneath</label>
      {#if cup.footRing}
        <Slider label="Foot ring depth" bind:value={cup.footDepth} min={1} max={5} step={0.5} digits={1} unit=" mm" />
      {/if}
    </details>

    <details open>
      <summary>Handle</summary>
      <div class="handles" role="group" aria-label="Handle style">
        {#each HANDLE_TYPES as t (t.id)}
          <button type="button" aria-pressed={cup.handle.type === t.id} onclick={() => (cup.handle.type = t.id)}>
            <svg viewBox="-28 -68 78 76" aria-hidden="true">
              <rect x="-22" y="-60" width="44" height="60" rx="3" class="body" />
              {#if handleIcons[t.id]}<path d={handleIcons[t.id]} class="h" />{/if}
            </svg>
            <span>{t.name}</span>
          </button>
        {/each}
      </div>
      {#if cup.handle.type !== 'none'}
        <Slider label="Reach" bind:value={cup.handle.reach} min={10} max={60} unit=" mm" />
        <Slider label="Top attachment" bind:value={cup.handle.top} min={30} max={98} unit="%" />
        {#if cup.handle.type !== 'ring'}
          <Slider label="Bottom attachment" bind:value={cup.handle.bottom} min={2} max={70} unit="%" />
        {/if}
        <Slider label="Thickness" bind:value={cup.handle.thickness} min={4} max={22} step={0.5} digits={1} unit=" mm" />
        <Slider label="Width" bind:value={cup.handle.width} min={4} max={32} step={0.5} digits={1} unit=" mm" />
        <Slider label="Swell where it joins" bind:value={cup.handle.flare} min={0} max={0.8} step={0.05} digits={2} />
      {/if}
    </details>

    <details open>
      <summary>Lettering</summary>
      <label class="field">
        <span>Text</span>
        <textarea rows="2" bind:value={cup.text.content} placeholder="Type what goes on the cup"></textarea>
      </label>
      <label class="field">
        <span>Font</span>
        <select bind:value={cup.text.family} style:font-family={`"${cup.text.family}", serif`}>
          {#each FONTS as f (f.family)}
            <option value={f.family}>{f.family}</option>
          {/each}
        </select>
      </label>
      <div class="inline">
        <input type="text" bind:value={customFamily} placeholder="Any Google Fonts name" aria-label="Google Fonts family name" onkeydown={(e) => e.key === 'Enter' && addGoogleFont()} />
        <button class="ghost" type="button" onclick={addGoogleFont}>Use font</button>
      </div>
      <label class="upload">
        <input type="file" accept=".ttf,.otf,.woff,.woff2" onchange={uploadFont} />
        <span>Upload your own font file</span>
      </label>
      {#if fontError}<p class="error">{fontError}</p>{/if}
      <div class="inline">
        <Seg small label="Weight" options={[{ id: 400, name: 'Regular' }, { id: 700, name: 'Bold' }]} bind:value={cup.text.weight} />
        <label class="check"><input type="checkbox" bind:checked={cup.text.italic} /> Italic</label>
      </div>
      <Seg label="Imprint" options={styleOpts} bind:value={cup.text.style} />
      {#if cup.text.style === 'print'}
        <ColorField label="Ink colour" bind:value={cup.text.ink} />
      {:else}
        <Slider label="Depth" bind:value={cup.text.depth} min={0.1} max={1.5} step={0.05} digits={2} />
      {/if}
      {#if cup.text.style === 'deboss' || cup.text.style === 'emboss'}
        <Slider label="Glaze pooling" bind:value={cup.text.pool} min={0} max={1} step={0.05} digits={2} />
      {/if}
      <Slider label="Letter height" bind:value={cup.text.size} min={4} max={50} step={0.5} digits={1} unit=" mm" />
      <Slider label="Letter spacing" bind:value={cup.text.spacing} min={-2} max={10} step={0.1} digits={1} unit=" mm" />
      <Slider label="Line spacing" bind:value={cup.text.lineHeight} min={0.7} max={2} step={0.05} digits={2} />
      <Slider label="Height on cup" bind:value={cup.text.y} min={0} max={Math.round(body.height)} step={0.5} digits={1} unit=" mm" />
      <Slider label="Position around" bind:value={cup.text.angle} min={-180} max={180} unit="°" />
      <Slider label="Repeat around" bind:value={cup.text.repeat} min={1} max={6} />
    </details>

    <details open>
      <summary>Glaze and material</summary>
      <Seg small label="Finish" options={finishOpts} bind:value={cup.finish} />
      <ColorField label={finish.glass ? 'Glass tint' : finish.metal ? 'Metal tint' : 'Outside colour'} bind:value={cup.color} />
      {#if !finish.glass && !finish.metal}
        <ColorField label="Inside colour" bind:value={cup.innerColor} />
        <span class="sublabel">Rim</span>
        <Seg small label="Rim colour" options={[{ id: 'outside', name: 'Like outside' }, { id: 'inside', name: 'Like inside' }, { id: 'custom', name: 'Own colour' }]} bind:value={cup.rimMode} />
        {#if cup.rimMode === 'custom'}
          <ColorField label="Rim colour" bind:value={cup.rimColor} />
        {/if}
      {/if}
      {#if finish.speckleOk}
        <label class="check"><input type="checkbox" bind:checked={cup.speckle} /> Iron speckles</label>
        {#if cup.speckle}
          <Slider label="Speckle amount" bind:value={cup.speckleDensity} min={0.05} max={1.5} step={0.05} digits={2} />
        {/if}
      {/if}
      {#if !finish.glass && !finish.metal && !finish.clay}
        <Slider label="Unglazed foot" bind:value={cup.rawFoot} min={0} max={Math.round(body.height * 0.6)} step={0.5} digits={1} unit=" mm" />
        <ColorField label="Clay body colour" bind:value={cup.clayColor} />
      {/if}
    </details>

    <details>
      <summary>Saucer</summary>
      <Seg small label="What sits under the cup" options={SAUCER_TYPES} bind:value={cup.saucer.type} />
      {#if cup.saucer.type !== 'none'}
        <Slider label="Size" bind:value={cup.saucer.size} min={Math.round(body.outer[0][0] + 14)} max={140} unit=" mm radius" />
      {/if}
      {#if cup.saucer.type === 'saucer' || cup.saucer.type === 'plate'}
        <label class="check"><input type="checkbox" bind:checked={cup.saucer.match} /> Same glaze as the cup</label>
        {#if !cup.saucer.match}
          <ColorField label="Saucer colour" bind:value={cup.saucer.color} />
        {/if}
      {/if}
    </details>

    <details>
      <summary>Table and light</summary>
      <Seg small label="Wood" options={woodOpts} bind:value={cup.scene.wood} />
      <Slider label="Light direction" bind:value={cup.scene.sun} min={-180} max={180} unit="°" />
      <Slider label="Exposure" bind:value={cup.scene.exposure} min={0.5} max={1.8} step={0.05} digits={2} />
    </details>

    {#if canSave}
      <details open>
        <summary>Save</summary>
        <div class="actions">
          <button class="primary" type="button" onclick={() => run(() => scene.savePNG())}>Save render as PNG</button>
          <button class="ghost" type="button" onclick={() => run(() => scene.saveSTL())}>Export STL for 3D printing</button>
        </div>
        <p class="hint">The STL holds the cup and handle in millimetres. Lettering is a surface effect, so it isn't cut into the mesh.</p>
        {#if status}<p class="status" role="status">{status}</p>{/if}
      </details>
    {/if}
  </aside>
</main>

<style>
  main {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-columns: 1fr 380px;
    background: #1c1916;
  }
  .stage {
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  .caption {
    position: absolute;
    left: 24px;
    bottom: 18px;
    margin: 0;
    font-size: 13px;
    color: rgba(240, 236, 228, 0.78);
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  .reset {
    position: absolute;
    right: 18px;
    bottom: 14px;
    background: rgba(246, 248, 247, 0.12) !important;
    color: #efe9df !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
  }
  .panel {
    overflow-y: auto;
    background: var(--panel);
    color: var(--ink);
    padding: 22px 22px 40px;
    border-left: 1px solid rgba(0, 0, 0, 0.25);
  }
  header h1 {
    font-family: var(--display);
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    margin: 0 0 8px;
    font-variation-settings: 'wdth' 85;
  }
  header p {
    margin: 0 0 14px;
    font-size: 14px;
    line-height: 1.45;
    color: var(--muted);
    max-width: 36ch;
  }
  details {
    border-top: 1px solid var(--line);
    padding: 4px 0 10px;
  }
  summary {
    font-family: var(--display);
    font-size: 17px;
    font-weight: 600;
    padding: 12px 0 6px;
    cursor: pointer;
    list-style: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::after {
    content: '+';
    font-weight: 400;
    color: var(--muted);
    font-size: 20px;
  }
  details[open] > summary::after {
    content: '–';
  }
  summary:focus-visible {
    outline: 2px solid var(--cobalt);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .hint {
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.45;
    margin: 8px 0;
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin: 12px 0 4px;
  }
  .presets button,
  .handles button {
    border: 1px solid var(--line);
    background: var(--paper);
    border-radius: 9px;
    padding: 6px 2px 5px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink);
  }
  .presets button:hover,
  .handles button:hover {
    border-color: var(--cobalt);
  }
  .presets svg {
    width: 100%;
    height: 38px;
  }
  .presets path {
    fill: var(--cobalt-soft);
    stroke: var(--cobalt);
    stroke-width: 2.5;
  }
  .handles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin: 8px 0;
  }
  .handles svg {
    width: 100%;
    height: 40px;
  }
  .handles .body {
    fill: var(--well);
    stroke: var(--muted);
    stroke-width: 1.5;
  }
  .handles .h {
    fill: none;
    stroke: var(--ink);
    stroke-width: 5;
    stroke-linecap: round;
  }
  .handles button[aria-pressed='true'] {
    border-color: var(--cobalt);
    box-shadow: inset 0 0 0 1px var(--cobalt);
    color: var(--cobalt);
  }
  .handles button[aria-pressed='true'] .h {
    stroke: var(--cobalt);
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--cobalt);
    outline-offset: 1px;
  }
  .field {
    display: grid;
    gap: 5px;
    margin: 10px 0;
    font-size: 13.5px;
  }
  textarea,
  select,
  input[type='text'] {
    font: inherit;
    font-size: 14px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    width: 100%;
    box-sizing: border-box;
  }
  select {
    font-size: 16px;
  }
  textarea {
    resize: vertical;
  }
  .inline {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .inline > :global(.seg) {
    flex: 1;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13.5px;
    margin: 10px 0;
    white-space: nowrap;
  }
  .check input {
    accent-color: var(--cobalt);
    width: 16px;
    height: 16px;
  }
  .upload {
    display: block;
    margin: 8px 0;
    font-size: 13px;
    color: var(--cobalt);
    cursor: pointer;
  }
  .upload input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .upload:focus-within span {
    outline: 2px solid var(--cobalt);
    outline-offset: 2px;
  }
  .upload span {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .sublabel {
    font-size: 13.5px;
    display: block;
    margin-top: 12px;
  }
  .error {
    color: #9b2c1f;
    font-size: 12.5px;
  }
  .ghost,
  .primary {
    font: inherit;
    font-size: 13.5px;
    border-radius: 9px;
    padding: 8px 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .ghost {
    background: var(--paper);
    border: 1px solid var(--line);
    color: var(--ink);
  }
  .ghost:hover {
    border-color: var(--cobalt);
  }
  .primary {
    background: var(--cobalt);
    color: #fff;
    border: 1px solid var(--cobalt);
    font-weight: 600;
  }
  .actions {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }
  .status {
    font-size: 13px;
    color: var(--cobalt);
  }

  @media (max-width: 820px) {
    main {
      grid-template-columns: 1fr;
      grid-template-rows: 46vh 1fr;
    }
    .panel {
      border-left: 0;
      border-top: 1px solid rgba(0, 0, 0, 0.25);
    }
    .caption {
      left: 14px;
      bottom: 12px;
      font-size: 12px;
      max-width: 60%;
    }
  }
</style>
