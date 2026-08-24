/**
 * Suite de verificación del motor de extracción.
 *
 * Ejecuta el pipeline PURO (textExtractor → computeImageRegions → productParser)
 * sobre el PDF real y comprueba las invariantes del catálogo. No necesita
 * navegador porque toda la lógica de parseo está libre de DOM.
 *
 * Uso:  node tests/parser.test.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { extractLines, measureBodyFontSize } from '../scripts/data/textExtractor.js';
import { parsePage, enrichProduct } from '../scripts/data/productParser.js';
import { PARSER_CONFIG } from '../config/parser.config.js';

const require = createRequire(import.meta.url);
const pdfjs = await import(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'));

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH = path.join(ROOT, '..', 'data', 'lista-precios.pdf');

let failures = 0;

/**
 * @param {string} label
 * @param {boolean} condition
 * @param {string} [detail]
 */
function check(label, condition, detail = '') {
  const mark = condition ? '[32m✓[0m' : '[31m✗[0m';
  console.log(`  ${mark} ${label}${detail ? `  ${detail}` : ''}`);
  if (!condition) failures += 1;
}

const doc = await pdfjs.getDocument({ url: PDF_PATH, verbosity: 0 }).promise;
const { leading, trailing } = PARSER_CONFIG.skipPages;
const first = leading + 1;
const last = doc.numPages - trailing;

// Pasada 1 · se leen todas las páginas para medir el cuerpo de letra del
// documento completo. Alguna página compone el nombre del producto al mismo
// tamaño que la ficha técnica, así que medir página a página falsearía la escala.
const pages = [];
for (let pageNumber = first; pageNumber <= last; pageNumber += 1) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  pages.push({ pageNumber, lines: extractLines(await page.getTextContent(), viewport.height) });
  page.cleanup();
}
const bodySize = measureBodyFontSize(pages.flatMap((p) => p.lines));

// Pasada 2 · segmentación con la escala ya fijada.
const context = { category: null };
const allProducts = [];
const allWarnings = [];
for (const { pageNumber, lines } of pages) {
  for (const line of lines) line.sizeRatio = Math.round((line.size / bodySize) * 10) / 10;
  // Las imágenes se extraen en el navegador (requieren canvas); esta suite
  // verifica exclusivamente el pipeline de texto, que es el crítico.
  const { products, warnings } = parsePage(lines, [], pageNumber, context);
  allProducts.push(...products.map(enrichProduct));
  allWarnings.push(...warnings);
}

const categories = [...new Set(allProducts.map((p) => p.category))];
const brands = [...new Set(allProducts.map((p) => p.brandId))];
const withCode = allProducts.filter((p) => !p.code.startsWith('SIN-CODIGO'));
const withBothPrices = allProducts.filter((p) => p.priceNet && p.priceGross);
const withSpecs = allProducts.filter((p) => p.specs.length > 0);
const codes = withCode.map((p) => p.code);
const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);

console.log(`\nPDF: ${doc.numPages} páginas · se parsean ${first}–${last}\n`);
console.log('Extracción');
check('Se extraen entre 70 y 90 productos', allProducts.length >= 70 && allProducts.length <= 90, `→ ${allProducts.length}`);
check('Todos los productos tienen código', withCode.length === allProducts.length, `→ ${withCode.length}/${allProducts.length}`);
check('No hay códigos duplicados', duplicates.length === 0, duplicates.length ? `→ ${duplicates.join(', ')}` : '');
check('Todos tienen los dos precios', withBothPrices.length === allProducts.length, `→ ${withBothPrices.length}/${allProducts.length}`);
check('Todos tienen ficha técnica', withSpecs.length === allProducts.length, `→ ${withSpecs.length}/${allProducts.length}`);
check('Se detectan entre 15 y 20 categorías', categories.length >= 15 && categories.length <= 20, `→ ${categories.length}`);
check('Ningún producto queda sin categoría', !allProducts.some((p) => p.category === 'Sin categoría'));
check('El precio neto es menor que el bruto', allProducts.every((p) => !p.priceNet || !p.priceGross || p.priceNet <= p.priceGross));
check('Se detectan al menos dos marcas', brands.length >= 2, `→ ${brands.join(', ')}`);

// Regresión: una clave de ficha técnica que el PDF dejó sin valor ("Caudal:")
// terminaba mostrándose como un aviso comercial vacío en la ficha.
const notasVacias = allProducts.flatMap((p) =>
  p.notes.filter((note) => /:\s*\.?$/.test(note.trim()) || note.trim().length < 3)
    .map((note) => `${p.code}: "${note}"`));
check('Ninguna nota es una clave sin valor', notasVacias.length === 0,
  notasVacias.length ? `→ ${notasVacias.slice(0, 3).join(', ')}` : '');
const specsVacias = allProducts.flatMap((p) =>
  p.specs.filter((spec) => !spec.value?.trim()).map((spec) => `${p.code}/${spec.key}`));
check('Ninguna especificación queda sin valor', specsVacias.length === 0,
  specsVacias.length ? `→ ${specsVacias.slice(0, 3).join(', ')}` : '');

console.log('\nMuestras de control');
const samples = [
  { code: 'SPS-260', name: /bomba/i, net: 257048, gross: 269900 },
  { code: 'PWP-3100GE', name: /hidrolavadora/i, net: 1554622, gross: 1850000 },
  { code: 'SGE-154F', name: /motor/i, net: 335294, gross: 399000 }
];
for (const sample of samples) {
  const found = allProducts.find((p) => p.code === sample.code);
  check(`${sample.code} existe`, Boolean(found));
  if (!found) continue;
  check(`${sample.code} · nombre`, sample.name.test(found.name), `→ "${found.name}"`);
  check(`${sample.code} · precios`, found.priceNet === sample.net && found.priceGross === sample.gross,
    `→ ${found.priceNet} / ${found.priceGross}`);
}

const imageWarnings = allWarnings.filter((w) => w.includes('sin imagen'));
const realWarnings = allWarnings.filter((w) => !w.includes('sin imagen'));
if (realWarnings.length > 0) {
  console.log(`\nAvisos del parser (${realWarnings.length})`);
  for (const warning of realWarnings.slice(0, 25)) console.log(`  · ${warning}`);
}

console.log('\nCategorías detectadas');
for (const category of categories) {
  const count = allProducts.filter((p) => p.category === category).length;
  console.log(`  ${String(count).padStart(3)} · ${category}`);
}

console.log(failures === 0 ? '\n[32mTodo correcto.[0m\n' : `\n[31m${failures} comprobación(es) fallida(s).[0m\n`);
process.exit(failures === 0 ? 0 : 1);
