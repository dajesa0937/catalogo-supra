/**
 * Modo claro / oscuro.
 *
 * Tres estados, no dos: `light`, `dark` y `system`. El estado por defecto es
 * `system`, que sigue la preferencia del sistema operativo y reacciona en
 * caliente si el usuario la cambia mientras el catálogo está abierto.
 *
 * @module features/theme
 */

import { APP_CONFIG } from '../../config/app.config.js';
import { emit, EVENTS } from '../core/eventBus.js';

const KEY = APP_CONFIG.storageKeys.theme;
const media = window.matchMedia('(prefers-color-scheme: dark)');

/** @type {'light'|'dark'|'system'} */
let preference = readPreference();

/**
 * @returns {'light'|'dark'|'system'}
 */
function readPreference() {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Aplica la preferencia vigente al documento. */
function apply() {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  emit(EVENTS.THEME_CHANGED, { preference, resolved: getResolvedTheme() });
}

/** Inicializa el módulo y engancha el seguimiento del sistema. */
export function initTheme() {
  apply();
  media.addEventListener('change', () => {
    if (preference === 'system') apply();
  });
}

/** @returns {'light'|'dark'|'system'} */
export function getPreference() {
  return preference;
}

/** @returns {'light'|'dark'} el tema realmente visible */
export function getResolvedTheme() {
  if (preference !== 'system') return preference;
  return media.matches ? 'dark' : 'light';
}

/**
 * Alterna entre claro y oscuro partiendo de lo que se está viendo.
 * @returns {'light'|'dark'}
 */
export function toggleTheme() {
  const next = getResolvedTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * @param {'light'|'dark'|'system'} value
 */
export function setTheme(value) {
  preference = value;
  try {
    if (value === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // Sin almacenamiento el tema dura lo que dure la sesión.
  }
  apply();
}
