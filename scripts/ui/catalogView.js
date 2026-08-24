/**
 * Retícula del catálogo.
 *
 * Renderiza por bloques con `requestAnimationFrame` para no bloquear el hilo
 * principal: la primera hornada aparece de inmediato y el resto se completa en
 * los fotogramas siguientes, de modo que la interfaz nunca se siente trabada
 * aunque se quiten todos los filtros de golpe.
 *
 * @module ui/catalogView
 */

import { APP_CONFIG } from '../../config/app.config.js';
import { clear, el, icon, qs } from '../core/dom.js';
import { pluralize } from '../core/format.js';
import { productCard } from './productCard.js';

/** Identificador del render en curso; invalida los pendientes. */
let renderToken = 0;

/**
 * Pinta la lista de productos.
 *
 * @param {object[]} products
 * @param {import('../core/store.js').AppState} state
 * @param {{groupByCategory: boolean}} [options]
 */
export function renderCatalog(products, state, { groupByCategory = false } = {}) {
  const container = qs('#catalog');
  if (!container) return;

  renderToken += 1;
  const token = renderToken;
  clear(container);

  if (products.length === 0) {
    container.append(emptyState(state));
    return;
  }

  const groups = groupByCategory ? groupProducts(products) : [{ name: null, items: products }];

  for (const group of groups) {
    if (group.name) {
      container.append(el('div', { class: 'section-heading' }, [
        icon(group.items[0].categoryIcon),
        el('h2', { text: group.name }),
        el('span', { class: 'section-heading__count', text: pluralize(group.items.length, 'producto', 'productos') })
      ]));
    }

    const grid = el('div', { class: 'grid', dataset: { view: state.viewMode } });
    container.append(grid);
    paintInChunks(grid, group.items, state.priceMode, token);
  }
}

/**
 * Añade tarjetas por bloques, un bloque por fotograma.
 * @param {HTMLElement} grid
 * @param {object[]} items
 * @param {'gross'|'net'} priceMode
 * @param {number} token
 */
function paintInChunks(grid, items, priceMode, token) {
  const size = APP_CONFIG.ui.gridChunkSize;
  let index = 0;

  const paint = () => {
    if (token !== renderToken) return;              // llegó un render más reciente
    const fragment = document.createDocumentFragment();
    for (const product of items.slice(index, index + size)) {
      fragment.append(productCard(product, priceMode));
    }
    grid.append(fragment);
    index += size;
    if (index < items.length) requestAnimationFrame(paint);
  };

  paint();
}

/**
 * Agrupa manteniendo el orden de aparición en el PDF.
 * @param {object[]} products
 * @returns {{name: string, items: object[]}[]}
 */
function groupProducts(products) {
  const groups = new Map();
  for (const product of products) {
    if (!groups.has(product.categoryId)) groups.set(product.categoryId, { name: product.category, items: [] });
    groups.get(product.categoryId).items.push(product);
  }
  return [...groups.values()];
}

/**
 * Estado vacío, redactado según el motivo real de que no haya resultados.
 * @param {import('../core/store.js').AppState} state
 * @returns {HTMLElement}
 */
function emptyState(state) {
  if (state.onlyFavorites) {
    return el('div', { class: 'empty' }, [
      icon('icon-heart'),
      el('p', { class: 'empty__title', text: 'Todavía no hay favoritos' }),
      el('p', {
        class: 'empty__text',
        text: 'Marca con el corazón los productos que más consultas y los tendrás aquí siempre a mano.'
      })
    ]);
  }

  if (state.query) {
    return el('div', { class: 'empty' }, [
      icon('icon-search'),
      el('p', { class: 'empty__title', text: `Sin resultados para "${state.query}"` }),
      el('p', {
        class: 'empty__text',
        text: 'Prueba con el código de referencia, con menos palabras, o quita los filtros de categoría y marca.'
      })
    ]);
  }

  return el('div', { class: 'empty' }, [
    icon('icon-tag'),
    el('p', { class: 'empty__title', text: 'No hay productos con estos filtros' }),
    el('p', { class: 'empty__text', text: 'Quita alguno de los filtros activos para ver más referencias.' })
  ]);
}
