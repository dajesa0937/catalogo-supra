/**
 * Utilidades de texto compartidas por el parser y la búsqueda.
 * Módulo puro: sin DOM, sin estado, totalmente testeable.
 * @module core/text
 */

/**
 * Normaliza para comparación: minúsculas, sin tildes y sin dobles espacios.
 * Es lo que permite que "presion" encuentre "Presión".
 * @param {string} value
 * @returns {string}
 */
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convierte un texto en un identificador apto para URL y atributos.
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pasa un texto a mayúscula inicial respetando siglas y unidades.
 * "MOTOR GASOLINA 7HP" → "Motor gasolina 7HP"
 * @param {string} value
 * @returns {string}
 */
export function sentenceCase(value) {
  const clean = collapse(value);
  if (!clean) return '';
  return clean
    .toLowerCase()
    .replace(/(^|[.:;]\s+)([a-záéíóúñ])/g, (_, prefix, letter) => prefix + letter.toUpperCase())
    // Devuelve las unidades y siglas técnicas a su forma original.
    .replace(/\b(\d+(?:[.,]\d+)?)\s?(hp|cc|psi|bar|rpm|kw|lts?|gpm|lpm|mm|kgs?|t)\b/gi,
      (_, num, unit) => `${num}${unit.toUpperCase() === 'T' ? 'T' : unit.toLowerCase()}`)
    .replace(/\b(pvd|iva|ohv|2t|4t|sae|npt)\b/gi, (m) => m.toUpperCase());
}

/**
 * Colapsa espacios y limpia signos de puntuación duplicados del PDF.
 * @param {string} value
 * @returns {string}
 */
export function collapse(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/([.:]){2,}/g, '$1')
    .trim();
}

/**
 * Convierte un importe del PDF a número.
 * El PDF usa punto como separador de miles: "$ 1.554.622" → 1554622
 * @param {string} raw
 * @returns {number|null}
 */
export function parseCurrency(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Divide un texto en términos de búsqueda normalizados y sin duplicados.
 * @param {string} value
 * @returns {string[]}
 */
export function tokenize(value) {
  const seen = new Set();
  for (const token of normalize(value).split(/[^a-z0-9]+/)) {
    if (token.length >= 2) seen.add(token);
  }
  return [...seen];
}

/**
 * Escapa un texto para insertarlo con seguridad como HTML.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
