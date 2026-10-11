import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// STATIC=1 → build only the free (client-only) app, for static hosting.
const root = path.resolve(import.meta.dirname, 'client');
const input = { main: path.join(root, 'index.html') };
if (!process.env.STATIC) input.studio = path.join(root, 'studio.html');

export default defineConfig({
  root,
  // BASE_PATH lets CI build for a sub-path such as /comic-studio/ (GitHub Pages).
  base: process.env.BASE_PATH || './',
  define: { 'import.meta.env.VITE_STATIC': JSON.stringify(!!process.env.STATIC) },
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(import.meta.dirname, 'shared') } },
  server: { fs: { allow: [import.meta.dirname] } },
  build: { outDir: path.resolve(import.meta.dirname, process.env.STATIC ? 'dist-static' : 'dist'), emptyOutDir: true, rollupOptions: { input } },
});
