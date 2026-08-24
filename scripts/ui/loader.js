/**
 * Pantalla de carga con progreso real.
 *
 * No es un indicador indeterminado dando vueltas: refleja la fase y la página
 * que se está leyendo. La primera visita cuesta unos segundos porque hay que
 * leer el PDF entero, y decir exactamente qué se está haciendo es la diferencia
 * entre "está trabajando" y "se colgó".
 *
 * @module ui/loader
 */

import { qs } from '../core/dom.js';

const root = () => qs('#loader');

/**
 * Actualiza la fase y la barra de progreso.
 * @param {{phase: string, done: number, total: number}} progress
 */
export function updateLoader({ phase, done, total }) {
  const element = root();
  if (!element) return;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  qs('.loader__phase', element).textContent = phase;
  qs('.loader__fill', element).style.width = `${percent}%`;
  element.setAttribute('aria-valuenow', String(percent));
}

/**
 * Muestra un mensaje de error irrecuperable en la propia pantalla de carga.
 * @param {string} message
 */
export function failLoader(message) {
  const element = root();
  if (!element) return;
  element.dataset.state = 'error';
  qs('.loader__phase', element).textContent = 'No se pudo cargar el catálogo';
  qs('.loader__note', element).textContent = message;
}

/** Oculta la pantalla de carga. */
export function hideLoader() {
  const element = root();
  if (!element) return;
  element.style.opacity = '0';
  element.style.pointerEvents = 'none';
  setTimeout(() => element.remove(), 320);
}
