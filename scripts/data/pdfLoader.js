/**
 * Orquesta la lectura del PDF con PDF.js: huella del archivo, apertura del
 * documento y recorrido de páginas emitiendo progreso real.
 *
 * Es la ÚNICA pieza del proyecto que conoce PDF.js. Si mañana el catálogo se
 * alimentara de una API, solo habría que sustituir este módulo.
 *
 * @module data/pdfLoader
 */

import { APP_CONFIG } from '../../config/app.config.js';
import { PARSER_CONFIG } from '../../config/parser.config.js';
import { extractLines, measureBodyFontSize } from './textExtractor.js';
import { extractPageImages } from './imageExtractor.js';
import { parsePage } from './productParser.js';

/** @type {Promise<typeof import('pdfjs-dist')>|null} */
let pdfjsPromise = null;

/**
 * Carga PDF.js bajo demanda. Son 1.7 MB que no tiene sentido descargar cuando
 * la caché ya tiene el catálogo, así que el import es dinámico.
 * @returns {Promise<*>}
 */
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../../vendor/pdfjs/pdf.min.mjs').then((module) => {
      module.GlobalWorkerOptions.workerSrc = new URL(
        `../../${APP_CONFIG.pdfWorkerUrl}`, import.meta.url
      ).href;
      return module;
    });
  }
  return pdfjsPromise;
}

/**
 * Huella del PDF publicado, obtenida con una petición `HEAD` de milisegundos.
 * Es lo que permite decidir si hay que reparsear sin descargar el archivo.
 *
 * @param {string} url
 * @returns {Promise<string>} huella, o `'desconocida'` si el servidor no informa
 */
export async function fingerprintPdf(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (!response.ok) return 'desconocida';
    const size = response.headers.get('content-length') ?? '?';
    const modified = response.headers.get('last-modified') ?? response.headers.get('etag') ?? '?';
    return `${size}|${modified}`;
  } catch {
    return 'desconocida';
  }
}

/**
 * @typedef {object} ParsedCatalog
 * @property {import('./productParser.js').RawProduct[]} products
 * @property {Map<string, Blob>} images  Blob por `imageId`
 * @property {string[]} warnings         Diagnóstico de filas no reconocidas
 * @property {object} meta               Metadatos del documento fuente
 */

/**
 * Lee el PDF completo y devuelve el catálogo crudo.
 *
 * El recorrido es en dos pasadas por una razón concreta: el cuerpo de letra de
 * referencia debe medirse sobre el documento entero, no página a página, porque
 * alguna página compone el nombre del producto al mismo tamaño que la ficha.
 *
 * @param {string} url
 * @param {(progress: {phase: string, done: number, total: number}) => void} [onProgress]
 * @returns {Promise<ParsedCatalog>}
 */
export async function parsePdf(url, onProgress = () => {}) {
  const pdfjs = await loadPdfjs();
  onProgress({ phase: 'Abriendo la lista de precios', done: 0, total: 1 });

  const document_ = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
  const { leading, trailing } = PARSER_CONFIG.skipPages;
  const firstPage = leading + 1;
  const lastPage = Math.max(firstPage, document_.numPages - trailing);
  const total = lastPage - firstPage + 1;

  // Pasada 1 · texto de todas las páginas y medición del cuerpo de referencia.
  const pages = [];
  for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) {
    const page = await document_.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    pages.push({ pageNumber, lines: extractLines(textContent, viewport.height) });
    page.cleanup();
    onProgress({ phase: 'Leyendo el texto', done: pageNumber - leading, total });
  }
  const bodySize = measureBodyFontSize(pages.flatMap((page) => page.lines));

  // Pasada 2 · imágenes y segmentación con la escala ya fijada.
  const context = { category: null };
  const products = [];
  const warnings = [];
  const images = new Map();

  for (const { pageNumber, lines } of pages) {
    for (const line of lines) {
      line.sizeRatio = bodySize > 0 ? Math.round((line.size / bodySize) * 10) / 10 : 1;
    }

    const page = await document_.getPage(pageNumber);
    const regions = await extractPageImages(page, pageNumber);
    page.cleanup();

    for (const region of regions) images.set(region.id, region.blob);
    const result = parsePage(lines, regions, pageNumber, context);
    products.push(...result.products);
    warnings.push(...result.warnings);

    onProgress({ phase: 'Extrayendo imágenes', done: pageNumber - leading, total });
  }

  const metadata = await document_.getMetadata().catch(() => null);
  await document_.destroy();

  return {
    products,
    images,
    warnings,
    meta: {
      pages: document_.numPages,
      title: metadata?.info?.Title ?? '',
      subject: metadata?.info?.Subject ?? '',
      createdAt: metadata?.info?.CreationDate ?? '',
      bodySize
    }
  };
}
