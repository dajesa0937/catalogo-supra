/**
 * Estado central de la aplicación.
 *
 * Un único objeto de estado, mutable solo a través de `setState`, que notifica
 * a los suscriptores. Es deliberadamente pequeño: el catálogo completo vive en
 * el repositorio, aquí solo está lo que la interfaz necesita para pintarse.
 *
 * @module core/store
 */

/**
 * @typedef {object} AppState
 * @property {'loading'|'ready'|'error'} status
 * @property {string} query           Texto de búsqueda activo
 * @property {string|null} category   Id de categoría activa (null = todas)
 * @property {string|null} brand      Id de marca activa (null = todas)
 * @property {'relevance'|'name-asc'|'name-desc'|'price-asc'|'price-desc'} sort
 * @property {boolean} onlyFavorites
 * @property {'gross'|'net'} priceMode  gross = P.V.D · net = P.V.D sin IVA
 * @property {'grid'|'list'} viewMode
 * @property {string|null} openProduct  Código del producto abierto en detalle
 */

/** @type {AppState} */
const state = {
  status: 'loading',
  query: '',
  category: null,
  brand: null,
  sort: 'relevance',
  onlyFavorites: false,
  priceMode: 'gross',
  viewMode: 'grid',
  openProduct: null
};

/** @type {Set<(state: AppState, changed: string[]) => void>} */
const subscribers = new Set();

/** @returns {Readonly<AppState>} copia inmutable del estado actual */
export function getState() {
  return Object.freeze({ ...state });
}

/**
 * Aplica un parche al estado y notifica solo si algo cambió realmente.
 * @param {Partial<AppState>} patch
 */
export function setState(patch) {
  const changed = [];
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] !== value) {
      state[key] = value;
      changed.push(key);
    }
  }
  if (changed.length === 0) return;
  const snapshot = getState();
  for (const subscriber of [...subscribers]) {
    try {
      subscriber(snapshot, changed);
    } catch (error) {
      console.error('[store] fallo en un suscriptor', error);
    }
  }
}

/**
 * Suscribe un observador a los cambios de estado.
 * @param {(state: Readonly<AppState>, changed: string[]) => void} subscriber
 * @returns {() => void} función para cancelar la suscripción
 */
export function subscribe(subscriber) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

/** Devuelve true si hay algún filtro o búsqueda activa. */
export function hasActiveFilters() {
  return Boolean(state.query || state.category || state.brand || state.onlyFavorites);
}
