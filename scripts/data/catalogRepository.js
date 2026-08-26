/**
 * Fachada de datos del catálogo. Es la única puerta que la interfaz usa para
 * pedir productos: decide si sirve la caché o reparsea el PDF, aplica las
 * sobrescrituras declarativas y expone consultas ya resueltas.
 *
 * @module data/catalogRepository
 */

import { APP_CONFIG, MODE } from '../../config/app.config.js';
import { BRANDS, STOCK_STATES, DEFAULT_STOCK } from '../../config/taxonomy.config.js';
import { normalize, slugify } from '../core/text.js';
import { enrichProduct } from './productParser.js';
import { fingerprintPdf, parsePdf } from './pdfLoader.js';
import { readValidMeta, readCatalog, readImage, writeCatalog, clearCache } from './cacheService.js';

/** @type {{products: object[], categories: object[], brands: object[], warnings: string[], meta: object}|null} */
let catalog = null;

/** URLs de objeto vivas, para poder revocarlas y no filtrar memoria. */
const objectUrls = new Map();

/**
 * Carga el catálogo: caché si es válida, PDF si no.
 *
 * @param {(progress: {phase: string, done: number, total: number}) => void} [onProgress]
 * @returns {Promise<object>} el catálogo completo
 */
export async function load(onProgress = () => {}) {
  if (catalog) return catalog;

  // Modo presentación: los datos vienen ya horneados por `npm run generar`.
  // Ni se descarga el PDF ni se carga PDF.js, así que el arranque es inmediato
  // y —lo que de verdad importa— la lista de precios no está publicada.
  if (MODE.source === 'baked') {
    const baked = await loadBaked(onProgress);
    if (baked) return baked;
    console.warn('[catálogo] no encuentro el catálogo generado; leo el PDF directamente. '
      + 'Ejecuta `npm run generar` antes de publicar.');
  }

  onProgress({ phase: 'Comprobando la lista de precios', done: 0, total: 1 });
  const fingerprint = await fingerprintPdf(APP_CONFIG.pdfUrl);
  const meta = await readValidMeta(fingerprint);

  if (meta) {
    const cached = await readCatalog();
    if (cached?.products?.length) {
      catalog = { ...cached, meta: { ...cached.meta, fromCache: true, builtAt: meta.builtAt } };
      onProgress({ phase: 'Catálogo listo', done: 1, total: 1 });
      return catalog;
    }
  }

  const parsed = await parsePdf(APP_CONFIG.pdfUrl, onProgress);
  onProgress({ phase: 'Organizando el catálogo', done: 1, total: 1 });

  const overrides = await loadOverrides();
  const products = parsed.products
    .map(enrichProduct)
    .map((product) => applyOverride(product, overrides[product.code]))
    .filter((product) => product.hidden !== true);

  // La imagen se reindexa por código de producto: es la clave estable frente a
  // un PDF nuevo, mientras que el identificador de región depende del maquetado.
  const images = new Map();
  for (const product of products) {
    const blob = product.imageId ? parsed.images.get(product.imageId) : null;
    if (blob) images.set(product.code, blob);
  }

  catalog = {
    products,
    categories: buildCategories(products),
    brands: buildBrands(products),
    warnings: parsed.warnings,
    meta: { ...parsed.meta, fingerprint, builtAt: Date.now(), fromCache: false }
  };

  await writeCatalog(
    { products, categories: catalog.categories, brands: catalog.brands, warnings: catalog.warnings, meta: catalog.meta },
    images,
    {
      fingerprint,
      schemaVersion: APP_CONFIG.cache.schemaVersion,
      builtAt: Date.now(),
      productCount: products.length
    }
  );

  return catalog;
}

/**
 * Carga el catálogo horneado. Devuelve `null` si todavía no se ha generado, en
 * cuyo caso se cae a leer el PDF: así el proyecto sigue siendo utilizable en
 * local aunque falte el paso de generación.
 *
 * @param {(progress: {phase: string, done: number, total: number}) => void} onProgress
 * @returns {Promise<object|null>}
 */
async function loadBaked(onProgress) {
  try {
    onProgress({ phase: 'Cargando el catálogo', done: 0, total: 1 });
    const response = await fetch(APP_CONFIG.bakedUrl, { cache: 'no-cache' });
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data?.productos) || data.productos.length === 0) return null;

    const overrides = await loadOverrides();
    const products = data.productos
      .map((product) => applyOverride(product, overrides[product.code]))
      .filter((product) => product.hidden !== true);

    catalog = {
      products,
      categories: buildCategories(products),
      brands: buildBrands(products),
      warnings: data.avisos ?? [],
      meta: { ...data.origen, builtAt: Date.parse(data.generado) || Date.now(), baked: true }
    };

    onProgress({ phase: 'Catálogo listo', done: 1, total: 1 });
    return catalog;
  } catch (error) {
    console.warn('[catálogo] no se pudo leer el catálogo generado', error);
    return null;
  }
}

/**
 * Devuelve el catálogo ya cargado.
 * @returns {object|null}
 */
export function getCatalog() {
  return catalog;
}

/**
 * Busca un producto por su código.
 * @param {string} code
 * @returns {object|undefined}
 */
export function findByCode(code) {
  return catalog?.products.find((product) => product.code === code);
}

/**
 * Productos que conviene enseñar junto a este.
 *
 * Primero los de su misma categoría: es lo que un vendedor de mostrador
 * necesita cuando el cliente pide "algo parecido pero más económico". Si hay
 * precios, se ordenan por cercanía de precio; si no —modo presentación—, se
 * respeta el orden del catálogo, que ya agrupa por familia.
 *
 * Cinco referencias son las únicas de su categoría (la ahoyadora, la sopladora,
 * la motoazada…). Para esas se completa con productos de la misma línea de
 * producto: una ficha que termina en un hueco parece un catálogo incompleto.
 *
 * @param {object} product
 * @param {number} [limit]
 * @returns {object[]}
 */
export function findRelated(product, limit = APP_CONFIG.ui.relatedProductsCount) {
  if (!catalog) return [];

  const reference = product.priceGross ?? product.priceNet ?? null;
  const byPrice = (a, b) => {
    const distance = (item) => Math.abs((item.priceGross ?? item.priceNet ?? 0) - reference);
    return distance(a) - distance(b);
  };

  const others = catalog.products.filter((other) => other.code !== product.code);
  const sameCategory = others.filter((other) => other.categoryId === product.categoryId);
  if (reference !== null) sameCategory.sort(byPrice);

  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);

  // El relleno toma UNA referencia por categoría en vez de las cuatro primeras
  // que encuentre. Puestas junto a una ahoyadora, cuatro bombas de fumigación
  // seguidas parecen un error; cuatro familias distintas se leen como una
  // invitación a seguir mirando, que es justo lo que hace falta ahí.
  const yaElegidos = new Set(sameCategory.map((item) => item.code));
  const categoriasVistas = new Set([product.categoryId]);
  const relleno = [];
  for (const other of others) {
    if (yaElegidos.has(other.code)) continue;
    if (other.brandId !== product.brandId) continue;
    if (categoriasVistas.has(other.categoryId)) continue;
    categoriasVistas.add(other.categoryId);
    relleno.push(other);
    if (sameCategory.length + relleno.length >= limit) break;
  }

  return [...sameCategory, ...relleno].slice(0, limit);
}

/**
 * URL de la imagen de un producto, priorizando la versión en alta resolución
 * si existe en `assets/products/`. Devuelve `null` si no hay ninguna.
 *
 * @param {string} code
 * @returns {Promise<string|null>}
 */
export async function getImageUrl(code) {
  if (objectUrls.has(code)) return objectUrls.get(code);

  const manifest = await loadHdManifest();
  if (manifest.has(code)) {
    const hdUrl = `${APP_CONFIG.hdImageDir}${manifest.get(code)}`;
    objectUrls.set(code, hdUrl);
    return hdUrl;
  }

  if (MODE.source === 'baked') return null;   // sin manifiesto no hay imagen

  const blob = await readImage(code);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(code, url);
  return url;
}

/** Revoca todas las URLs de objeto creadas. */
export function releaseImageUrls() {
  for (const url of objectUrls.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  objectUrls.clear();
}

/**
 * Fuerza una relectura completa del PDF en la próxima carga.
 * @returns {Promise<void>}
 */
export async function invalidate() {
  releaseImageUrls();
  catalog = null;
  await clearCache();
}

/* ------------------------- construcción de índices ------------------------ */

/**
 * @param {object[]} products
 * @returns {{id: string, name: string, icon: string, count: number}[]}
 */
function buildCategories(products) {
  const map = new Map();
  for (const product of products) {
    const entry = map.get(product.categoryId) ?? {
      id: product.categoryId,
      name: product.category,
      icon: product.categoryIcon,
      count: 0
    };
    entry.count += 1;
    map.set(product.categoryId, entry);
  }
  return [...map.values()];
}

/**
 * @param {object[]} products
 * @returns {{id: string, name: string, color: string, tier: string, count: number}[]}
 */
function buildBrands(products) {
  return BRANDS
    .map((brand) => ({
      id: brand.id,
      name: brand.name,
      color: brand.color,
      tier: brand.tier,
      count: products.filter((product) => product.brandId === brand.id).length
    }))
    .filter((brand) => brand.count > 0);
}

/* --------------------------- sobrescrituras ------------------------------ */

/**
 * Lee `config/overrides.json`, que permite corregir o enriquecer productos por
 * código sin tocar el parser. Si el archivo no existe, no pasa nada.
 * @returns {Promise<Record<string, object>>}
 */
async function loadOverrides() {
  try {
    const response = await fetch(APP_CONFIG.overridesUrl, { cache: 'no-cache' });
    if (!response.ok) return {};
    const data = await response.json();
    return data?.products ?? {};
  } catch {
    return {};
  }
}

/**
 * Aplica una sobrescritura a un producto. Los campos ausentes no se tocan y las
 * especificaciones extra se añaden sin borrar las del PDF.
 *
 * @param {object} product
 * @param {object} [override]
 * @returns {object}
 */
function applyOverride(product, override) {
  if (!override) return product;

  const merged = { ...product };
  if (override.name) merged.name = override.name;
  if (override.category) {
    merged.category = override.category;
    merged.categoryId = slugify(override.category);
  }
  if (override.brandId) merged.brandId = override.brandId;
  if (override.summary) merged.summary = override.summary;
  if (override.hidden === true) merged.hidden = true;

  // Disponibilidad. Un estado desconocido se ignora en vez de romper la ficha:
  // un error de tecleo en el archivo de sobrescrituras no debe tumbar nada.
  if (typeof override.stock === 'string') {
    const stock = override.stock.trim().toLowerCase();
    if (Object.hasOwn(STOCK_STATES, stock)) merged.stock = stock;
    else console.warn(`[overrides] estado de stock desconocido en ${product.code}: "${override.stock}"`);
  }

  // Precios corregidos a mano, para no tener que esperar a la lista siguiente.
  // Se marca la corrección: queda registrada en las exportaciones, de modo que
  // siempre se puede saber qué precio viene del PDF y cuál se ajustó aquí.
  for (const field of ['priceNet', 'priceGross']) {
    const value = override[field];
    if (value === undefined || value === null) continue;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      console.warn(`[overrides] ${field} inválido en ${product.code}: "${value}"`);
      continue;
    }
    merged.priceFromPdf = { ...(merged.priceFromPdf ?? {}), [field]: product[field] };
    merged[field] = Math.round(amount);
  }
  if (Array.isArray(override.notes)) merged.notes = [...merged.notes, ...override.notes];
  if (Array.isArray(override.details)) merged.details = [...(merged.details ?? []), ...override.details];
  if (override.specs && typeof override.specs === 'object') {
    const specs = [...merged.specs];
    for (const [key, value] of Object.entries(override.specs)) {
      const index = specs.findIndex((spec) => normalize(spec.key) === normalize(key));
      if (index >= 0) specs[index] = { key, value };
      else specs.push({ key, value });
    }
    merged.specs = specs;
  }
  merged.searchText = normalize(`${merged.searchText} ${override.keywords ?? ''}`);
  return merged;
}

/* ----------------------- imágenes en alta resolución ---------------------- */

/**
 * Se memoriza la PROMESA, no el mapa ya resuelto.
 *
 * Las ochenta tarjetas piden su imagen a la vez, en el mismo tick. Si se
 * guardara el mapa vacío antes del `await`, las setenta y nueve llamadas
 * siguientes lo encontrarían "listo" y todavía sin datos: se quedarían sin
 * fotografía para siempre. Guardando la promesa, todas esperan a la misma
 * petición y todas ven el manifiesto completo.
 *
 * @type {Promise<Map<string, string>>|null}
 */
let hdManifest = null;

/**
 * Índice de fotografías en alta resolución.
 *
 * Se resuelve con un único `fetch` a `assets/products/manifest.json` en lugar
 * de comprobar la existencia de ochenta archivos uno a uno. Si el manifiesto no
 * existe, el catálogo usa las imágenes del PDF y no se hace ni una petición de
 * más: la mejora es puramente aditiva.
 *
 * Formato: `{ "SPS-260": "SPS-260.webp", "SGE-210": "SGE-210.jpg" }`
 * o, en su forma corta, `{ "codes": ["SPS-260", "SGE-210"] }`.
 *
 * @returns {Promise<Map<string, string>>}
 */
function loadHdManifest() {
  hdManifest ??= (async () => {
    const index = new Map();
    try {
      const response = await fetch(`${APP_CONFIG.hdImageDir}manifest.json`, { cache: 'no-cache' });
      if (!response.ok) return index;
      const data = await response.json();
      if (Array.isArray(data?.codes)) {
        for (const code of data.codes) index.set(code, `${code}${APP_CONFIG.hdImageExt}`);
      } else if (data && typeof data === 'object') {
        for (const [code, file] of Object.entries(data)) {
          // Las claves que empiezan por guion bajo son documentación del propio
          // archivo, no códigos de producto.
          if (code.startsWith('_') || typeof file !== 'string') continue;
          index.set(code, file);
        }
      }
    } catch {
      // Sin manifiesto se usan las imágenes extraídas del PDF.
    }
    return index;
  })();
  return hdManifest;
}
