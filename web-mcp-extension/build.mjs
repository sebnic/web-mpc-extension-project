/**
 * build.mjs — Script de build de l'extension Chrome
 *
 * Produit le répertoire dist/ prêt à être chargé dans Chrome :
 *   - Copie manifest.json et les fichiers statiques de src/
 *   - Bundle src/sidepanel.js (qui importe @google/genai) → dist/sidepanel.js
 *
 * Usage :
 *   node build.mjs            (production, minifié)
 *   node build.mjs --dev      (développement, source maps)
 *   node build.mjs --watch    (rebuild automatique)
 */

import * as esbuild from 'esbuild';
import { mkdirSync, rmSync, copyFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, 'src');
const DIST = resolve(__dirname, 'dist');

const isDev = process.argv.includes('--dev');
const isWatch = process.argv.includes('--watch');

// ---------------------------------------------------------------------------
// 1. Nettoyage et création de dist/
// ---------------------------------------------------------------------------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// ---------------------------------------------------------------------------
// 2. Copie des fichiers statiques
// ---------------------------------------------------------------------------
const STATIC_FILES = [
  // Depuis la racine
  ['manifest.json', 'manifest.json'],
  // Depuis src/
  ['src/background.js',  'background.js'],
  ['src/content.js',     'content.js'],
  ['src/inject.js',      'inject.js'],
  ['src/options.js',     'options.js'],
  ['src/options.html',   'options.html'],
  ['src/sidepanel.html', 'sidepanel.html'],
];

for (const [src, dest] of STATIC_FILES) {
  copyFileSync(resolve(__dirname, src), resolve(DIST, dest));
}

console.log('✔  Fichiers statiques copiés dans dist/');

// ---------------------------------------------------------------------------
// 3. Bundle sidepanel.js (avec @google/genai)
// ---------------------------------------------------------------------------
const buildOptions = {
  entryPoints: [resolve(SRC, 'sidepanel.js')],
  outfile: resolve(DIST, 'sidepanel.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('👀 Mode watch actif — en attente de modifications dans src/…');
} else {
  await esbuild.build(buildOptions);
  const sizeKb = (statSync(resolve(DIST, 'sidepanel.js')).size / 1024).toFixed(1);
  console.log(`✔  dist/sidepanel.js bundlé${isDev ? ' (dev)' : ' (prod)'} — ${sizeKb} kb`);
  console.log('\n🚀 Build terminé → charger le répertoire dist/ dans chrome://extensions');
}
