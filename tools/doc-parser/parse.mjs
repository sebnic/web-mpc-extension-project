/**
 * parse.mjs — Parser de la documentation Live Objects (PDF → JSON chunks)
 *
 * Produit deux fichiers dans ../../web-lo-sample/ (à créer plus tard) :
 *   - lo-doc-chunks.json  : sections découpées pour RAG / MCP Resource
 *   - lo-doc-index.json   : index rapide section → numéro de page
 *
 * Usage : npm run parse
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH  = path.resolve(__dirname, '../../Live Objects - complete developer guide.pdf');
const OUT_DIR   = path.resolve(__dirname, '../../tools/doc-parser/output');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Détecte si une ligne ressemble à un titre de section H1/H2 */
function isHeading(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return false;
  // Typiquement en majuscules ou numérotée "1.2 Titre"
  const isNumbered   = /^\d+(\.\d+)*\s+[A-Z]/.test(trimmed);
  const isUpperTitle = /^[A-Z][A-Z\s\-\/]{4,}$/.test(trimmed);
  const isApiTitle   = /^(GET|POST|PUT|DELETE|PATCH)\s+\//.test(trimmed);
  return isNumbered || isUpperTitle || isApiTitle;
}

/** Nettoie une ligne (retire les artefacts PDF courants) */
function cleanLine(line) {
  return line
    .replace(/\f/g, '')            // form feed
    .replace(/\u0000/g, '')        // null bytes
    .replace(/  +/g, ' ')          // espaces multiples
    .trim();
}

// ── Parsing ───────────────────────────────────────────────────────────────────

async function parsePdf() {
  console.log(`📖 Lecture de : ${path.basename(PDF_PATH)}`);
  const buffer = fs.readFileSync(PDF_PATH);
  const data   = await pdfParse(buffer);

  console.log(`✅ ${data.numpages} pages extraites`);

  const lines  = data.text.split('\n').map(cleanLine).filter(Boolean);
  const chunks = [];
  let currentSection = 'Introduction';
  let currentLines   = [];
  let chunkId        = 0;

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content.length > 80) {          // ignore les sections trop courtes
      chunks.push({
        id:      chunkId++,
        section: currentSection,
        content,
        length:  content.length,
      });
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      currentSection = line.trim();
    } else {
      currentLines.push(line);
    }
  }
  flush(); // dernière section

  return chunks;
}

// ── Catégorisation thématique ─────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'connection',   keywords: ['connect', 'mqtt', 'http', 'tls', 'ssl', 'certificate', 'auth', 'api key', 'token'] },
  { key: 'device',       keywords: ['device', 'objet', 'thing', 'provisioning', 'registration', 'inventory'] },
  { key: 'audit',        keywords: ['audit', 'log', 'event', 'error', 'status', 'diagnostic', 'troubleshoot'] },
  { key: 'data',         keywords: ['data', 'message', 'payload', 'fifo', 'stream', 'value', 'timeserie'] },
  { key: 'command',      keywords: ['command', 'downlink', 'action', 'order', 'fota', 'firmware', 'update'] },
  { key: 'alarm',        keywords: ['alarm', 'alert', 'threshold', 'trigger', 'rule', 'notification'] },
  { key: 'api',          keywords: ['rest api', 'swagger', 'endpoint', 'request', 'response', 'json', 'openapi'] },
];

function categorize(chunk) {
  const text = (chunk.section + ' ' + chunk.content).toLowerCase();
  const cats = CATEGORIES.filter(c => c.keywords.some(kw => text.includes(kw))).map(c => c.key);
  return cats.length > 0 ? cats : ['general'];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDF introuvable : ${PDF_PATH}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const chunks = await parsePdf();

  // Enrichir avec catégories
  const enriched = chunks.map(c => ({ ...c, categories: categorize(c) }));

  // Fichier principal : tous les chunks
  const chunksPath = path.join(OUT_DIR, 'lo-doc-chunks.json');
  fs.writeFileSync(chunksPath, JSON.stringify(enriched, null, 2));
  console.log(`\n📦 ${enriched.length} chunks écrits → ${chunksPath}`);

  // Index rapide : section + catégories + taille (sans le contenu complet)
  const index = enriched.map(({ id, section, categories, length }) => ({ id, section, categories, length }));
  const indexPath = path.join(OUT_DIR, 'lo-doc-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`📑 Index écrit → ${indexPath}`);

  // Stats par catégorie
  console.log('\n📊 Répartition par catégorie :');
  const stats = {};
  enriched.forEach(c => c.categories.forEach(cat => { stats[cat] = (stats[cat] ?? 0) + 1; }));
  Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   ${k.padEnd(12)} : ${v} chunk(s)`);
  });

  console.log('\n✅ Parsing terminé.');
}

main().catch(err => { console.error(err); process.exit(1); });
