import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds one self-contained index.html (JS + CSS inlined).
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 4000 }
});
