# Cup studio

A browser-only custom cup generator: Svelte 5 (runes) + three.js.

    npm install
    npm run dev      # local dev server
    npm run build    # single self-contained dist/index.html

## Layout
- `src/lib/cup.svelte.js` – the reactive `$state` cup model, presets, finishes, fonts
- `src/lib/geometry.js` – profile spline/freeform sampling, wall offset, lathe, handle sweep, saucers
- `src/lib/textures.js` – procedural wood, glaze, speckle, clay and the lettering/imprint maps
- `src/lib/Scene.svelte` – three.js scene; `$effect`s rebuild only what changed
- `src/lib/ProfileEditor.svelte` – SVG profile editor (spline points, draw, push-and-pull)
- `src/App.svelte` – control panel; `body` and handle path are `$derived` and shared by editor + scene

Units are millimetres throughout. Add `?debug` to the URL to expose `window.__cup` for testing.
