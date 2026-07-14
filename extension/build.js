'use strict';
// Builds the extension: copies the already-built web SPA into media/ (so it ships
// inside the .vsix) and bundles the extension host — including lib/core.js and
// lib/scan.js from the repo root — into out/extension.js.
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const dist = path.join(repoRoot, 'web', 'dist');
const media = path.join(__dirname, 'media');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('web/dist not found — run `npm --prefix web run build` first.');
  process.exit(1);
}

fs.rmSync(media, { recursive: true, force: true });
fs.cpSync(dist, media, { recursive: true });

// vsce ships the LICENSE from the extension dir; source it from the repo root.
fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(__dirname, 'LICENSE'));

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'src', 'extension.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  outfile: path.join(__dirname, 'out', 'extension.js'),
});

console.log('extension built: out/extension.js + media/');
