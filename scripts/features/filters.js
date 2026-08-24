/**
 * Aplicación de filtros y orden sobre el catálogo. Módulo puro: recibe la lista
 * y el estado, y devuelve la lista resultante.
 * @module features/filters
 */

import { search } from './search.js';
import { sortProducts } from './sorting.js';
import { isFavorite } from './favorites.js';

/**
 * Resuelve la consulta completa: filtros → búsqueda → orden.
 *
 * El orden de las operaciones importa. Los filtros van primero porque reducen
 * el conjunto sobre el que se puntúa la búsqueda, y el orden va al final porque
 * cuando hay texto buscado la relevancia debe poder imponerse.
 *
 * @param {object[]} products
 * @param {import('../core/store.js').AppState} state
 * @returns {object[]}
 */
export function applyQuery(products, state) {
  let result = products;

  if (state.category) result = result.filter((product) => product.categoryId === state.category);
  if (state.brand) result = result.filter((product) => product.brandId === state.brand);
  if (state.onlyFavorites) result = result.filter((product) => isFavorite(product.code));

  if (state.query.trim()) {
    result = search(result, state.query);
    // Con texto buscado, "relevancia" significa el orden que devuelve la búsqueda.
    if (state.sort === 'relevance') return result;
  }

  return sortProducts(result, state.sort, state.priceMode);
}

/**
 * Recuenta cuántos productos quedarían por categoría con los filtros actuales,
 * ignorando el filtro de categoría en sí. Es lo que permite que los contadores
 * del menú lateral sean honestos.
 *
 * @param {object[]} products
 * @param {import('../core/store.js').AppState} state
 * @returns {Map<string, number>}
 */
export function countByCategory(products, state) {
  const subset = applyQuery(products, { ...state, category: null, sort: 'relevance' });
  const counts = new Map();
  for (const product of subset) {
    counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Recuento equivalente por marca.
 * @param {object[]} products
 * @param {import('../core/store.js').AppState} state
 * @returns {Map<string, number>}
 */
export function countByBrand(products, state) {
  const subset = applyQuery(products, { ...state, brand: null, sort: 'relevance' });
  const counts = new Map();
  for (const product of subset) {
    counts.set(product.brandId, (counts.get(product.brandId) ?? 0) + 1);
  }
  return counts;
}
