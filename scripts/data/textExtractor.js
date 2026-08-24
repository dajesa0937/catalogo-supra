/**
 * Convierte el contenido de texto crudo de una página de PDF.js en líneas
 * ordenadas, clasificadas por columna y con su tamaño de fuente relativo.
 *
 * Módulo PURO: no importa PDF.js ni toca el DOM. Recibe la estructura de datos
 * (`{ items }`) y la altura de la página, y devuelve líneas. Esto es lo que
 * permite ejecutarlo en Node dentro de la suite de pruebas.
 *
 * Decisión clave: NO se trabaja con líneas de texto plano sino con coordenadas.
 * Word desplaza el código y el precio a renglones distintos cuando la
 * descripción es larga, de modo que cualquier parser basado en líneas falla en
 * torno a una de cada cuatro filas. Agrupar por banda vertical y clasificar
 * cada fragmento por su columna es inmune a ese comportamiento.
 *
 * @module data/textExtractor
 */

import { PARSER_CONFIG } from '../../config/parser.config.js';
import { collapse } from '../core/text.js';

/** Columnas de la tabla, en orden de lectura. */
export const COLUMNS = Object.freeze(['code', 'description', 'priceNet', 'priceGross']);

/**
 * @typedef {object} TextFragment
 * @property {string} text
 * @property {number} x     Borde izquierdo, en puntos PDF
 * @property {number} y     Línea base, en puntos PDF (crece hacia arriba)
 * @property {number} size  Altura de la fuente, en puntos
 */

/**
 * @typedef {object} TextLine
 * @property {string} text       Texto de la línea dentro de su columna
 * @property {number} top        Distancia al borde superior de la página
 * @property {number} x          Borde izquierdo del primer fragmento
 * @property {number} size       Tamaño de fuente dominante
 * @property {number} sizeRatio  Tamaño relativo al cuerpo de la ficha técnica
 * @property {'code'|'description'|'priceNet'|'priceGross'} column
 */

/**
 * Extrae y clasifica las líneas de texto de una página.
 *
 * Una misma banda vertical produce hasta cuatro líneas —una por columna—
 * porque código, descripción y precios comparten la línea base pero son
 * informaciones independientes.
 *
 * @param {{ items: Array<{ str: string, transform: number[], height?: number }> }} textContent
 * @param {number} pageHeight Altura de la página en puntos PDF
 * @param {number} [bodySize] Cuerpo de referencia del DOCUMENTO. Conviene pasarlo:
 *   alguna página de la lista compone el nombre del producto al mismo tamaño que
 *   la ficha técnica, y medir el cuerpo página a página falsearía la escala.
 * @returns {TextLine[]} líneas ordenadas de arriba a abajo
 */
export function extractLines(textContent, pageHeight, bodySize) {
  const fragments = toFragments(textContent.items);
  if (fragments.length === 0) return [];

  const bands = groupIntoBands(fragments);
  const lines = [];

  for (const band of bands) {
    for (const column of COLUMNS) {
      const columnFragments = band.fragments.filter((f) => classifyColumn(f.x) === column);
      if (columnFragments.length === 0) continue;
      lines.push({
        column,
        text: joinFragments(columnFragments),
        top: round(pageHeight - band.baseline),
        x: round(columnFragments[0].x),
        size: dominantSize(columnFragments),
        sizeRatio: 1
      });
    }
  }

  const reference = bodySize > 0 ? bodySize : measureBodyFontSize(lines);
  if (reference > 0) {
    for (const line of lines) line.sizeRatio = round(line.size / reference);
  }

  return lines.sort((a, b) => a.top - b.top || a.x - b.x);
}

/**
 * Cuerpo de letra dominante en la columna de descripción: es el de la ficha
 * técnica y sirve de referencia para distinguir nombres y titulares.
 *
 * Se mide sobre TODO el documento, no página a página. Al ser una medida
 * relativa, el parser sigue funcionando si la lista se regenera con otro
 * cuerpo de texto.
 *
 * @param {TextLine[]} lines líneas de una o varias páginas
 * @returns {number} 0 si no hay texto suficiente
 */
export function measureBodyFontSize(lines) {
  const histogram = new Map();
  for (const line of lines) {
    if (line.column !== 'description') continue;
    histogram.set(line.size, (histogram.get(line.size) ?? 0) + line.text.length);
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, weight] of histogram) {
    if (weight > bestWeight) { best = size; bestWeight = weight; }
  }
  return best;
}

/**
 * Normaliza los items de PDF.js a fragmentos con coordenadas útiles.
 * @param {Array<{ str: string, transform: number[], height?: number }>} items
 * @returns {TextFragment[]}
 */
function toFragments(items) {
  const fragments = [];
  for (const item of items) {
    const text = collapse(item.str);
    if (!text) continue;
    const [a, b, , d, x, y] = item.transform;
    // Altura real del glifo: PDF.js la expone, pero se recalcula desde la
    // matriz cuando falta o viene en cero (fuentes con transformaciones).
    const size = item.height || Math.hypot(b, d) || Math.hypot(a, b) || 0;
    fragments.push({ text, x, y, size: round(size) });
  }
  return fragments;
}

/**
 * Agrupa fragmentos en bandas horizontales por proximidad de línea base.
 * @param {TextFragment[]} fragments
 * @returns {{ baseline: number, fragments: TextFragment[] }[]}
 */
function groupIntoBands(fragments) {
  const sorted = [...fragments].sort((left, right) => right.y - left.y || left.x - right.x);
  const bands = [];
  let current = null;

  for (const fragment of sorted) {
    if (!current || Math.abs(current.baseline - fragment.y) > PARSER_CONFIG.lineToleranceY) {
      current = { baseline: fragment.y, fragments: [fragment] };
      bands.push(current);
    } else {
      current.fragments.push(fragment);
    }
  }

  for (const band of bands) band.fragments.sort((left, right) => left.x - right.x);
  return bands;
}

/**
 * Une los fragmentos de una columna insertando un espacio cuando hay hueco.
 * @param {TextFragment[]} fragments
 * @returns {string}
 */
function joinFragments(fragments) {
  let text = '';
  let previousEnd = null;
  for (const fragment of fragments) {
    if (previousEnd !== null && fragment.x - previousEnd > 1.5 && !text.endsWith(' ')) {
      text += ' ';
    }
    text += fragment.text;
    // Ancho aproximado del fragmento: suficiente para detectar huecos reales.
    previousEnd = fragment.x + fragment.text.length * fragment.size * 0.5;
  }
  return collapse(text);
}

/**
 * Tamaño de fuente que más caracteres aporta al conjunto de fragmentos.
 * @param {TextFragment[]} fragments
 * @returns {number}
 */
function dominantSize(fragments) {
  const weight = new Map();
  for (const fragment of fragments) {
    weight.set(fragment.size, (weight.get(fragment.size) ?? 0) + fragment.text.length);
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, count] of weight) {
    if (count > bestWeight) { best = size; bestWeight = count; }
  }
  return best;
}

/**
 * Asigna un fragmento a su columna de la tabla según su borde izquierdo.
 * @param {number} x
 * @returns {'code'|'description'|'priceNet'|'priceGross'}
 */
export function classifyColumn(x) {
  const { codeMaxX, descMaxX, priceNetMaxX } = PARSER_CONFIG.columns;
  if (x < codeMaxX) return 'code';
  if (x < descMaxX) return 'description';
  if (x < priceNetMaxX) return 'priceNet';
  return 'priceGross';
}

/**
 * Redondea a una décima. Evita ruido de coma flotante en las comparaciones.
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Math.round(value * 10) / 10;
}
