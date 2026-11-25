import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(import.meta.dirname ?? '.');
  const env = loadEnv(mode, rootDir, '');
  const mapTilerApiKey = (env.VITE_MAPTILER_API_KEY || '').replace(/^['"]|['"]$/g, '').trim();

  return {
    base: './',
    envDir: rootDir,
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_MAPTILER_API_KEY': JSON.stringify(mapTilerApiKey),
    },
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
