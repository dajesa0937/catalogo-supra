/**
 * Enrutado por fragmento de URL.
 *
 * Sin servidor y sin recargas, pero con direcciones reales: cada producto y
 * cada categoría tienen su propia URL, de modo que un vendedor puede copiar el
 * enlace de un producto y mandarlo por WhatsApp, y el botón "atrás" del
 * navegador hace lo que se espera de él.
 *
 *   #/                       catálogo completo
 *   #/categoria/motosierras  catálogo filtrado
 *   #/producto/SPS-260       ficha de producto
 *   #/favoritos              solo los favoritos
 *
 * @module features/router
 */

/**
 * @typedef {object} Route
 * @property {'home'|'category'|'product'|'favorites'} view
 * @property {string|null} param
 */

/** @type {((route: Route) => void)|null} */
let handler = null;

/**
 * Traduce el fragmento actual a una ruta.
 * @returns {Route}
 */
export function currentRoute() {
  const hash = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  const [view, ...rest] = hash.split('/');
  const param = rest.join('/') || null;

  switch (view) {
    case 'producto': return { view: 'product', param };
    case 'categoria': return { view: 'category', param };
    case 'favoritos': return { view: 'favorites', param: null };
    default: return { view: 'home', param: null };
  }
}

/**
 * Arranca el enrutador y notifica la ruta inicial.
 * @param {(route: Route) => void} onChange
 */
export function initRouter(onChange) {
  handler = onChange;
  window.addEventListener('hashchange', () => handler?.(currentRoute()));
  handler(currentRoute());
}

/**
 * Navega a una ruta. Se usa `replaceState` cuando la navegación no debe crear
 * una entrada en el historial (cambiar de categoría, no abrir un producto).
 *
 * @param {string} path Fragmento sin almohadilla, p. ej. `producto/SPS-260`
 * @param {{replace?: boolean}} [options]
 */
export function navigate(path, { replace = false } = {}) {
  const target = `#/${path}`.replace(/\/+$/, '');
  if (window.location.hash === target) return;
  if (replace) {
    window.history.replaceState(null, '', target);
    handler?.(currentRoute());
  } else {
    window.location.hash = target;
  }
}

/** Vuelve al catálogo desde una ficha de producto. */
export function closeProduct() {
  if (window.history.length > 1) window.history.back();
  else navigate('');
}
