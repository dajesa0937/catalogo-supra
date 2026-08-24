/**
 * Notificaciones efímeras. Confirman una acción sin interrumpir el trabajo.
 * @module ui/toast
 */

import { el, icon, qs } from '../core/dom.js';
import { on, EVENTS } from '../core/eventBus.js';

const DURATION = 2600;

/**
 * Muestra una notificación.
 * @param {string} message
 * @param {string} [iconId]
 */
export function toast(message, iconId = 'icon-check') {
  const container = qs('#toasts');
  if (!container) return;

  const node = el('div', { class: 'toast', role: 'status' }, [
    icon(iconId),
    el('span', { text: message })
  ]);

  container.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    node.style.transition = 'opacity 200ms, transform 200ms';
    setTimeout(() => node.remove(), 220);
  }, DURATION);
}

/** Conecta el bus de eventos con las notificaciones. */
export function initToasts() {
  on(EVENTS.TOAST, ({ message, icon: iconId }) => toast(message, iconId));
}
