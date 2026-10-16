<script>
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
  import { cup, FINISHES } from './cup.svelte.js';
  import { lathe, sweepHandle, buildSaucer, buildSlate, heightToV, radiusAt } from './geometry.js';
  import { OuterPainter, paintGlaze, paintClay, makeWood, makeCork, makeSlate, makeContactShadow, makeCanvas } from './textures.js';
  import { meshesToSTL, zipFiles, saveFile, downloadsApi } from './exporters.js';

  /** @type {{ body: any, handle: [number, number][] | null }} */
  let { body, handle } = $props();

  let host;
  let ready = $state(false);

  // three.js objects (not reactive on purpose)
  let renderer, scene, camera, controls, sun, cupGroup, table, tableMat, saucerMesh, saucerMat;
  let shadowFloor, shadowSeat;
  const meshes = {};
  const mats = {};
  const tex = {};
  const canvases = {};
  let painter;
  const SEGS = 160;
  // render on demand: only draw when something changed
  let dirty = true;
  let renders = 0;
  const invalidate = () => (dirty = true);

  function canvasTex(c, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = cup.scene.exposure;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#2a2520');
    scene.fog = new THREE.Fog('#2a2520', 520, 1500);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    scene.environmentIntensity = 0.5;
    room.dispose?.();

    camera = new THREE.PerspectiveCamera(30, 1, 5, 6000);
    camera.position.set(215, 170, 330);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 48, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 170;
    controls.maxDistance = 1200;
    controls.maxPolarAngle = 1.47;
    controls.update();

    sun = new THREE.DirectionalLight('#fff1de', 2.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 50, far: 1600 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 1.2;
    sun.shadow.radius = 5;
    sun.target.position.set(0, 40, 0);
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight('#d6e2ff', 0.55);
    rim.position.set(-400, 300, -500);
    scene.add(rim);

    // table
    tableMat = new THREE.MeshPhysicalMaterial({ roughness: 1, bumpScale: 1.2, clearcoat: 0.12, clearcoatRoughness: 0.5 });
    table = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), tableMat);
    table.receiveShadow = true;
    scene.add(table);

    const shTex = new THREE.CanvasTexture(makeContactShadow());
    const mkShadow = (op) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: op, polygonOffset: true, polygonOffsetFactor: -2 })
      );
      m.renderOrder = 1;
      scene.add(m);
      return m;
    };
    shadowFloor = mkShadow(0.7);
    shadowSeat = mkShadow(0.5);

    // canvases + textures
    const big = window.innerWidth > 900;
    painter = new OuterPainter(big ? 3072 : 2048, big ? 1536 : 1024);
    tex.outerColor = canvasTex(painter.color);
    tex.outerRough = canvasTex(painter.rough, false);
    tex.outerHeight = canvasTex(painter.height, false);
    for (const [k, n] of [['inner', 1024], ['handle', 1024], ['rim', 512], ['clay', 512], ['saucer', 1024]]) {
      canvases[k] = makeCanvas(n, n);
      tex[k] = canvasTex(canvases[k]);
    }
    tex.inner.repeat.set(3, 2);
    tex.handle.repeat.set(1, 1);

    mats.outer = new THREE.MeshPhysicalMaterial({ map: tex.outerColor, roughnessMap: tex.outerRough, bumpMap: tex.outerHeight, roughness: 1 });
    mats.inner = new THREE.MeshPhysicalMaterial({ map: tex.inner });
    mats.rim = new THREE.MeshPhysicalMaterial({ map: tex.rim });
    mats.handle = new THREE.MeshPhysicalMaterial({ map: tex.handle });
    mats.under = new THREE.MeshPhysicalMaterial({ map: tex.clay, roughness: 0.92 });

    cupGroup = new THREE.Group();
    scene.add(cupGroup);
    for (const k of ['under', 'outer', 'rim', 'inner', 'handle']) {
      meshes[k] = new THREE.Mesh(new THREE.BufferGeometry(), mats[k]);
      meshes[k].castShadow = true;
      meshes[k].receiveShadow = true;
      cupGroup.add(meshes[k]);
    }
    saucerMat = new THREE.MeshPhysicalMaterial({ map: tex.saucer });
    saucerMesh = new THREE.Mesh(new THREE.BufferGeometry(), saucerMat);
    saucerMesh.castShadow = true;
    saucerMesh.receiveShadow = true;
    scene.add(saucerMesh);

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      invalidate();
    });
    ro.observe(host);
    controls.addEventListener('change', invalidate);
    renderer.setAnimationLoop(() => {
      controls.update();
      if (!dirty) return;
      dirty = false;
      renderer.render(scene, camera);
      renders++;
    });
    if (new URLSearchParams(location.search).has('debug')) {
      window.__cup = {
        renders: () => renders,
        shot: () => {
          if (paintArgs) {
            painter.paint(paintArgs);
            for (const t of Object.values(tex)) t.needsUpdate = true;
          }
          renderer.render(scene, camera);
          return renderer.domElement.toDataURL('image/jpeg', 0.9);
        },
        camera,
        controls,
        state: cup
      };
    }
    ready = true;

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  });

  // ---- body geometry ----
  $effect(() => {
    if (!ready) return;
    invalidate();
    ['under', 'outer', 'rim', 'inner'].forEach((k, i) => {
      const sec = body.sections[i];
      const g = lathe(sec.pts, sec.nrm, SEGS);
      meshes[k].geometry.dispose();
      meshes[k].geometry = g;
    });
  });

  // ---- handle ----
  $effect(() => {
    if (!ready) return;
    invalidate();
    const { thickness, width, flare } = cup.handle;
    meshes.handle.visible = !!handle;
    if (!handle) return;
    const g = sweepHandle(handle, thickness, width, flare);
    meshes.handle.geometry.dispose();
    meshes.handle.geometry = g;
  });

  // ---- saucer + contact shadows ----
  let woodTex, corkTex, slateTex;
  $effect(() => {
    if (!ready) return;
    invalidate();
    const { type, size } = cup.saucer;
    const cupR0 = body.outer[0][0];
    let built = null;
    if (type === 'slate') built = buildSlate(size);
    else if (type !== 'none') built = buildSaucer(type, size, cupR0);
    saucerMesh.visible = !!built;
    const seat = built ? built.seat : 0;
    if (built) {
      saucerMesh.geometry.dispose();
      saucerMesh.geometry = built.geometry;
    }
    cupGroup.position.y = seat;
    const footprint = built ? size * (type === 'slate' ? 1.25 : 1) : Math.max(body.maxR, cupR0);
    shadowFloor.scale.set(footprint * 2.5, 1, footprint * 2.5);
    shadowFloor.position.y = 0.3;
    shadowSeat.visible = !!built;
    shadowSeat.scale.set(cupR0 * 2.7, 1, cupR0 * 2.7);
    shadowSeat.position.y = seat + 0.25;
  });

  $effect(() => {
    if (!ready) return;
    invalidate();
    const { type, match, color } = cup.saucer;
    const f = FINISHES[cup.finish];
    const glazeColor = match ? cup.color : color;
    const speckle = cup.speckle && f.speckleOk;
    const density = cup.speckleDensity;
    const m = saucerMat;
    m.metalness = 0;
    m.transmission = 0;
    m.clearcoat = 0;
    m.bumpMap = null;
    if (type === 'wood') {
      if (!woodTex) {
        const w = makeWood('walnut', 1024, 3, 9);
        woodTex = { map: canvasTex(w.color), bump: canvasTex(w.bump, false) };
      }
      m.map = woodTex.map;
      m.bumpMap = woodTex.bump;
      m.bumpScale = 1.5;
      m.roughness = 0.55;
      m.clearcoat = 0.3;
      m.clearcoatRoughness = 0.35;
    } else if (type === 'cork') {
      corkTex ??= canvasTex(makeCork());
      m.map = corkTex;
      m.bumpMap = m.map;
      m.bumpScale = 2;
      m.roughness = 0.95;
    } else if (type === 'slate') {
      slateTex ??= canvasTex(makeSlate());
      m.map = slateTex;
      m.bumpMap = m.map;
      m.bumpScale = 1;
      m.roughness = 0.78;
    } else {
      const fin = match ? f : FINISHES.glossy;
      paintGlaze(canvases.saucer, glazeColor, { speckle: match ? speckle : false, density, mottle: 0.1, seed: 13 });
      tex.saucer.needsUpdate = true;
      m.map = tex.saucer;
      m.roughness = fin.roughness;
      m.metalness = fin.metal ? 1 : 0;
      m.transmission = fin.glass ? 1 : 0;
      m.thickness = 3;
      m.attenuationColor = new THREE.Color(glazeColor);
      m.attenuationDistance = 90;
    }
    m.needsUpdate = true;
  });

  // ---- outer surface paint: glaze, raw foot, lettering ----
  let paintRaf = 0;
  let paintArgs = null;
  $effect(() => {
    if (!ready) return;
    invalidate();
    const f = FINISHES[cup.finish];
    const text = $state.snapshot(cup.text);
    const os = body.outerSec;
    const plain = f.glass || f.metal;
    paintArgs = {
      color: cup.color,
      clayColor: cup.clayColor,
      speckle: cup.speckle && !!f.speckleOk,
      density: cup.speckleDensity,
      mottle: plain ? 0 : 0.1,
      roughness: f.roughness,
      clayBody: !!f.clay,
      footV: plain || f.clay || cup.rawFoot <= 0 ? 0 : heightToV(os, cup.rawFoot),
      pxPerMmY: painter.H / os.L,
      pxPerMmX: painter.W / (2 * Math.PI * body.maxR),
      text,
      textV: heightToV(os, text.y),
      textRadius: Math.max(5, radiusAt(body.outer, text.y)),
      tick: cup.fontTick
    };
    if (!paintRaf)
      paintRaf = requestAnimationFrame(() => {
        paintRaf = 0;
        painter.paint(paintArgs);
        tex.outerColor.needsUpdate = true;
        tex.outerRough.needsUpdate = true;
        tex.outerHeight.needsUpdate = true;
        invalidate();
      });
  });

  // ---- inner / handle / rim / underside canvases ----
  $effect(() => {
    if (!ready) return;
    invalidate();
    const f = FINISHES[cup.finish];
    const o = { speckle: cup.speckle && !!f.speckleOk, density: cup.speckleDensity, mottle: f.glass || f.metal ? 0 : 0.1 };
    paintGlaze(canvases.inner, cup.innerColor, { ...o, seed: 3 });
    paintGlaze(canvases.handle, cup.color, { ...o, seed: 5 });
    const rimColor = cup.rimMode === 'inside' ? cup.innerColor : cup.rimMode === 'custom' ? cup.rimColor : cup.color;
    paintGlaze(canvases.rim, rimColor, { ...o, seed: 9 });
    if (f.clay) paintGlaze(canvases.clay, cup.color, { ...o, seed: 11 });
    else paintClay(canvases.clay, cup.clayColor);
    for (const k of ['inner', 'handle', 'rim', 'clay']) tex[k].needsUpdate = true;
  });

  // ---- material properties ----
  $effect(() => {
    if (!ready) return;
    invalidate();
    const f = FINISHES[cup.finish];
    const { style, depth } = cup.text;
    const tint = new THREE.Color(cup.color);
    for (const k of ['outer', 'inner', 'rim', 'handle', 'under']) {
      const m = mats[k];
      const isUnder = k === 'under';
      const plainUnder = isUnder && !(f.glass || f.metal);
      m.map = isUnder && !plainUnder ? tex.handle : tex[k === 'outer' ? 'outerColor' : k === 'under' ? 'clay' : k];
      if (k !== 'outer') m.roughness = plainUnder ? 0.92 : f.roughness;
      m.metalness = f.metal && !plainUnder ? 1 : 0;
      m.transmission = f.glass ? 1 : 0;
      m.thickness = cup.wall;
      m.ior = f.glass ? 1.5 : 1.52;
      m.attenuationColor = tint;
      m.attenuationDistance = 70;
      m.specularIntensity = 1;
      m.needsUpdate = true;
    }
    // lettering depth: the height map is drawn already signed (dark = recessed)
    const k = style === 'print' ? 0.15 : style === 'etch' ? 0.3 : 1;
    mats.outer.bumpScale = depth * 6 * k;
  });

  // ---- table + light ----
  let woodKind = '';
  $effect(() => {
    if (!ready) return;
    invalidate();
    const kind = cup.scene.wood;
    if (kind === woodKind) return;
    woodKind = kind;
    const w = makeWood(kind, 2048, 6, 3);
    for (const key of ['map', 'bumpMap', 'roughnessMap']) tableMat[key]?.dispose();
    tableMat.map = canvasTex(w.color);
    tableMat.bumpMap = canvasTex(w.bump, false);
    tableMat.roughnessMap = canvasTex(w.rough, false);
    for (const t of [tableMat.map, tableMat.bumpMap, tableMat.roughnessMap]) t.repeat.set(3.25, 3.25);
    tableMat.needsUpdate = true;
  });

  $effect(() => {
    if (!ready) return;
    invalidate();
    const a = (cup.scene.sun * Math.PI) / 180;
    sun.position.set(Math.sin(a) * 520, 620, Math.cos(a) * 520);
    renderer.toneMappingExposure = cup.scene.exposure;
  });

  // ---- exports (called from the panel via bind:this) ----
  export async function savePNG() {
    renderer.render(scene, camera);
    const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/png'));
    return saveFile('cup-render.png', blob);
  }

  export async function saveSTL() {
    const parts = ['under', 'outer', 'rim', 'inner'].map((k) => meshes[k]);
    if (meshes.handle.visible) parts.push(meshes.handle);
    cupGroup.updateMatrixWorld();
    const data = meshesToSTL(parts, cupGroup);
    const d = await downloadsApi();
    if (d.mode === 'claude') return saveFile('cup-stl.zip', zipFiles([{ name: 'cup.stl', data }]));
    return saveFile('cup.stl', new Blob([data], { type: 'model/stl' }));
  }

  export function resetView() {
    const k = Math.max(1, Math.max(body.height, body.maxR * 2) / 100);
    camera.position.set(215 * k, 170 * k, 330 * k);
    controls.target.set(0, body.height * 0.45 + 6, 0);
    controls.update();
    invalidate();
  }
</script>

<div class="scene" bind:this={host}></div>

<style>
  .scene {
    position: absolute;
    inset: 0;
    touch-action: none;
  }
  .scene :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
  }
</style>
