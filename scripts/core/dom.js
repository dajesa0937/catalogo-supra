/**
 * Ayudantes de DOM. Fina capa sobre la API nativa para que los componentes
 * de `ui/` se lean como descripciones de estructura y no como fontanería.
 * @module core/dom
 */

/**
 * Selector único.
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {HTMLElement|null}
 */
export const qs = (selector, root = document) => root.querySelector(selector);

/**
 * Selector múltiple, ya como array.
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {HTMLElement[]}
 */
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Crea un elemento con atributos e hijos en una sola expresión.
 * @param {string} tag
 * @param {Record<string, any>} [attrs] `class`, `text`, `html`, `dataset`, `on*` y atributos normales
 * @param {(Node|string)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Referencia a un símbolo del sprite SVG.
 * @param {string} iconId
 * @param {string} [className]
 * @returns {SVGElement}
 */
export function icon(iconId, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `assets/icons/sprite.svg#${iconId}`);
  svg.append(use);
  return svg;
}

/**
 * Vacía un contenedor sin dejar escuchadores huérfanos.
 * @param {HTMLElement} node
 */
export function clear(node) {
  node.replaceChildren();
}

/**
 * Retrasa la ejecución hasta que dejen de llegar llamadas.
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} wait
 * @returns {F}
 */
export function debounce(fn, wait) {
  let timer = 0;
  return /** @type {F} */ ((...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  });
}

/**
 * Atrapa el foco dentro de un contenedor (diálogos modales).
 * @param {HTMLElement} container
 * @returns {() => void} función para liberar el foco
 */
export function trapFocus(container) {
  const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
  const previous = document.activeElement;

  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const items = qsa(FOCUSABLE, container).filter((node) => node.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeydown);
  return () => {
    container.removeEventListener('keydown', onKeydown);
    if (previous instanceof HTMLElement) previous.focus();
  };
}

/** True si el usuario pidió reducir el movimiento. */
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
