/**
 * Suite de extremo a extremo sobre el catálogo real, en un navegador real.
 *
 * Cubre lo que la suite del parser no puede: extracción de imágenes (necesita
 * canvas), caché en IndexedDB, búsqueda, filtros, ficha de producto y ambos
 * temas. Levanta un servidor estático sobre el proyecto tal cual se publicaría
 * en GitHub Pages, de modo que se prueba exactamente lo que se despliega.
 *
 * Uso:  node tests/e2e.test.mjs [--screenshots]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

import { CATALOG_MODE, MODE } from '../config/app.config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
const WANT_SHOTS = process.argv.includes('--screenshots');

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

let failures = 0;

/**
 * Marca una comprobación como no aplicable al modo actual. No cuenta como
 * fallo: en modo presentación no hay precios que ordenar ni WhatsApp al que
 * escribir, y fingir que sí los hay solo produciría ruido rojo.
 * @param {string} label
 * @param {string} motivo
 */
function skip(label, motivo) {
  console.log(`  [90m·[0m ${label}  [90m(no aplica: ${motivo})[0m`);
}

/**
 * @param {string} label
 * @param {boolean} condition
 * @param {string} [detail]
 */
function check(label, condition, detail = '') {
  console.log(`  ${condition ? '[32m✓[0m' : '[31m✗[0m'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!condition) failures += 1;
}

/** Servidor estático mínimo, equivalente a lo que sirve GitHub Pages. */
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, BASE);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(ROOT, relative);
    if (!file.startsWith(ROOT)) throw new Error('fuera de raíz');
    const data = await fs.readFile(file);
    const stat = await fs.stat(file);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': data.length,
      'Last-Modified': stat.mtime.toUTCString()
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(404).end('no encontrado');
  }
});

/**
 * Localiza el Chromium ya instalado en el entorno. Evita depender de que la
 * versión que Playwright espera coincida con la descargada.
 * @returns {Promise<string|undefined>}
 */
async function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  try {
    const entries = await fs.readdir(base);
    for (const entry of entries.filter((name) => name.startsWith('chromium-')).sort().reverse()) {
      const candidate = path.join(base, entry, 'chrome-linux', 'chrome');
      try {
        await fs.access(candidate);
        return candidate;
      } catch { /* siguiente candidato */ }
    }
  } catch { /* usa el que Playwright resuelva por defecto */ }
  return undefined;
}

await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({ executablePath: await findChromium() });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(String(error)));

console.log(`\nModo del catálogo: ${CATALOG_MODE}`
  + ` · precios ${MODE.showPrices ? 'visibles' : 'ocultos'}`
  + ` · fuente ${MODE.source}`);

console.log(MODE.source === 'baked'
  ? '\nPrimera carga · se sirve el catálogo ya generado\n'
  : '\nPrimera carga · se lee el PDF completo\n');
const startedAt = Date.now();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card', { timeout: 90000 });
const coldMs = Date.now() - startedAt;

const stats = await page.evaluate(() => ({
  cards: document.querySelectorAll('.card').length,
  categories: document.querySelectorAll(
      '#category-nav .sidebar__item[data-category]:not([data-category="__favorites__"])').length,
  brands: document.querySelectorAll('.brand-chip').length,
  count: document.querySelector('#toolbar-count')?.textContent ?? '',
  warnings: document.querySelectorAll('#diagnostics .notice').length
}));

check('Se pinta el catálogo', stats.cards > 0, `→ ${stats.cards} tarjetas`);
check('Aparecen todas las categorías', stats.categories >= 15, `→ ${stats.categories}`);
check('Aparecen los filtros de marca', stats.brands >= 2, `→ ${stats.brands}`);
check('El parser no reporta filas incompletas', stats.warnings === 0);
check('Primera carga por debajo de 30 s', coldMs < 30000, `→ ${(coldMs / 1000).toFixed(1)} s`);

// --- Imágenes -------------------------------------------------------------
await page.waitForTimeout(1200);
const images = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.card__image')];
  return {
    total: nodes.length,
    loaded: nodes.filter((node) => node.dataset.loaded === 'true').length,
    empty: document.querySelectorAll('.card__media--empty').length,
    sample: nodes.filter((node) => node.naturalWidth > 40).length
  };
});
check('Las imágenes se asocian a su producto', images.empty === 0, `→ ${images.empty} sin imagen`);
check('Las imágenes se decodifican', images.sample > 0, `→ ${images.sample}/${images.total} visibles`);

// Regresión: la caja de la fotografía nunca puede exceder su bandeja. Si lo
// hace, `overflow: hidden` recorta el producto y la máquina se ve a medias.
const desborde = async () => page.evaluate(() => {
  let peor = 0;
  for (const image of document.querySelectorAll('.card__image')) {
    const media = image.closest('.card__media').getBoundingClientRect();
    const box = image.getBoundingClientRect();
    peor = Math.max(peor, box.height - media.height, box.width - media.width);
  }
  return Math.round(peor);
});
check('En cuadrícula la foto cabe entera en su bandeja', await desborde() <= 1,
  `→ desborde máximo ${await desborde()} px`);

await page.click('[data-view-mode="list"]');
await page.waitForTimeout(600);
check('En lista la foto cabe entera en su bandeja', await desborde() <= 1,
  `→ desborde máximo ${await desborde()} px`);
await page.click('[data-view-mode="grid"]');
await page.waitForTimeout(400);

// --- Caché ----------------------------------------------------------------
console.log(MODE.source === 'baked'
  ? '\nSegunda carga\n'
  : '\nSegunda carga · debe servirse de IndexedDB\n');
const warmStart = Date.now();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card', { timeout: 30000 });
const warmMs = Date.now() - warmStart;
check('Segunda carga por debajo de 3 s', warmMs < 3000, `→ ${warmMs} ms`);

// La caché existe para no repetir la lectura del PDF, que es lo caro. Cuando el
// catálogo ya viene generado no hay nada caro que evitar: la primera carga ya
// es prácticamente instantánea, así que exigir un 2× no mide nada.
if (MODE.source === 'baked') {
  skip('Es al menos 2× más rápida que la primera', 'la primera ya no lee el PDF');
} else {
  check('Es al menos 2× más rápida que la primera', warmMs * 2 < coldMs,
    `→ ${(coldMs / warmMs).toFixed(1)}× más rápida`);
}

// --- Búsqueda -------------------------------------------------------------
console.log('\nInteracción\n');
await page.fill('#search-input', 'SPS-260');
await page.waitForTimeout(320);
const searchTop = await page.evaluate(() =>
  document.querySelector('.card__code')?.textContent ?? '');
check('La búsqueda por código coloca la referencia exacta primero', searchTop === 'SPS-260', `→ ${searchTop}`);

await page.fill('#search-input', 'ceramica');
await page.waitForTimeout(320);
const accentHits = await page.evaluate(() => document.querySelectorAll('.card').length);
check('La búsqueda ignora tildes', accentHits > 0, `→ ${accentHits} resultados con "ceramica"`);

await page.fill('#search-input', 'xyzzy-no-existe');
await page.waitForTimeout(320);
check('Sin resultados se muestra un estado vacío útil',
  await page.locator('.empty__title').isVisible());

await page.click('#search-clear');
await page.waitForTimeout(320);

// --- Filtros y orden ------------------------------------------------------
await page.click('#category-nav .sidebar__item[data-category]:not([data-category="__favorites__"])');
await page.waitForTimeout(300);
const categoryFiltered = await page.evaluate(() => ({
  hash: location.hash,
  cards: document.querySelectorAll('.card').length,
  pill: document.querySelectorAll('.filter-pill').length
}));
check('Filtrar por categoría cambia la URL', categoryFiltered.hash.startsWith('#/categoria/'),
  `→ ${categoryFiltered.hash}`);
check('El filtro activo se muestra como píldora', categoryFiltered.pill > 0);

if (MODE.showPrices) {
  await page.selectOption('#sort-select', 'price-asc');
  await page.waitForTimeout(300);
  const ascending = await page.evaluate(() => [...document.querySelectorAll('.price__value')]
    .map((node) => Number(node.textContent.replace(/[^\d]/g, ''))));
  check('Ordenar por precio ascendente funciona',
    ascending.every((value, index) => index === 0 || ascending[index - 1] <= value));
} else {
  // Sin precios, el orden por precio no debe ni ofrecerse: una opción que no
  // ordena nada es peor que una opción que falta.
  const opciones = await page.evaluate(() =>
    [...document.querySelectorAll('#sort-select option')].map((option) => option.value));
  check('Sin precios no se ofrece ordenar por precio',
    opciones.length > 0 && !opciones.some((value) => value.startsWith('price-')),
    `→ ${opciones.join(', ')}`);

  await page.selectOption('#sort-select', 'name-asc');
  await page.waitForTimeout(300);
  const alfabetico = await page.evaluate(() =>
    [...document.querySelectorAll('.card__name')].map((node) => node.textContent.trim()));
  // Mismo comparador que usa la aplicación: con `numeric` "Bomba 5L" va antes
  // que "Bomba 16L", que es lo que espera quien busca en un mostrador, y no
  // lo que diría una comparación de cadenas a secas.
  const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  const desorden = alfabetico.findIndex((name, index) =>
    index > 0 && collator.compare(alfabetico[index - 1], name) > 0);
  check('Ordenar alfabéticamente funciona',
    alfabetico.length > 0 && desorden === -1,
    desorden === -1 ? `→ ${alfabetico.length} productos` : `→ "${alfabetico[desorden - 1]}" antes que "${alfabetico[desorden]}"`);
}

// --- Ficha de producto ----------------------------------------------------
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card');
await page.click('.card__link');
await page.waitForSelector('.detail__panel', { timeout: 5000 });

const detail = await page.evaluate(() => ({
  name: document.querySelector('.detail__name')?.textContent ?? '',
  code: document.querySelector('.detail__code')?.textContent ?? '',
  specs: document.querySelectorAll('.specs__row').length,
  prices: document.querySelectorAll('.detail__price').length,
  enquire: document.querySelectorAll('.detail__enquire').length,
  whatsapp: document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').length,
  related: document.querySelectorAll('.related__item').length,
  hash: location.hash
}));
check('La ficha abre con su propia URL', detail.hash.startsWith('#/producto/'), `→ ${detail.hash}`);
check('La ficha muestra la ficha técnica completa', detail.specs > 0, `→ ${detail.specs} filas`);
check('La ficha muestra productos relacionados', detail.related > 0, `→ ${detail.related}`);

if (MODE.showPrices) {
  check('La ficha muestra los dos precios', detail.prices === 2);
} else {
  // Lo importante no es solo que no se vea el precio: es que en su lugar quede
  // algo dicho. Una ficha con un hueco parece rota; "bajo consulta" es una
  // respuesta, y además devuelve la conversación al distribuidor.
  check('Sin precios, la ficha no muestra ninguna cifra', detail.prices === 0);
  check('Sin precios, la ficha remite a consultar', detail.enquire > 0);
}

// Regla del modo presentación, no una preferencia estética: el catálogo lo
// enseña un distribuidor a su propio cliente. Un enlace directo a Equipos Supra
// en esa pantalla es una invitación a saltarse a quien está haciendo la venta.
if (!MODE.showDirectContact) {
  check('La ficha no ofrece contacto directo con Equipos Supra', detail.whatsapp === 0,
    `→ ${detail.whatsapp} enlace(s)`);
}

// Regresión: la foto se anclaba al centro de una columna estirada a la altura
// de la ficha técnica y acababa media pantalla más abajo; y las
// especificaciones obligaban a desplazarse para llegar al precio y a los
// botones. Se comprueban las dos cosas en un portátil de 1366 × 768.
await page.setViewportSize({ width: 1366, height: 768 });
await page.goto(`${BASE}#/producto/PWP-3100GE`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.detail__panel', { timeout: 10000 });
await page.waitForTimeout(800);

const encuadre = await page.evaluate(() => {
  const content = document.querySelector('.detail__content').getBoundingClientRect();
  const image = document.querySelector('.detail__image').getBoundingClientRect();
  const actions = document.querySelector('.detail__actions').getBoundingClientRect();
  const specs = document.querySelector('.specs').getBoundingClientRect();
  return {
    fotoDesdeArriba: Math.round(image.top - content.top),
    fichaCompleta: specs.bottom <= content.bottom + 1,
    accionesVisibles: actions.bottom <= content.bottom + 1
  };
});
check('La foto arranca en la parte alta de la ficha', encuadre.fotoDesdeArriba < 60,
  `→ ${encuadre.fotoDesdeArriba} px desde el borde superior`);
check('La ficha técnica completa entra sin desplazarse', encuadre.fichaCompleta);
check('Los botones de acción entran sin desplazarse', encuadre.accionesVisibles);

await page.setViewportSize({ width: 1440, height: 960 });
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card');
await page.click('.card__link');
await page.waitForSelector('.detail__panel', { timeout: 5000 });

if (WANT_SHOTS) await page.screenshot({ path: 'tests/shot-detalle.png' });

await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Escape cierra la ficha', await page.locator('.detail__panel').count() === 0);

// --- Favoritos ------------------------------------------------------------
await page.locator('.card').first().locator('.card__fav').click();
await page.waitForTimeout(200);
const favCount = await page.textContent('#favorites-count');
check('Marcar favorito actualiza el contador', favCount === '1', `→ ${favCount}`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card');
check('Los favoritos sobreviven a la recarga', await page.textContent('#favorites-count') === '1');

// Regresión: al publicar una lista de precios nueva, los productos retirados
// desaparecen del catálogo pero sus códigos siguen guardados en el navegador.
// El contador decía "2 favoritos" con una sola tarjeta a la vista.
await page.evaluate(() => localStorage.setItem(
  'supra:favorites', JSON.stringify(['SPS-260', 'REFERENCIA-DESCATALOGADA'])));
await page.goto(`${BASE}#/favoritos`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card', { timeout: 30000 });
await page.waitForTimeout(600);
const favoritos = await page.evaluate(() => ({
  cabecera: document.querySelector('#favorites-count')?.textContent,
  lateral: [...document.querySelectorAll('#category-nav .sidebar__item')]
    .find((n) => n.dataset.category === '__favorites__')?.querySelector('.sidebar__count')?.textContent,
  tarjetas: document.querySelectorAll('.card').length
}));
check('Los favoritos descatalogados dejan de contarse',
  favoritos.cabecera === '1' && favoritos.lateral === '1' && favoritos.tarjetas === 1,
  `→ cabecera ${favoritos.cabecera}, lateral ${favoritos.lateral}, ${favoritos.tarjetas} tarjeta(s)`);

// Regresión: un enlace compartido a una referencia retirada devolvía al
// catálogo sin decir por qué.
await page.goto(`${BASE}#/producto/REFERENCIA-DESCATALOGADA`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card', { timeout: 30000 });
await page.waitForTimeout(700);
const enlaceRoto = await page.evaluate(() => ({
  hash: location.hash,
  aviso: document.querySelector('.toast')?.textContent ?? ''
}));
check('Un enlace a una referencia retirada avisa y vuelve al catálogo',
  enlaceRoto.hash === '#/' && /ya no está/i.test(enlaceRoto.aviso),
  `→ "${enlaceRoto.aviso.trim()}"`);

await page.evaluate(() => localStorage.setItem('supra:favorites', JSON.stringify(['SPS-260'])));

// --- Tema -----------------------------------------------------------------
await page.click('#theme-toggle');
await page.waitForTimeout(250);
const dark = await page.evaluate(() => ({
  attribute: document.documentElement.dataset.theme,
  background: getComputedStyle(document.body).backgroundColor,
  color: getComputedStyle(document.body).color
}));
check('El modo oscuro se aplica', dark.attribute === 'dark', `→ fondo ${dark.background}`);
check('El texto no queda sobre su propio color', dark.background !== dark.color);

if (WANT_SHOTS) await page.screenshot({ path: 'tests/shot-oscuro.png', fullPage: false });

await page.click('#theme-toggle');
await page.waitForTimeout(250);
if (WANT_SHOTS) await page.screenshot({ path: 'tests/shot-claro.png', fullPage: false });

// --- Responsive -----------------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const mobile = await page.evaluate(() => {
  const header = document.querySelector('.header').getBoundingClientRect();
  const toolbar = document.querySelector('.toolbar').getBoundingClientRect();
  return {
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    menuVisible: getComputedStyle(document.querySelector('#menu-toggle')).display !== 'none',
    searchWidth: document.querySelector('#search-input').getBoundingClientRect().width,
    stickyGap: Math.abs(toolbar.top - header.bottom)
  };
});
check('No hay desbordamiento horizontal en móvil', !mobile.overflow);

// Regresión: en una sola columna la fila de la fotografía se colapsaba y la
// bandeja se superponía al nombre y al precio del producto.
await page.goto(`${BASE}#/producto/PWP-3100GE`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.detail__panel', { timeout: 10000 });
await page.waitForTimeout(700);
const apilado = await page.evaluate(() => {
  const media = document.querySelector('.detail__media').getBoundingClientRect();
  const info = document.querySelector('.detail__info').getBoundingClientRect();
  const image = document.querySelector('.detail__image').getBoundingClientRect();
  return {
    solape: Math.round(media.bottom - info.top),
    desborde: Math.round(image.height - media.height)
  };
});
check('En móvil la foto y la ficha no se superponen', apilado.solape <= 1,
  `→ ${apilado.solape} px de solape`);
check('En móvil la foto cabe entera en su bandeja', apilado.desborde <= 1,
  `→ ${apilado.desborde} px de desborde`);
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card');
check('Aparece el botón de menú en móvil', mobile.menuVisible);
check('La búsqueda sigue siendo usable en móvil', mobile.searchWidth > 240,
  `→ ${Math.round(mobile.searchWidth)} px de ancho`);
check('La barra de herramientas queda pegada bajo la cabecera', mobile.stickyGap < 2,
  `→ ${mobile.stickyGap.toFixed(1)} px de desfase`);
if (WANT_SHOTS) await page.screenshot({ path: 'tests/shot-movil.png' });

// --- Contraste (WCAG 2.1 AA) ----------------------------------------------
console.log('\nAccesibilidad · contraste en ambos temas\n');
await page.setViewportSize({ width: 1440, height: 960 });

/**
 * Mide el contraste real de una muestra de elementos de texto, resolviendo el
 * fondo efectivo subiendo por el árbol hasta encontrar uno opaco.
 * @param {'light'|'dark'} theme
 */
async function auditContrast(theme) {
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  await page.waitForTimeout(200);

  return page.evaluate(() => {
    const luminance = ([r, g, b]) => {
      const channel = (value) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    // `getComputedStyle` puede devolver `rgb(...)` o, cuando el valor viene de
    // un color-mix, la forma moderna `color(srgb 0.96 0.95 0.94 / 0.92)`, con
    // los canales normalizados a 0-1. Hay que distinguirlas o el cálculo sale
    // completamente falseado.
    const channels = (color) => {
      const numbers = (color.match(/[\d.]+(?:e[+-]?\d+)?/gi) ?? []).map(Number);
      const values = color.startsWith('color(') ? numbers : numbers.slice(0, 3);
      const rgb = color.startsWith('color(')
        ? values.slice(0, 3).map((value) => value * 255)
        : values;
      return { rgb, alpha: color.startsWith('color(') ? (numbers[3] ?? 1) : (numbers[3] ?? 1) };
    };
    const parse = (color) => channels(color).rgb;
    const alpha = (color) => channels(color).alpha;

    const backgroundOf = (node) => {
      let current = node;
      while (current) {
        const background = getComputedStyle(current).backgroundColor;
        if (background && alpha(background) > 0.9) return parse(background);
        current = current.parentElement;
      }
      return [255, 255, 255];
    };

    const ratio = (a, b) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };

    const samples = [
      ['Nombre de producto', '.card__name'],
      ['Resumen de tarjeta', '.card__summary'],
      ['Precio', '.price__value'],
      ['Etiqueta de precio', '.price__label'],
      ['Precio bajo consulta', '.price__enquire'],
      ['Código de producto', '.card__code'],
      ['Categoría del lateral', '.sidebar__item'],
      ['Recuento del lateral', '.sidebar__count'],
      ['Título de sección', '.section-heading h2'],
      ['Buscador (texto)', '.search__input'],
      ['Recuento de la barra', '.toolbar__count'],
      ['Llamada a la ficha', '.card__cta']
    ];

    return samples.map(([label, selector]) => {
      const node = document.querySelector(selector);
      if (!node) return { label, ratio: null };
      const style = getComputedStyle(node);
      const size = Number.parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      return {
        label,
        ratio: ratio(parse(style.color), backgroundOf(node)),
        required: large ? 3 : 4.5
      };
    });
  });
}

for (const theme of ['light', 'dark']) {
  const results = await auditContrast(theme);
  const worst = results
    .filter((entry) => entry.ratio !== null)
    .sort((a, b) => (a.ratio - a.required) - (b.ratio - b.required))[0];
  const failing = results.filter((entry) => entry.ratio !== null && entry.ratio < entry.required);
  check(`Tema ${theme === 'light' ? 'claro' : 'oscuro'} · todo el texto cumple AA`,
    failing.length === 0,
    failing.length
      ? `→ ${failing.map((entry) => `${entry.label} ${entry.ratio.toFixed(2)}:1`).join(', ')}`
      : `→ el más justo: ${worst.label} ${worst.ratio.toFixed(2)}:1 (mínimo ${worst.required})`);
}

await page.evaluate(() => { delete document.documentElement.dataset.theme; });

// --- Sobrescrituras: disponibilidad y precios -----------------------------
console.log('\nSobrescrituras declarativas\n');

// Se intercepta `overrides.json` en vez de tocar el archivo del proyecto: la
// prueba no debe dejar rastro en el repositorio.
const contextoOverrides = await browser.newContext({ viewport: { width: 1440, height: 960 } });
await contextoOverrides.route('**/config/overrides.json', (route) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ products: {
    'SPS-260': { stock: 'agotado' },
    'SGE-210': { priceNet: 395000, priceGross: 469900 },
    'SPS-25C': { stock: 'valor-invalido' }
  } })
}));
const paginaOverrides = await contextoOverrides.newPage();
await paginaOverrides.goto(BASE, { waitUntil: 'domcontentloaded' });
await paginaOverrides.waitForSelector('.card', { timeout: 90000 });
await paginaOverrides.waitForTimeout(1200);

const sobrescrito = await paginaOverrides.evaluate(() => ({
  total: document.querySelectorAll('.card').length,
  agotadoSigueVisible: !!document.querySelector('[data-code="SPS-260"]'),
  distintivo: document.querySelector('[data-code="SPS-260"] .stock-badge')?.textContent,
  atenuada: getComputedStyle(document.querySelector('[data-code="SPS-260"] .card__image')).filter !== 'none',
  precio: document.querySelector('[data-code="SGE-210"] .price__value')?.textContent.replace(/[^\d]/g, ''),
  invalidoIgnorado: !document.querySelector('[data-code="SPS-25C"] .stock-badge')
}));

check('Una referencia agotada NO desaparece del catálogo',
  sobrescrito.total === 80 && sobrescrito.agotadoSigueVisible, `→ ${sobrescrito.total} productos`);
check('La referencia agotada se distingue', sobrescrito.distintivo === 'Agotado' && sobrescrito.atenuada,
  `→ "${sobrescrito.distintivo}"`);
check('Un estado de stock inválido se ignora sin romper nada', sobrescrito.invalidoIgnorado);

if (MODE.showPrices) {
  check('Un precio corregido a mano pisa al del PDF', sobrescrito.precio === '469900',
    `→ ${sobrescrito.precio} (el PDF dice 479900)`);
} else {
  // La sobrescritura de precio sigue siendo válida en el archivo; simplemente
  // no tiene dónde verse. Lo que sí debe comprobarse es que no se cuele.
  check('Un precio sobrescrito tampoco se muestra', sobrescrito.precio === undefined);
}

const fichaAgotado = await paginaOverrides.evaluate(async () => {
  location.hash = '#/producto/SPS-260';
  await new Promise((r) => setTimeout(r, 900));
  const enlace = document.querySelector('.detail__actions a[href*="wa.me"]');
  return {
    aviso: !!document.querySelector('.detail__note--danger'),
    whatsapp: enlace ? decodeURIComponent(new URL(enlace.href).searchParams.get('text') ?? '') : ''
  };
});

check('La ficha del agotado avisa de la falta de existencias', fichaAgotado.aviso);

if (MODE.showDirectContact) {
  check('El mensaje de WhatsApp se adapta al agotado',
    /cu[áa]ndo tendr[áa]n/i.test(fichaAgotado.whatsapp),
    `→ "${fichaAgotado.whatsapp.slice(0, 46)}…"`);
} else {
  check('El agotado tampoco abre una vía directa a Equipos Supra',
    fichaAgotado.whatsapp === '');
}

await contextoOverrides.close();

// --- Lo que NO debe publicarse --------------------------------------------
// Estas dos comprobaciones son la razón de ser del modo presentación. Si
// alguna se pone en rojo, el catálogo no se sube: la primera significaría que
// la lista de precios completa está a un clic desde el mismo sitio, y la
// segunda, que el distribuidor está enseñando a su cliente el teléfono del
// proveedor.
if (MODE.source === 'baked') {
  console.log('\nFiltraciones\n');

  // El PDF sí está en el disco (de ahí sale el catálogo), pero no debe llegar
  // al repositorio: lo que se publica es lo que Git rastrea. Por eso esto se
  // comprueba contra Git y no contra el servidor de pruebas.
  const rastreados = await new Promise((resolve) => {
    exec('git ls-files data/', { cwd: ROOT }, (error, stdout) =>
      resolve(error ? null : stdout.split('\n').filter(Boolean)));
  });
  if (rastreados === null) {
    skip('La lista de precios en PDF no se publica', 'no hay repositorio Git aquí');
  } else {
    const pdfs = rastreados.filter((file) => file.toLowerCase().endsWith('.pdf'));
    check('La lista de precios en PDF no se publica', pdfs.length === 0,
      pdfs.length ? `→ Git rastrea ${pdfs.join(', ')}` : '');
  }

  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card', { timeout: 30000 });
  await page.waitForTimeout(400);

  const rastro = await page.evaluate(() => {
    const texto = document.body.innerText;
    const enlaces = [...document.querySelectorAll('a[href]')].map((a) => a.href).join(' ');
    return {
      telefono: /3\s?18\s?082\s?5116|\+?57\s?3\d{2}[\s-]?\d{3}[\s-]?\d{4}/.test(`${texto} ${enlaces}`),
      whatsapp: /wa\.me|whatsapp/i.test(enlaces),
      cifras: document.querySelectorAll('.price__value').length
    };
  });
  check('No aparece ningún teléfono de Equipos Supra', rastro.telefono === false);
  check('No aparece ningún enlace de WhatsApp', rastro.whatsapp === false);
  check('No se pinta ningún precio en la cuadrícula', rastro.cifras === 0);
}

// --- Consola --------------------------------------------------------------
// Se ignoran los fallos de red hacia hosts externos: el catálogo funciona sin
// Google Fonts (hay pila de reserva declarada) y el entorno de CI no sale fuera.
const realErrors = consoleErrors.filter((text) =>
  !/favicon|apple-touch/i.test(text) && !/ERR_(TUNNEL|NAME|INTERNET|CONNECTION)/i.test(text));
check('La consola no registra errores', realErrors.length === 0,
  realErrors.length ? `→ ${realErrors[0].slice(0, 120)}` : '');

await browser.close();
server.close();

console.log(failures === 0
  ? '\n[32mTodo correcto.[0m\n'
  : `\n[31m${failures} comprobación(es) fallida(s).[0m\n`);
process.exit(failures === 0 ? 0 : 1);
