/**
 * Visor de imagen con zoom.
 *
 * Zoom con rueda, doble clic y controles; arrastre para desplazar cuando la
 * imagen supera el encuadre. El tope está fijado a 3× a propósito: las
 * fotografías incrustadas en el PDF miden entre 200 y 360 px y ampliar más solo
 * mostraría píxeles. Cuando existan fotos en alta resolución en
 * `assets/products/`, el mismo visor las aprovechará sin tocar este código.
 *
 * @module ui/lightbox
 */

import { APP_CONFIG } from '../../config/app.config.js';
import { el, icon, trapFocus } from '../core/dom.js';

const MIN_ZOOM = 1;
const STEP = 0.5;

/** @type {HTMLElement|null} */
let current = null;

/**
 * Abre el visor sobre una imagen.
 * @param {string} src
 * @param {string} alt
 */
export function openLightbox(src, alt) {
  closeLightbox();

  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = null;

  const image = el('img', { class: 'lightbox__image', src, alt });
  const level = el('span', { class: 'lightbox__level', text: '100 %' });

  const apply = () => {
    zoom = Math.min(APP_CONFIG.ui.maxZoom, Math.max(MIN_ZOOM, zoom));
    if (zoom === MIN_ZOOM) { offsetX = 0; offsetY = 0; }
    image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
    image.style.cursor = zoom > MIN_ZOOM ? 'grab' : 'zoom-out';
    level.textContent = `${Math.round(zoom * 100)} %`;
  };

  const zoomBy = (delta) => { zoom += delta; apply(); };

  const controls = el('div', { class: 'lightbox__bar', onclick: (event) => event.stopPropagation() }, [
    el('button', {
      class: 'lightbox__button', type: 'button', 'aria-label': 'Alejar', onclick: () => zoomBy(-STEP)
    }, [icon('icon-zoom-out')]),
    level,
    el('button', {
      class: 'lightbox__button', type: 'button', 'aria-label': 'Acercar', onclick: () => zoomBy(STEP)
    }, [icon('icon-zoom-in')]),
    el('button', {
      class: 'lightbox__button', type: 'button', 'aria-label': 'Cerrar el visor', onclick: closeLightbox
    }, [icon('icon-close')])
  ]);

  const overlay = el('div', {
    class: 'lightbox',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `Imagen ampliada de ${alt}`,
    onclick: closeLightbox
  }, [image, controls]);

  image.addEventListener('click', (event) => {
    event.stopPropagation();
    zoomBy(zoom >= APP_CONFIG.ui.maxZoom ? -(zoom - MIN_ZOOM) : STEP);
  });

  overlay.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 0.25 : -0.25);
  }, { passive: false });

  image.addEventListener('pointerdown', (event) => {
    if (zoom <= MIN_ZOOM) return;
    event.preventDefault();
    dragging = { x: event.clientX - offsetX, y: event.clientY - offsetY };
    image.setPointerCapture(event.pointerId);
    image.style.cursor = 'grabbing';
  });

  image.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    offsetX = event.clientX - dragging.x;
    offsetY = event.clientY - dragging.y;
    image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
  });

  image.addEventListener('pointerup', () => {
    dragging = null;
    image.style.cursor = 'grab';
  });

  document.body.append(overlay);
  const release = trapFocus(overlay);
  current = overlay;
  overlay.dataset.release = 'true';
  overlay.releaseFocus = release;

  document.addEventListener('keydown', onKeydown);
  apply();
}

/** Cierra el visor si está abierto. */
export function closeLightbox() {
  if (!current) return;
  document.removeEventListener('keydown', onKeydown);
  current.releaseFocus?.();
  current.remove();
  current = null;
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    closeLightbox();
  }
}

/** @returns {boolean} */
export function isLightboxOpen() {
  return current !== null;
}
