/**
 * Composición de la aplicación: carga el catálogo, monta los componentes y
 * mantiene sincronizados estado, URL y vista.
 *
 * Es el único módulo que conoce a todos los demás. Los componentes no se
 * llaman entre sí: publican cambios en el estado y este orquestador vuelve a
 * pintar lo que corresponda.
 *
 * @module ui/app
 */

import { APP_CONFIG, MODE } from '../../config/app.config.js';
import { el, icon, qs } from '../core/dom.js';
import { getState, setState, subscribe, hasActiveFilters } from '../core/store.js';
import { on, EVENTS } from '../core/eventBus.js';
import { longDate } from '../core/format.js';
import { load, findByCode } from '../data/catalogRepository.js';
import { applyQuery } from '../features/filters.js';
import { initTheme } from '../features/theme.js';
import { reconcileFavorites } from '../features/favorites.js';
import { initRouter, currentRoute } from '../features/router.js';
import { updateLoader, hideLoader, failLoader } from './loader.js';
import { initToasts } from './toast.js';
import { initHeader, syncSearchInput, updateFavoritesBadge } from './header.js';
import { initToolbar, updateToolbar } from './toolbar.js';
import { initSidebar, updateSidebar } from './sidebar.js';
import { renderCatalog } from './catalogView.js';
import { showDetail, closeDetail } from './detailView.js';
import { toast } from './toast.js';

/** @type {object|null} */
let catalog = null;
/** @type {object[]} */
let visible = [];

/** Arranca la aplicación. */
export async function start() {
  initTheme();
  initToasts();
  restorePreferences();

  try {
    catalog = await load(updateLoader);
  } catch (error) {
    console.error('[app] fallo al cargar el catálogo', error);
    failLoader('Revisa que el archivo data/lista-precios.pdf esté publicado y vuelve a intentarlo.');
    return;
  }

  purgeStaleFavorites();
  initHeader(() => ({ visible, catalog }));
  initToolbar(catalog);
  initSidebar(catalog);
  renderDiagnostics();
  renderFooterContact();
  renderFooterMeta();

  subscribe(onStateChange);
  on(EVENTS.FAVORITES_CHANGED, () => {
    updateSidebar(catalog);
    if (getState().onlyFavorites) refresh();
  });

  initRouter(applyRoute);
  hideLoader();
}

/**
 * Traduce la URL a estado. La URL es la fuente de verdad de la navegación:
 * así el botón "atrás" y los enlaces compartidos funcionan sin código extra.
 * @param {import('../features/router.js').Route} route
 */
function applyRoute(route) {
  setState({
    category: route.view === 'category' ? route.param : null,
    onlyFavorites: route.view === 'favorites',
    openProduct: route.view === 'product' ? route.param : null
  });

  if (route.view === 'product') {
    const product = findByCode(route.param);
    if (product) {
      showDetail(product);
    } else {
      // Un enlace compartido por WhatsApp puede apuntar a una referencia que la
      // lista nueva ya no incluye. Devolver al catálogo en silencio deja al
      // vendedor sin saber por qué; se le dice qué pasó.
      toast(`La referencia ${route.param} ya no está en el catálogo`, 'icon-alert');
      window.location.hash = '#/';
    }
  } else {
    closeDetail();
  }

  refresh();
}

/**
 * @param {Readonly<import('../core/store.js').AppState>} _state
 * @param {string[]} changed
 */
function onStateChange(_state, changed) {
  const affectsList = changed.some((key) =>
    ['query', 'category', 'brand', 'sort', 'onlyFavorites', 'priceMode', 'viewMode'].includes(key));
  if (affectsList) refresh();
  if (changed.includes('onlyFavorites')) updateFavoritesBadge();
}

/** Recalcula la lista visible y repinta lo que depende de ella. */
function refresh() {
  if (!catalog) return;
  const state = getState();

  visible = applyQuery(catalog.products, state);
  syncSearchInput();
  updateToolbar(visible, catalog);
  updateSidebar(catalog);
  updateFavoritesBadge();

  // Se agrupa por categoría solo cuando el usuario mira el catálogo entero:
  // con filtros o búsqueda activos, los encabezados estorbarían más que ayudan.
  renderCatalog(visible, state, {
    groupByCategory: !hasActiveFilters() && state.sort === 'relevance'
  });

  document.title = titleFor(state);
}

/**
 * @param {import('../core/store.js').AppState} state
 * @returns {string}
 */
function titleFor(state) {
  const base = `Catálogo · ${APP_CONFIG.companyName}`;
  if (state.openProduct) return `${state.openProduct} · ${base}`;
  if (state.onlyFavorites) return `Favoritos · ${base}`;
  const category = catalog?.categories.find((item) => item.id === state.category);
  return category ? `${category.name} · ${base}` : base;
}

/**
 * Retira los favoritos de referencias descatalogadas y avisa de ello.
 *
 * Es el efecto colateral de publicar una lista de precios nueva: los productos
 * retirados desaparecen del catálogo, pero sus códigos siguen guardados en el
 * navegador de cada vendedor.
 */
function purgeStaleFavorites() {
  const removed = reconcileFavorites(catalog.products.map((product) => product.code));
  if (removed.length === 0) return;
  toast(
    removed.length === 1
      ? `Se quitó ${removed[0]} de favoritos: ya no está en la lista`
      : `Se quitaron ${removed.length} favoritos que ya no están en la lista`,
    'icon-alert'
  );
}

/** Recupera las preferencias guardadas en LocalStorage. */
function restorePreferences() {
  try {
    const priceMode = localStorage.getItem(APP_CONFIG.storageKeys.priceMode);
    const viewMode = localStorage.getItem(APP_CONFIG.storageKeys.viewMode);
    setState({
      priceMode: priceMode === 'net' ? 'net' : 'gross',
      viewMode: viewMode === 'list' ? 'list' : 'grid'
    });
  } catch {
    // Sin almacenamiento se usan los valores por defecto.
  }
}

/**
 * Aviso de diagnóstico del parser.
 *
 * Si al leer el PDF alguna fila no se reconoce por completo, el catálogo NO
 * falla en silencio: se muestra un aviso plegable con el detalle. Es lo que
 * convierte un rediseño futuro de la lista en algo detectable en un vistazo.
 */
function renderDiagnostics() {
  const warnings = catalog?.warnings ?? [];
  if (warnings.length === 0) return;

  qs('#diagnostics').append(el('div', { class: 'notice' }, [
    icon('icon-alert'),
    el('details', {}, [
      el('summary', { text: `El lector no pudo completar ${warnings.length} fila(s) del PDF` }),
      el('ul', {}, warnings.slice(0, 20).map((warning) => el('li', { text: warning })))
    ])
  ]));
}

/**
 * Datos de contacto del pie, solo en el catálogo interno.
 *
 * En modo presentación se omiten por completo: la pieza circula entre los
 * clientes de los distribuidores, y una vía directa a Equipos Supra dejaría al
 * distribuidor fuera de su propia venta.
 */
function renderFooterContact() {
  const container = qs('#footer-contact');
  if (!container || !MODE.showDirectContact) return;

  const { whatsapp, phone, email, website, address } = APP_CONFIG.contact;
  container.hidden = false;
  container.append(
    el('p', { class: 'label', text: 'Contacto' }),
    el('a', { href: `https://wa.me/${whatsapp}`, text: `WhatsApp ${phone}` }),
    el('a', { href: `mailto:${email}`, text: email }),
    el('a', { href: website, target: '_blank', rel: 'noopener', text: website.replace(/^https?:\/\//, '') }),
    el('span', { text: address })
  );
}

/** Pie: procedencia de los datos y momento de la última lectura. */
function renderFooterMeta() {
  const meta = catalog?.meta ?? {};
  qs('#footer-meta').innerHTML = [
    `${catalog.products.length} productos · ${catalog.categories.length} categorías`,
    `Actualizado: ${longDate(meta.builtAt ?? Date.now())}`
  ].join('<br>');
}
