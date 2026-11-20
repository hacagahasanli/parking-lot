/**
 * The portal build: one static folder (dist/portal) with relative paths, the game and its menus, nothing fetched from our own
 * servers. `npm run build:portal`, then zip the folder for CrazyGames. `npm run dev:portal` serves it on port 3201;
 * `npm run phone:portal` builds it and serves the build on port 3203 to the local network (see docs/TECHNICAL.md, section 14).
 */
import path from 'path';
import { defineConfig } from 'vite';

import { GAME_TITLE, STUDIO_NAME } from './src/lib/studio';

export default defineConfig({
  root: path.resolve(__dirname, 'portal'),
  base: './',
  publicDir: false,
  resolve: {
    alias: [
      // Neutral words only: the studio's copy module is replaced by the neutral one, so its jokes never reach the bundle.
      { find: /^\.\/copy\/studio$/, replacement: path.resolve(__dirname, 'src/game/sim/copy/neutral.ts') },
      { find: '~', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  esbuild: { jsx: 'automatic' },
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
  server: { port: 3201 },
  // `npm run phone:portal` serves the built folder here (with --host, to a phone on the same Wi-Fi).
  preview: { port: 3203 },
  plugins: [
    {
      // 'use client' marks components for Next.js; it means nothing here.
      name: 'strip-use-client',
      enforce: 'pre',
      transform: (code, id) => (id.includes('/src/') && /^'use client';/.test(code) ? { code: code.replace(/^'use client';/, ''), map: null } : null),
    },
    {
      name: 'game-title',
      transformIndexHtml: (html) => html.replace('%GAME_TITLE%', GAME_TITLE).replace('%STUDIO_NAME%', STUDIO_NAME),
    },
  ],
  build: {
    outDir: path.resolve(__dirname, 'dist/portal'),
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { onwarn: (w, warn) => (w.code === 'MODULE_LEVEL_DIRECTIVE' ? undefined : warn(w)) },
  },
});
