/**
 * Convierte las líneas clasificadas de una página en productos del dominio.
 *
 * Módulo PURO y determinista: entra un array de `TextLine` (más las regiones de
 * imagen detectadas) y sale un array de productos. No conoce PDF.js, ni el DOM,
 * ni la caché. Toda la suite de pruebas se apoya en esta propiedad.
 *
 * Segmentación de un bloque de producto
 * -------------------------------------
 * En la mayoría de páginas el nombre comercial va en un cuerpo mayor que la
 * ficha técnica y basta con el tamaño para separar bloques. Pero no en todas:
 * alguna página compone el nombre al mismo tamaño que la ficha. Por eso la
 * segmentación combina tres señales, en este orden:
 *
 *   1. Cuerpo de letra mayor que el de la ficha técnica.
 *   2. Línea acabada en dos puntos sin valor detrás (cierre de titular).
 *   3. Predominio de caja alta, que separa "MOTOSIERRA:" (nombre de producto)
 *      de "Caudal:" (clave de ficha técnica que se quedó sin valor).
 *
 * Las líneas candidatas se acumulan sin confirmar y vuelven al cuerpo del
 * bloque anterior en cuanto llega una línea de ficha técnica, de modo que un
 * renglón suelto como "Color gris" nunca abre un producto fantasma.
 *
 * Con las fronteras verticales de cada bloque ya resueltas, el código, los dos
 * precios y la imagen se asignan por la banda vertical en la que caen.
 *
 * @module data/productParser
 */

import { PARSER_CONFIG } from '../../config/parser.config.js';
import {
  BRANDS, DEFAULT_BRAND_ID, CATEGORY_ICONS, DEFAULT_CATEGORY_ICON,
  SPEC_KEY_FIXES, HIGHLIGHT_SPEC_KEYS, WORD_FIXES
} from '../../config/taxonomy.config.js';
import { collapse, normalize, parseCurrency, sentenceCase, slugify } from '../core/text.js';

/**
 * @typedef {object} ImageRegion
 * @property {number} top     Borde superior en puntos PDF desde arriba
 * @property {number} bottom  Borde inferior en puntos PDF desde arriba
 * @property {number} left
 * @property {number} right
 * @property {string} id      Identificador estable de la región
 */

/**
 * @typedef {object} ParseContext
 * @property {string|null} category  Categoría heredada de la página anterior
 */

/**
 * @typedef {object} RawProduct
 * @property {string|null} code
 * @property {string} name
 * @property {string} category
 * @property {{key: string, value: string}[]} specs
 * @property {string[]} notes
 * @property {number|null} priceNet
 * @property {number|null} priceGross
 * @property {number} page
 * @property {string|null} imageId
 */

/**
 * Parsea una página completa.
 *
 * @param {import('./textExtractor.js').TextLine[]} lines
 * @param {ImageRegion[]} imageRegions
 * @param {number} pageNumber
 * @param {ParseContext} context Se muta: `category` queda lista para la página siguiente
 * @returns {{ products: RawProduct[], warnings: string[] }}
 */
export function parsePage(lines, imageRegions, pageNumber, context) {
  const warnings = [];

  // La fila de encabezado ("Item No. · Imagen · Descripción · P.V.D…") se
  // elimina por bandas completas: sus celdas comparten línea base, así que
  // basta con localizar la celda "Item No." y descartar toda su banda.
  const headerTops = lines
    .filter((line) => line.column === 'code' && PARSER_CONFIG.tableHeaderMarker.test(line.text))
    .map((line) => line.top);

  const clean = lines.filter((line) => !isNoise(line.text) && !isNearAny(line.top, headerTops));
  const blocks = segmentBlocks(clean.filter((line) => line.column === 'description'), context);
  const products = [];

  blocks.forEach((block, index) => {
    const bandTop = block.top - 2;
    const bandBottom = index + 1 < blocks.length ? blocks[index + 1].top - 2 : Number.POSITIVE_INFINITY;
    const inBand = (top) => top >= bandTop && top < bandBottom;
    const cell = (column, separator) => clean
      .filter((line) => line.column === column && inBand(line.top))
      .map((line) => line.text)
      .join(separator);

    // El código puede partirse en dos renglones dentro de su celda
    // ("SWP-" + "F20/20AH"); se reconstruye concatenando la celda completa.
    const rawCode = cell('code', '');
    const image = imageRegions.find((region) => inBand((region.top + region.bottom) / 2));
    const { specs, notes } = splitBody(block.body);

    const product = {
      code: isCode(rawCode) ? cleanCode(rawCode) : null,
      name: cleanName(block.nameParts.join(' ')),
      category: block.category ?? 'Sin categoría',
      specs,
      notes,
      priceNet: firstPrice(cell('priceNet', ' ')),
      priceGross: firstPrice(cell('priceGross', ' ')),
      page: pageNumber,
      imageId: image ? image.id : null
    };

    // Un bloque sin código, sin precio y sin ficha técnica no es un producto:
    // es una aclaración suelta que pertenece al producto anterior.
    const isOrphanNote = !product.code && product.priceNet === null
      && product.priceGross === null && specs.length === 0;
    if (isOrphanNote) {
      const previous = products[products.length - 1];
      if (previous && product.name) previous.notes.push(product.name);
      return;
    }

    if (!product.code) warnings.push(`p.${pageNumber} · "${product.name}" sin código`);
    if (product.priceGross === null && product.priceNet === null) {
      warnings.push(`p.${pageNumber} · "${product.name}" sin precio`);
    }
    if (!product.imageId) warnings.push(`p.${pageNumber} · "${product.name}" sin imagen`);

    products.push(product);
  });

  return { products, warnings };
}

/**
 * ¿Está `top` en la misma banda que alguna de las referencias?
 * @param {number} top
 * @param {number[]} references
 * @returns {boolean}
 */
function isNearAny(top, references) {
  return references.some((reference) => Math.abs(reference - top) <= PARSER_CONFIG.lineToleranceY);
}

/**
 * Divide las líneas de descripción en bloques de producto, actualizando la
 * categoría vigente cuando aparece un titular de sección.
 *
 * @param {import('./textExtractor.js').TextLine[]} lines
 * @param {ParseContext} context
 * @returns {{ top: number, nameParts: string[], body: string[], category: string|null }[]}
 */
function segmentBlocks(lines, context) {
  const { productName, categoryHeading } = PARSER_CONFIG.fontRatio;
  const blocks = [];

  /** Bloque en construcción. */
  let current = null;
  /** Líneas candidatas a titular, aún sin confirmar. @type {{text:string,top:number,big:boolean}[]} */
  let pending = [];

  /** Devuelve las líneas pendientes al cuerpo del bloque en curso. */
  const dropPending = (items = pending) => {
    if (current) current.body.push(...items.map((item) => item.text));
    if (items === pending) pending = [];
  };

  for (const line of lines) {
    if (line.sizeRatio >= categoryHeading) {
      dropPending();
      context.category = cleanCategory(line.text);
      current = null;                       // una sección nueva corta el bloque en curso
      continue;
    }

    const big = line.sizeRatio >= productName;
    const isNote = PARSER_CONFIG.notePattern.test(line.text);
    const isSpec = !isNote && PARSER_CONFIG.specPattern.test(line.text);

    // Una línea de ficha técnica confirma que lo pendiente era cuerpo, no título.
    if (isSpec || isNote) {
      dropPending();
      if (current) current.body.push(line.text);
      continue;
    }

    pending.push({ text: line.text, top: line.top, big });

    // Un titular se cierra al llegar a una línea acabada en dos puntos o, en las
    // páginas que sí diferencian cuerpos, al aparecer la primera línea grande.
    // La caja alta es el desempate: descarta claves de ficha sin valor
    // ("Caudal:") sin descartar nombres de una sola palabra ("MOTOSIERRA:").
    const closesTitle = big
      || (TITLE_END.test(line.text) && isUppercaseDominant(pending.map((item) => item.text).join(' ')));
    if (!closesTitle) {
      if (pending.length > MAX_TITLE_LINES) dropPending([pending.shift()]);
      continue;
    }

    // En las páginas con dos cuerpos de letra, lo anterior a la primera línea
    // grande nunca forma parte del titular (típicamente "Color gris").
    const firstBig = pending.findIndex((item) => item.big);
    if (firstBig > 0) dropPending(pending.splice(0, firstBig));

    const continuesTitle = current && current.body.length === 0 && current.nameParts.length > 0;
    if (continuesTitle) {
      current.nameParts.push(...pending.map((item) => item.text));
    } else {
      current = {
        top: pending[0].top,
        nameParts: pending.map((item) => item.text),
        body: [],
        category: context.category
      };
      blocks.push(current);
    }
    pending = [];
  }

  dropPending();
  return blocks;
}

/** Un titular termina en dos puntos, con o sin punto final. */
const TITLE_END = /:+\s*\.?\s*$/;

/** Una clave de ficha técnica que quedó sin valor detrás de los dos puntos. */
const EMPTY_SPEC = /^[^:]{2,60}:+\s*\.?\s*$/;

/**
 * ¿Predomina la caja alta en el texto? Ignora dígitos, signos y unidades.
 * @param {string} text
 * @returns {boolean}
 */
function isUppercaseDominant(text) {
  const letters = String(text).replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
  return upper / letters.length >= PARSER_CONFIG.titleUppercaseRatio;
}

/** Máximo de renglones que puede ocupar un titular antes de descartarlo. */
const MAX_TITLE_LINES = 3;

/**
 * Separa el cuerpo del bloque en pares clave/valor y notas libres.
 * @param {string[]} bodyLines
 * @returns {{ specs: {key: string, value: string}[], notes: string[] }}
 */
function splitBody(bodyLines) {
  const specs = [];
  const notes = [];

  for (const raw of bodyLines) {
    const line = collapse(raw).replace(/^[-•·]\s*/, '');
    if (!line) continue;
    if (PARSER_CONFIG.notePattern.test(line)) {
      notes.push(sentenceCase(line.replace(PARSER_CONFIG.notePattern, '')));
      continue;
    }
    // Clave de ficha técnica que se quedó sin valor en el PDF ("Caudal:").
    // No aporta nada y, si se dejaba pasar, terminaba mostrándose como un
    // aviso comercial vacío en la ficha del producto.
    if (EMPTY_SPEC.test(line)) continue;

    const match = line.match(PARSER_CONFIG.specPattern);
    if (match) {
      const key = normalizeSpecKey(match[1]);
      const value = collapse(match[2]).replace(/^\.\s*/, '').replace(/\.$/, '');
      if (key && value) { specs.push({ key, value }); continue; }
    }
    notes.push(sentenceCase(line));
  }

  return { specs, notes };
}

/**
 * Normaliza la clave de una especificación aplicando el diccionario de
 * correcciones del PDF original.
 * @param {string} raw
 * @returns {string}
 */
function normalizeSpecKey(raw) {
  const key = collapse(raw).replace(/[.:]+$/, '');
  const fixed = SPEC_KEY_FIXES[normalize(key)];
  if (fixed) return fixed;
  return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
}

/**
 * Limpia el nombre comercial: quita los dos puntos finales y normaliza mayúsculas.
 * @param {string} raw
 * @returns {string}
 */
function cleanName(raw) {
  return applyWordFixes(sentenceCase(collapse(raw).replace(/[:\s.]+$/, '')));
}

/**
 * Restituye las tildes que el PDF original perdió, palabra a palabra.
 * @param {string} value
 * @returns {string}
 */
function applyWordFixes(value) {
  return value.replace(/\p{L}+/gu, (word) => {
    const fixed = WORD_FIXES[normalize(word)];
    if (!fixed) return word;
    return word[0] === word[0].toUpperCase()
      ? fixed[0].toUpperCase() + fixed.slice(1)
      : fixed;
  });
}

/**
 * Limpia el titular de una categoría.
 * @param {string} raw
 * @returns {string}
 */
function cleanCategory(raw) {
  return applyWordFixes(sentenceCase(collapse(raw).replace(/[.:\s]+$/, '')));
}

/**
 * Limpia un código de producto.
 * @param {string} raw
 * @returns {string}
 */
function cleanCode(raw) {
  return collapse(raw).replace(/[.,;]+$/, '').toUpperCase();
}

/**
 * Extrae el primer importe de una celda de precio. Se busca el patrón en vez de
 * limpiar dígitos para que una banda con dos importes no acabe fusionándolos.
 * @param {string} text
 * @returns {number|null}
 */
function firstPrice(text) {
  const match = String(text ?? '').match(PARSER_CONFIG.pricePattern);
  return match ? parseCurrency(match[1]) : null;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isCode(text) {
  const candidate = cleanCode(text);
  return PARSER_CONFIG.codePattern.test(candidate) && !PARSER_CONFIG.tableHeaderMarker.test(candidate);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isNoise(text) {
  const value = collapse(text);
  if (!value) return true;
  if (PARSER_CONFIG.tableHeaderMarker.test(value)) return true;
  return PARSER_CONFIG.noisePatterns.some((pattern) => pattern.test(value));
}

/* ------------------------------------------------------------------ *
 * Enriquecimiento: de producto crudo a producto de dominio            *
 * ------------------------------------------------------------------ */

/**
 * Completa un producto crudo con marca, identificadores, resumen e índice de
 * búsqueda. Se ejecuta una sola vez, al terminar el parseo del documento.
 *
 * @param {RawProduct} raw
 * @returns {object} producto de dominio listo para la interfaz
 */
export function enrichProduct(raw) {
  const brandId = detectBrand(`${raw.name} ${raw.notes.join(' ')} ${raw.code ?? ''}`);
  const categoryId = slugify(raw.category);
  const code = raw.code ?? `SIN-CODIGO-${slugify(raw.name).slice(0, 24)}`;

  return {
    ...raw,
    code,
    slug: slugify(code),
    brandId,
    categoryId,
    categoryIcon: iconForCategory(raw.category),
    summary: buildSummary(raw),
    searchText: buildSearchText(raw, brandId)
  };
}

/**
 * Detecta la línea de producto a partir del texto del producto.
 * @param {string} haystack
 * @returns {string} id de marca
 */
function detectBrand(haystack) {
  for (const brand of BRANDS) {
    if (brand.match.test(haystack)) return brand.id;
  }
  return DEFAULT_BRAND_ID;
}

/**
 * Elige el icono de la familia de producto.
 * @param {string} category
 * @returns {string}
 */
function iconForCategory(category) {
  const value = normalize(category);
  for (const [needle, iconId] of CATEGORY_ICONS) {
    if (value.includes(needle)) return iconId;
  }
  return DEFAULT_CATEGORY_ICON;
}

/**
 * Construye la descripción corta de la tarjeta: hasta tres especificaciones
 * destacadas, o las primeras notas libres si el producto no tiene ficha.
 * @param {RawProduct} raw
 * @returns {string}
 */
function buildSummary(raw) {
  const picked = [];
  for (const key of HIGHLIGHT_SPEC_KEYS) {
    const spec = raw.specs.find((item) => item.key === key);
    if (spec) picked.push(`${spec.key}: ${spec.value}`);
    if (picked.length === 3) break;
  }
  if (picked.length > 0) return picked.join(' · ');
  if (raw.specs.length > 0) {
    return raw.specs.slice(0, 3).map((spec) => `${spec.key}: ${spec.value}`).join(' · ');
  }
  return raw.notes.slice(0, 2).join(' · ');
}

/**
 * Texto normalizado sobre el que opera la búsqueda instantánea.
 * @param {RawProduct} raw
 * @param {string} brandId
 * @returns {string}
 */
function buildSearchText(raw, brandId) {
  const specText = raw.specs.map((spec) => `${spec.key} ${spec.value}`).join(' ');
  return normalize([raw.code, raw.name, raw.category, brandId, specText, raw.notes.join(' ')].join(' '));
}
