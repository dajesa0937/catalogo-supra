/**
 * Barra de herramientas: contexto, filtros de marca, conmutador de precio,
 * orden y modo de vista.
 * @module ui/toolbar
 */

import { APP_CONFIG, MODE } from '../../config/app.config.js';
import { clear, el, icon, qs } from '../core/dom.js';
import { pluralize } from '../core/format.js';
import { getState, setState } from '../core/store.js';
import { emit, EVENTS } from '../core/eventBus.js';
import { SORT_OPTIONS } from '../features/sorting.js';
import { navigate } from '../features/router.js';

/**
 * Monta la barra de herramientas.
 * @param {object} catalog
 */
export function initToolbar(catalog) {
  const controls = qs('#toolbar-controls');
  clear(controls);

  // Sin precios publicados, el conmutador P.V.D / sin IVA no tiene nada que
  // conmutar y el orden por precio no tiene por qué ordenar.
  controls.append(
    brandFilter(catalog.brands),
    ...(MODE.showPrices ? [priceToggle()] : []),
    sortSelect(),
    viewToggle()
  );
}

/**
 * Actualiza el título, el recuento y las píldoras de filtro activo.
 * @param {object[]} visible Productos que se están mostrando
 * @param {object} catalog
 */
export function updateToolbar(visible, catalog) {
  const state = getState();
  const category = catalog.categories.find((item) => item.id === state.category);

  qs('#toolbar-title').textContent = state.onlyFavorites
    ? 'Favoritos'
    : category?.name ?? 'Catálogo completo';

  qs('#toolbar-count').textContent = pluralize(visible.length, 'producto', 'productos');

  const filters = qs('#active-filters');
  clear(filters);

  if (state.query) filters.append(pill(`"${state.query}"`, () => setState({ query: '' })));
  if (category) filters.append(pill(category.name, () => navigate('', { replace: true })));
  if (state.brand) {
    const brand = catalog.brands.find((item) => item.id === state.brand);
    if (brand) filters.append(pill(brand.name, () => setState({ brand: null })));
  }
  filters.hidden = filters.childElementCount === 0;

  for (const button of controls('.brand-chip')) {
    button.setAttribute('aria-pressed', String(button.dataset.brand === state.brand));
  }
  for (const button of controls('[data-price-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.priceMode === state.priceMode));
  }
  for (const button of controls('[data-view-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.viewMode === state.viewMode));
  }
  const sort = qs('#sort-select');
  if (sort) sort.value = state.sort;
}

/**
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
function controls(selector) {
  return [...document.querySelectorAll(`#toolbar-controls ${selector}`)];
}

/**
 * @param {string} label
 * @param {() => void} onRemove
 * @returns {HTMLElement}
 */
function pill(label, onRemove) {
  return el('span', { class: 'filter-pill' }, [
    label,
    el('button', {
      class: 'filter-pill__remove',
      type: 'button',
      'aria-label': `Quitar el filtro ${label}`,
      onclick: onRemove
    }, [icon('icon-close')])
  ]);
}

/**
 * @param {object[]} brands
 * @returns {HTMLElement}
 */
function brandFilter(brands) {
  return el('div', { class: 'brand-filter', role: 'group', 'aria-label': 'Filtrar por línea de producto' },
    brands.map((brand) => el('button', {
      class: 'brand-chip',
      type: 'button',
      style: `--chip-color:${brand.color}`,
      dataset: { brand: brand.id },
      'aria-pressed': 'false',
      title: `${brand.name} · gama ${brand.tier.toLowerCase()}`,
      onclick: () => setState({ brand: getState().brand === brand.id ? null : brand.id })
    }, [
      brand.name,
      el('span', { class: 'brand-chip__count', text: String(brand.count) })
    ])));
}

/**
 * Conmutador entre precio con y sin IVA. Es la decisión más frecuente del
 * usuario, así que vive en la barra y no dentro de un menú.
 * @returns {HTMLElement}
 */
function priceToggle() {
  const choose = (mode) => {
    setState({ priceMode: mode });
    try { localStorage.setItem(APP_CONFIG.storageKeys.priceMode, mode); } catch { /* sin persistencia */ }
    emit(EVENTS.PRICE_MODE_CHANGED, mode);
  };

  return el('div', { class: 'segmented', role: 'group', 'aria-label': 'Precio mostrado' }, [
    el('button', {
      class: 'segmented__option', type: 'button', dataset: { priceMode: 'gross' },
      'aria-pressed': 'true', title: 'Precio público de venta al distribuidor',
      onclick: () => choose('gross')
    }, ['P.V.D']),
    el('button', {
      class: 'segmented__option', type: 'button', dataset: { priceMode: 'net' },
      'aria-pressed': 'false', title: 'Precio sin IVA',
      onclick: () => choose('net')
    }, ['Sin IVA'])
  ]);
}

/**
 * @returns {HTMLElement}
 */
function sortSelect() {
  const options = MODE.showPrices
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter((option) => !option.id.startsWith('price-'));

  const select = el('select', {
    id: 'sort-select',
    'aria-label': 'Ordenar el catálogo',
    onchange: (event) => setState({ sort: event.target.value })
  }, options.map((option) => el('option', { value: option.id, text: option.label })));

  return el('div', { class: 'select' }, [select, icon('icon-chevron-down', 'select__chevron')]);
}

/**
 * @returns {HTMLElement}
 */
function viewToggle() {
  const choose = (mode) => {
    setState({ viewMode: mode });
    try { localStorage.setItem(APP_CONFIG.storageKeys.viewMode, mode); } catch { /* sin persistencia */ }
  };

  return el('div', { class: 'segmented', role: 'group', 'aria-label': 'Modo de vista' }, [
    el('button', {
      class: 'segmented__option', type: 'button', dataset: { viewMode: 'grid' },
      'aria-pressed': 'true', 'aria-label': 'Vista en cuadrícula', onclick: () => choose('grid')
    }, [icon('icon-grid')]),
    el('button', {
      class: 'segmented__option', type: 'button', dataset: { viewMode: 'list' },
      'aria-pressed': 'false', 'aria-label': 'Vista en lista', onclick: () => choose('list')
    }, [icon('icon-list')])
  ]);
}
