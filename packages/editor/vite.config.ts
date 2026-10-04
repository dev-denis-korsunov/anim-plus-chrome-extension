import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [vue()], base: './',
  build: { outDir: 'extension', emptyOutDir: false, rollupOptions: { input: { panel: resolve('panel.html'), devtools: resolve('devtools.html') } } }
});
