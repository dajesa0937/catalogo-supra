/**
 * Genera el catálogo publicable a partir del PDF, en tu propio equipo.
 *
 *   npm run generar
 *
 * Por qué existe
 * --------------
 * En modo 'presentacion' el catálogo lo enseñan los distribuidores a SUS
 * clientes. Si el PDF viajara con el sitio, cualquiera podría descargarlo desde
 * la misma dirección y leer los precios de distribución completos: quitarlos de
 * la pantalla no serviría de nada.
 *
 * Así que el PDF se lee UNA vez aquí, en local, y al sitio solo sube el
 * resultado: fichas técnicas y fotografías, sin precios. El archivo con los
 * precios no sale nunca de este computador.
 *
 * De paso, el catálogo publicado carga bastante más rápido: deja de descargar
 * el PDF y la librería que lo interpreta, que son 1,7 MB.
 *
 * Cómo funciona
 * -------------
 * Extraer las fotografías necesita un canvas, y un canvas necesita un
 * navegador. En vez de mantener un segundo extractor para Node —que se
 * desincronizaría del bueno a la primera— se ejecuta el pipeline REAL dentro de
 * un Chromium sin ventana. Lo que se hornea es exactamente lo que vería un
 * visitante, con el mismo código.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

import { APP_CONFIG, CATALOG_MODE, MODE } from '../config/app.config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8199;
const BASE = `http://127.0.0.1:${PORT}`;
const SALIDA_IMAGENES = path.join(ROOT, 'assets', 'products');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

/** Servidor estático mínimo sobre el proyecto. */
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, BASE);
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) throw new Error('fuera de raíz');
    const data = await fs.readFile(file);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': data.length
    });
    response.end(data);
  } catch {
    response.writeHead(404).end('no encontrado');
  }
});

/**
 * Localiza un Chromium instalado sin depender de la versión que Playwright
 * espera. Devuelve `undefined` para que Playwright resuelva por su cuenta.
 * @returns {Promise<string|undefined>}
 */
async function buscarChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  try {
    const entradas = await fs.readdir(base);
    for (const entrada of entradas.filter((n) => n.startsWith('chromium-')).sort().reverse()) {
      const candidato = path.join(base, entrada, 'chrome-linux', 'chrome');
      try { await fs.access(candidato); return candidato; } catch { /* siguiente */ }
    }
  } catch { /* que lo resuelva Playwright */ }
  return undefined;
}

/* --------------------------------------------------------------------- */

console.log(`\nGenerando el catálogo en modo "${CATALOG_MODE}"\n`);

const pdf = path.join(ROOT, APP_CONFIG.pdfUrl);
try {
  const info = await fs.stat(pdf);
  console.log(`  Fuente: ${APP_CONFIG.pdfUrl} (${(info.size / 1024 / 1024).toFixed(1)} MB)`);
} catch {
  console.error(`\n  No encuentro ${APP_CONFIG.pdfUrl}.`);
  console.error('  Copia ahí la lista de precios antes de generar.\n');
  process.exit(1);
}

await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await chromium.launch({ executablePath: await buscarChromium() });
const page = await browser.newPage();

// Leer 16 páginas y recortar 80 fotografías lleva su tiempo; el minuto que
// Playwright da por defecto se queda corto en equipos modestos.
page.setDefaultTimeout(600000);

const problemas = [];
page.on('pageerror', (error) => problemas.push(String(error)));

let resultado;
try {
  await page.goto(`${BASE}/tools/bake.html`, { waitUntil: 'domcontentloaded' });

  const avance = setInterval(async () => {
    const p = await page.evaluate(() => window.__progreso).catch(() => null);
    if (p) process.stdout.write(`\r  ${p.phase}… ${p.done}/${p.total}   `);
  }, 400);

  resultado = await page.evaluate(() => window.hornear());
  clearInterval(avance);
  process.stdout.write('\r'.padEnd(60) + '\r');
} catch (error) {
  console.error('\n  Falló la lectura del PDF:', error.message);
  if (problemas.length) console.error('  ', problemas[0]);
  await browser.close();
  server.close();
  process.exit(1);
}

const { productos, imagenes, avisos, meta } = resultado;

/* --- Qué se publica y qué no ----------------------------------------- */

const publicables = productos.map((producto) => {
  const limpio = {
    code: producto.code,
    slug: producto.slug,
    name: producto.name,
    category: producto.category,
    categoryId: producto.categoryId,
    categoryIcon: producto.categoryIcon,
    brandId: producto.brandId,
    stock: producto.stock,
    specs: producto.specs,
    notes: producto.notes,
    details: producto.details,
    summary: producto.summary,
    searchText: producto.searchText,
    page: producto.page
  };
  // Los precios solo viajan al sitio si el modo los muestra. En presentación
  // no se escriben SIQUIERA en el archivo: lo que no se publica no se filtra.
  if (MODE.showPrices) {
    limpio.priceNet = producto.priceNet;
    limpio.priceGross = producto.priceGross;
  }
  return limpio;
});

/* --- Imágenes --------------------------------------------------------- */

await fs.mkdir(SALIDA_IMAGENES, { recursive: true });

/** Nombre de archivo seguro a partir de un código (`SPS-260A/210` lleva barra). */
const nombreBase = (codigo) => codigo.replace(/[^A-Za-z0-9._-]/g, '_');

// Fotografías propias, puestas a mano. Se reconocen porque NO son `.webp`: esa
// extensión está reservada para lo que extrae el lector. Se inventarían antes
// de limpiar, y ganan en el manifiesto, para que una foto de estudio no la pise
// el recorte del PDF en la siguiente generación.
const propias = new Map();
const existentes = await fs.readdir(SALIDA_IMAGENES).catch(() => []);
for (const producto of productos) {
  const base = nombreBase(producto.code);
  const propia = existentes.find((archivo) =>
    !archivo.endsWith('.webp')
    && /\.(jpe?g|png|avif|gif)$/i.test(archivo)
    && archivo.slice(0, archivo.lastIndexOf('.')) === base);
  if (propia) propias.set(producto.code, propia);
}

// Se limpian las extracciones anteriores para que una referencia retirada no
// deje su fotografía huérfana en el repositorio.
for (const archivo of existentes) {
  if (archivo.endsWith('.webp')) await fs.unlink(path.join(SALIDA_IMAGENES, archivo));
}

const codigosConImagen = [];
for (const [codigo, base64] of Object.entries(imagenes)) {
  if (propias.has(codigo)) continue;          // la fotografía propia manda
  const nombre = `${nombreBase(codigo)}.webp`;
  await fs.writeFile(path.join(SALIDA_IMAGENES, nombre), Buffer.from(base64, 'base64'));
  codigosConImagen.push([codigo, nombre]);
}
for (const [codigo, archivo] of propias) codigosConImagen.push([codigo, archivo]);

// Se ordena por código para que el manifiesto no cambie de orden entre
// generaciones: así el `git diff` muestra lo que de verdad cambió.
codigosConImagen.sort(([a], [b]) => a.localeCompare(b));

await fs.writeFile(
  path.join(SALIDA_IMAGENES, 'manifest.json'),
  JSON.stringify({
    _documentacion: 'Generado por `npm run generar`. Para usar una fotografía propia, colócala aquí con el nombre del código y OTRA extensión (.jpg, .png): se respeta y tiene prioridad sobre el recorte del PDF.',
    ...Object.fromEntries(codigosConImagen)
  }, null, 2) + '\n'
);

/* --- Catálogo --------------------------------------------------------- */

const catalogo = {
  _documentacion: 'Generado por `npm run generar` a partir de la lista de precios. No editar a mano.',
  generado: new Date().toISOString(),
  modo: CATALOG_MODE,
  origen: { paginas: meta.pages, titulo: meta.title },
  avisos,
  productos: publicables
};

await fs.writeFile(path.join(ROOT, APP_CONFIG.bakedUrl), JSON.stringify(catalogo) + '\n');

await browser.close();
server.close();

/* --- Informe ---------------------------------------------------------- */

const categorias = new Set(publicables.map((p) => p.category));
const conFoto = new Set(codigosConImagen.map(([codigo]) => codigo));
const sinImagen = publicables.filter((p) => !conFoto.has(p.code));

console.log(`  Productos:   ${publicables.length}`);
console.log(`  Categorías:  ${categorias.size}`);
console.log(`  Fotografías: ${codigosConImagen.length}`
  + (propias.size ? ` (${propias.size} propia(s), respetada(s))` : ''));
console.log(`  Precios:     ${MODE.showPrices ? 'incluidos' : 'NO se publican'}`);
console.log(`\n  Escrito en ${APP_CONFIG.bakedUrl} y assets/products/`);

if (sinImagen.length > 0) {
  console.log(`\n  ${sinImagen.length} producto(s) sin fotografía:`);
  for (const p of sinImagen.slice(0, 8)) console.log(`    · ${p.code} — ${p.name}`);
}

if (avisos.length > 0) {
  console.log(`\n  ATENCIÓN · el lector no pudo completar ${avisos.length} fila(s):`);
  for (const aviso of avisos.slice(0, 10)) console.log(`    · ${aviso}`);
  console.log('\n  Revisa el PDF antes de subir. Si el maquetado cambió, hay que');
  console.log('  ajustar config/parser.config.js.');
}

console.log(
  publicables.length === 0
    ? '\n  No se extrajo ningún producto. NO subas esto.\n'
    : '\n  Listo. Ya puedes subir el cambio.\n'
);
process.exit(publicables.length === 0 ? 1 : 0);
