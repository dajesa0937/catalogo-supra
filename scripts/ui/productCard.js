/**
 * Tarjeta de producto.
 *
 * La imagen se carga de forma diferida con un `IntersectionObserver` compartido
 * por toda la retícula: con ochenta productos y sus miniaturas en IndexedDB, no
 * tiene sentido crear ochenta URLs de objeto para las que caben en pantalla.
 *
 * @module ui/productCard
 */

import { el, icon } from '../core/dom.js';
import { currency } from '../core/format.js';
import { getImageUrl } from '../data/catalogRepository.js';
import { isFavorite, toggleFavorite } from '../features/favorites.js';
import { BRANDS } from '../../config/taxonomy.config.js';
import { toast } from './toast.js';

/** Observador único para todas las imágenes de la retícula. */
const imageObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    imageObserver.unobserve(entry.target);
    hydrateImage(entry.target);
  }
}, { rootMargin: '250px 0px' });

/**
 * Resuelve y asigna la imagen de un `<img>` marcado con `data-code`.
 * @param {HTMLImageElement} image
 */
async function hydrateImage(image) {
  const url = await getImageUrl(image.dataset.code);
  if (!url) {
    image.closest('.card__media')?.classList.add('card__media--empty');
    image.remove();
    return;
  }
  image.src = url;
  if (image.complete) image.dataset.loaded = 'true';
  else image.addEventListener('load', () => { image.dataset.loaded = 'true'; }, { once: true });
}

/**
 * Crea un `<img>` diferido para un producto.
 * @param {object} product
 * @param {string} className
 * @returns {HTMLImageElement}
 */
export function lazyImage(product, className) {
  const image = el('img', {
    class: className,
    alt: `${product.name} · referencia ${product.code}`,
    loading: 'lazy',
    decoding: 'async',
    dataset: { code: product.code }
  });
  imageObserver.observe(image);
  return image;
}

/**
 * Construye la tarjeta de un producto.
 *
 * @param {object} product
 * @param {'gross'|'net'} priceMode
 * @returns {HTMLElement}
 */
export function productCard(product, priceMode) {
  const brand = BRANDS.find((item) => item.id === product.brandId);
  const primary = priceMode === 'net' ? product.priceNet : product.priceGross;
  const secondary = priceMode === 'net' ? product.priceGross : product.priceNet;

  const favButton = el('button', {
    class: 'card__fav',
    type: 'button',
    'aria-pressed': String(isFavorite(product.code)),
    'aria-label': `Guardar ${product.name} en favoritos`,
    onclick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      const active = toggleFavorite(product.code);
      favButton.setAttribute('aria-pressed', String(active));
      toast(active ? 'Añadido a favoritos' : 'Quitado de favoritos', 'icon-heart');
    }
  }, [icon('icon-heart')]);

  const media = el('div', { class: 'card__media' }, [
    brand && el('span', { class: 'card__brand', style: `--chip-color:${brand.color}` }, [brand.name]),
    lazyImage(product, 'card__image'),
    favButton
  ]);

  const text = el('div', { class: 'card__text' }, [
    el('div', { class: 'card__code', text: product.code }),
    el('h3', { class: 'card__name' }, [
      el('a', { class: 'card__link', href: `#/producto/${encodeURIComponent(product.code)}` }, [product.name])
    ]),
    product.summary && el('p', { class: 'card__summary clamp-2', text: product.summary })
  ]);

  const footer = el('div', { class: 'card__footer' }, [
    el('div', { class: 'price' }, [
      el('span', { class: 'price__label', text: priceMode === 'net' ? 'P.V.D sin IVA' : 'P.V.D' }),
      el('span', { class: 'price__value', text: currency(primary) }),
      secondary && el('span', {
        class: 'price__alt',
        text: priceMode === 'net' ? `${currency(secondary)} con IVA` : `${currency(secondary)} sin IVA`
      })
    ]),
    el('span', { class: 'card__cta' }, ['Ver ficha', icon('icon-arrow-right')])
  ]);

  return el('article', { class: 'card', dataset: { code: product.code } }, [
    media,
    el('div', { class: 'card__body' }, [text, footer])
  ]);
}
