/**
 * Barra superior: búsqueda, favoritos, tema, exportación y menú.
 * @module ui/header
 */

import { APP_CONFIG } from '../../config/app.config.js';
import { debounce, qs } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import { on, EVENTS } from '../core/eventBus.js';
import { countFavorites } from '../features/favorites.js';
import { toggleTheme, getResolvedTheme } from '../features/theme.js';
import { exportJson, exportCsv } from '../features/exporter.js';
import { navigate } from '../features/router.js';
import { toggleSidebar } from './sidebar.js';
import { toast } from './toast.js';

/**
 * Conecta los controles de la barra superior.
 * @param {() => {visible: object[], catalog: object}} getContext Estado actual de la vista
 */
export function initHeader(getContext) {
  const input = qs('#search-input');
  const clearButton = qs('#search-clear');

  const applyQuery = debounce((value) => setState({ query: value }), APP_CONFIG.ui.searchDebounceMs);

  input.addEventListener('input', () => {
    clearButton.hidden = input.value.length === 0;
    qs('#search-hint').hidden = input.value.length > 0;
    applyQuery(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      event.stopPropagation();
      resetSearch();
    }
  });

  clearButton.addEventListener('click', resetSearch);

  function resetSearch() {
    input.value = '';
    clearButton.hidden = true;
    qs('#search-hint').hidden = false;
    setState({ query: '' });
    input.focus();
  }

  // Atajo de teclado: "/" enfoca la búsqueda desde cualquier punto, que es el
  // gesto que espera quien pasa el día consultando referencias.
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    input.focus();
    input.select();
  });

  qs('#favorites-toggle').addEventListener('click', () => {
    navigate(getState().onlyFavorites ? '' : 'favoritos');
  });

  qs('#theme-toggle').addEventListener('click', (event) => {
    const next = toggleTheme();
    event.currentTarget.setAttribute('aria-label',
      next === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  });

  qs('#export-json').addEventListener('click', () => {
    const { visible, catalog } = getContext();
    exportJson(visible, catalog.meta);
    toast(`Exportados ${visible.length} productos a JSON`, 'icon-download');
  });

  qs('#export-csv').addEventListener('click', () => {
    const { visible } = getContext();
    exportCsv(visible);
    toast(`Exportados ${visible.length} productos a CSV`, 'icon-download');
  });

  qs('#menu-toggle').addEventListener('click', () => toggleSidebar());
  qs('#sidebar-scrim').addEventListener('click', () => toggleSidebar(false));

  on(EVENTS.FAVORITES_CHANGED, updateFavoritesBadge);
  on(EVENTS.THEME_CHANGED, syncThemeButton);

  observeHeaderHeight();
  updateFavoritesBadge();
  syncThemeButton();
}

/**
 * Publica la altura real de la barra superior en `--header-h`.
 *
 * En móvil la barra pasa a dos filas y su altura deja de ser fija. En vez de
 * codificar un valor que se desincronizaría al cambiar el contenido, se mide y
 * se publica: la barra de herramientas y el menú lateral, que se posicionan a
 * partir de esa variable, se ajustan solos en cualquier ancho.
 *
 * La variable que se escribe es DISTINTA de `--bar-height`, que es la altura
 * mínima de diseño de la cabecera. Escribir sobre esa otra realimentaría al
 * propio elemento medido y provocaría un bucle de redimensionado infinito.
 */
function observeHeaderHeight() {
  const header = qs('.header');
  if (!header || typeof ResizeObserver === 'undefined') return;

  let frame = 0;
  const publish = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const height = Math.round(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--header-h', `${height}px`);
    });
  };

  new ResizeObserver(publish).observe(header);
  publish();
}

/** Sincroniza el campo de búsqueda con el estado (p. ej. al limpiar un filtro). */
export function syncSearchInput() {
  const input = qs('#search-input');
  const { query } = getState();
  if (input.value === query) return;
  input.value = query;
  qs('#search-clear').hidden = query.length === 0;
  qs('#search-hint').hidden = query.length > 0;
}

/** Refleja el estado del botón de favoritos. */
export function updateFavoritesBadge() {
  const button = qs('#favorites-toggle');
  const badge = qs('#favorites-count');
  const total = countFavorites();

  badge.textContent = String(total);
  badge.hidden = total === 0;
  button.setAttribute('aria-pressed', String(getState().onlyFavorites));
}

/** Ajusta el icono y la etiqueta del conmutador de tema. */
function syncThemeButton() {
  const button = qs('#theme-toggle');
  const dark = getResolvedTheme() === 'dark';
  qs('use', button).setAttribute('href', `assets/icons/sprite.svg#${dark ? 'icon-sun' : 'icon-moon'}`);
  button.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}
