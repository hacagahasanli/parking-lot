/**
 * The web build: the portal build's game for our own subdomain (dist/web, served by Vercel, see vercel.json). Same entry
 * setup, aliases and neutral copy as vite.portal.config.ts; its own entry (web/main.tsx) adds the Support us pill and the
 * studio's stats, and loads no portal SDK. `npm run build:web`, then `npx vite preview --config vite.web.config.ts` (port 3233).
 * The Next site's public folder (favicon.ico, og.jpg, icons) is served at the root, so its old URLs keep working.
 */
import path from 'path';
import { defineConfig, mergeConfig } from 'vite';

import portal from './vite.portal.config';

export default mergeConfig(
  portal,
  defineConfig({
    root: path.resolve(__dirname, 'web'),
    base: '/',
    publicDir: path.resolve(__dirname, 'public'),
    server: { port: 3231 },
    preview: { port: 3233 },
    build: { outDir: path.resolve(__dirname, 'dist/web') },
  }),
);
