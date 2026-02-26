/**
 * build.mjs — Script de build de l'extension Chrome
 *
 * Produit le répertoire dist/ prêt à être chargé dans Chrome :
 *   - Copie manifest.json et les fichiers HTML statiques de src/
 *   - Bundle tous les scripts TypeScript de src/ → dist/
 *     · background.ts, content.ts, inject.ts, options.ts → IIFE (scripts isolés)
 *     · sidepanel.ts → ESM (bundle complet avec @google/genai)
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
// 2. Copie des fichiers statiques (uniquement HTML + manifest)
// ---------------------------------------------------------------------------
const STATIC_FILES = [
  ['manifest.json',      'manifest.json'],
  ['src/options.html',   'options.html'],
  ['src/sidepanel.html', 'sidepanel.html'],
];

for (const [src, dest] of STATIC_FILES) {
  copyFileSync(resolve(__dirname, src), resolve(DIST, dest));
}

console.log('✔  Fichiers statiques copiés dans dist/');

// ---------------------------------------------------------------------------
// 3. Compilation TypeScript via esbuild
//
//    Scripts isolés (pas d'imports runtime) → format IIFE
//    sidepanel.ts (importe @google/genai)   → format ESM + bundle
// ---------------------------------------------------------------------------
const commonOptions = {
  bundle: true,
  platform: 'browser',
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  // esbuild transpile nativement TypeScript (suppression des types)
};

const BUNDLES = [
  { entry: 'background.ts', out: 'background.js', format: 'iife' },
  { entry: 'content.ts',    out: 'content.js',    format: 'iife' },
  { entry: 'inject.ts',     out: 'inject.js',     format: 'iife' },
  { entry: 'options.ts',    out: 'options.js',     format: 'iife' },
  { entry: 'sidepanel.ts',  out: 'sidepanel.js',   format: 'esm'  },
];

if (isWatch) {
  // En mode watch : crée un contexte pour chaque bundle et démarre le watch
  const contexts = await Promise.all(
    BUNDLES.map(({ entry, out, format }) =>
      esbuild.context({
        ...commonOptions,
        entryPoints: [resolve(SRC, entry)],
        outfile: resolve(DIST, out),
        format,
      }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('👀 Mode watch actif — en attente de modifications dans src/…');
} else {
  // En mode normal : build tous les bundles en parallèle
  await Promise.all(
    BUNDLES.map(({ entry, out, format }) =>
      esbuild.build({
        ...commonOptions,
        entryPoints: [resolve(SRC, entry)],
        outfile: resolve(DIST, out),
        format,
      }),
    ),
  );

  for (const { out } of BUNDLES) {
    const sizeKb = (statSync(resolve(DIST, out)).size / 1024).toFixed(1);
    console.log(`✔  dist/${out}${isDev ? ' (dev)' : ' (prod)'} — ${sizeKb} kb`);
  }
  console.log('\n🚀 Build terminé → charger le répertoire dist/ dans chrome://extensions');
}
