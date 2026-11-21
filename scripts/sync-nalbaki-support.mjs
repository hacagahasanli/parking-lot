#!/usr/bin/env node
/**
 * Copies the shared support module (../nalbaki-support/src) into src/vendor/nalbaki-support/.
 * Run after changing the module: node scripts/sync-nalbaki-support.mjs (or set NALBAKI_SUPPORT_DIR).
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kit = resolve(root, process.env.NALBAKI_SUPPORT_DIR ?? '../nalbaki-support');
execFileSync('node', [resolve(kit, 'scripts/sync-into.mjs'), resolve(root, 'src/vendor/nalbaki-support')], { stdio: 'inherit' });
