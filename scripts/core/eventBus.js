/**
 * Bus de eventos mínimo. Desacopla las funcionalidades de la interfaz:
 * nadie importa a nadie, todos publican y escuchan sobre este canal.
 * @module core/eventBus
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * Suscribe un manejador a un evento.
 * @param {string} event
 * @param {Function} handler
 * @returns {() => void} función para cancelar la suscripción
 */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

/**
 * Cancela una suscripción.
 * @param {string} event
 * @param {Function} handler
 */
export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

/**
 * Publica un evento. Un manejador que falle no interrumpe a los demás.
 * @param {string} event
 * @param {*} [payload]
 */
export function emit(event, payload) {
  const handlers = listeners.get(event);
  if (!handlers) return;
  for (const handler of [...handlers]) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[eventBus] fallo en el manejador de "${event}"`, error);
    }
  }
}

/** Nombres de evento del dominio. Evita cadenas mágicas repartidas por el código. */
export const EVENTS = Object.freeze({
  CATALOG_READY: 'catalog:ready',
  LOAD_PROGRESS: 'load:progress',
  LOAD_FAILED: 'load:failed',
  QUERY_CHANGED: 'query:changed',
  RESULTS_CHANGED: 'results:changed',
  PRODUCT_OPENED: 'product:opened',
  PRODUCT_CLOSED: 'product:closed',
  FAVORITES_CHANGED: 'favorites:changed',
  PRICE_MODE_CHANGED: 'price:mode-changed',
  THEME_CHANGED: 'theme:changed',
  TOAST: 'ui:toast'
});
