/**
 * Favoritos del usuario, persistidos en LocalStorage.
 *
 * Es exactamente el caso de uso para el que LocalStorage sirve: una lista corta
 * de cadenas, propia de este navegador, que debe sobrevivir a la recarga.
 *
 * @module features/favorites
 */

import { APP_CONFIG } from '../../config/app.config.js';
import { emit, EVENTS } from '../core/eventBus.js';

const KEY = APP_CONFIG.storageKeys.favorites;

/** @type {Set<string>} */
let favorites = read();

/**
 * @returns {Set<string>}
 */
function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...favorites]));
  } catch {
    // Modo privado o cuota agotada: los favoritos siguen vivos en memoria.
  }
}

/**
 * @param {string} code
 * @returns {boolean}
 */
export function isFavorite(code) {
  return favorites.has(code);
}

/**
 * Alterna el estado de favorito de un producto.
 * @param {string} code
 * @returns {boolean} el estado resultante
 */
export function toggleFavorite(code) {
  if (favorites.has(code)) favorites.delete(code);
  else favorites.add(code);
  persist();
  emit(EVENTS.FAVORITES_CHANGED, { code, active: favorites.has(code), total: favorites.size });
  return favorites.has(code);
}

/** @returns {string[]} */
export function listFavorites() {
  return [...favorites];
}

/** @returns {number} */
export function countFavorites() {
  return favorites.size;
}

/** Vacía la lista de favoritos. */
export function clearFavorites() {
  favorites = new Set();
  persist();
  emit(EVENTS.FAVORITES_CHANGED, { code: null, active: false, total: 0 });
}
