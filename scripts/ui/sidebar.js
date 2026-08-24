/**
 * Menú lateral de categorías con recuentos en vivo.
 *
 * Los recuentos reflejan los filtros activos, no el total del catálogo: si hay
 * una búsqueda puesta, cada categoría muestra cuántos resultados tiene DENTRO
 * de esa búsqueda. Un contador que miente es peor que no tener contador.
 *
 * @module ui/sidebar
 */

import { clear, el, icon, qs } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import { countByCategory } from '../features/filters.js';
import { countFavorites } from '../features/favorites.js';
import { navigate } from '../features/router.js';

/**
 * Monta el menú lateral.
 * @param {object} catalog
 */
export function initSidebar(catalog) {
  const nav = qs('#category-nav');
  clear(nav);

  nav.append(
    item({
      id: null,
      label: 'Todo el catálogo',
      iconId: 'icon-grid',
      count: catalog.products.length,
      onSelect: () => navigate('')
    }),
    item({
      id: '__favorites__',
      label: 'Favoritos',
      iconId: 'icon-heart',
      count: countFavorites(),
      onSelect: () => navigate('favoritos')
    })
  );

  const group = el('div', { class: 'sidebar__group' }, [
    el('p', { class: 'label sidebar__heading', text: 'Categorías' }),
    ...catalog.categories.map((category) => item({
      id: category.id,
      label: category.name,
      iconId: category.icon,
      count: category.count,
      onSelect: () => navigate(`categoria/${category.id}`)
    }))
  ]);

  nav.append(group);
}

/**
 * Refresca marcado activo y recuentos.
 * @param {object} catalog
 */
export function updateSidebar(catalog) {
  const state = getState();
  const counts = countByCategory(catalog.products, state);

  for (const button of document.querySelectorAll('#category-nav .sidebar__item')) {
    const id = button.dataset.category || null;
    const isFavoritesEntry = id === '__favorites__';
    const active = isFavoritesEntry
      ? state.onlyFavorites
      : !state.onlyFavorites && state.category === id;

    button.setAttribute('aria-current', String(active));

    const counter = qs('.sidebar__count', button);
    if (!counter) continue;
    if (isFavoritesEntry) counter.textContent = String(countFavorites());
    else if (id === null) counter.textContent = String(catalog.products.length);
    else counter.textContent = String(counts.get(id) ?? 0);
  }
}

/** Abre o cierra el cajón lateral en pantallas estrechas. */
export function toggleSidebar(force) {
  const sidebar = qs('#sidebar');
  const open = force ?? sidebar.dataset.open !== 'true';
  sidebar.dataset.open = String(open);
  qs('#sidebar-scrim').hidden = !open;
  qs('#menu-toggle')?.setAttribute('aria-expanded', String(open));
}

/**
 * @param {{id: string|null, label: string, iconId: string, count: number, onSelect: () => void}} config
 * @returns {HTMLElement}
 */
function item({ id, label, iconId, count, onSelect }) {
  return el('button', {
    class: 'sidebar__item',
    type: 'button',
    'aria-current': 'false',
    dataset: id ? { category: id } : {},
    onclick: () => {
      onSelect();
      setState({ query: getState().query });
      if (window.matchMedia('(max-width: 1100px)').matches) toggleSidebar(false);
    }
  }, [
    icon(iconId),
    el('span', { class: 'sidebar__label', text: label }),
    el('span', { class: 'sidebar__count', text: String(count) })
  ]);
}
