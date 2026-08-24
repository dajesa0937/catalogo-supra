/**
 * Formateo de valores para presentación (moneda colombiana, cantidades).
 * @module core/format
 */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const PLAIN = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/**
 * Formatea un importe en pesos colombianos.
 * @param {number|null|undefined} value
 * @returns {string} p. ej. "$ 1.554.622" · "Consultar" si no hay precio
 */
export function currency(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Consultar';
  return COP.format(value).replace(/\s/g, ' ');
}

/**
 * Formatea un número entero con separador de miles.
 * @param {number} value
 * @returns {string}
 */
export function number(value) {
  return PLAIN.format(value ?? 0);
}

/**
 * Devuelve la forma singular o plural según la cantidad.
 * @param {number} count
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
export function pluralize(count, singular, plural) {
  return `${number(count)} ${count === 1 ? singular : plural}`;
}

/**
 * Formatea una fecha en formato largo local.
 * @param {number|string|Date} value
 * @returns {string}
 */
export function longDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}
