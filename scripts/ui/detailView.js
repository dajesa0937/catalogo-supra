/**
 * Ficha de producto: imagen grande, ficha técnica completa, ambos precios,
 * notas comerciales y productos relacionados.
 *
 * Se monta como panel modal sobre el catálogo en lugar de como página aparte,
 * de modo que cerrarla devuelve al usuario exactamente donde estaba, sin
 * recargar ni perder la posición de desplazamiento.
 *
 * @module ui/detailView
 */

import { APP_CONFIG } from '../../config/app.config.js';
import { BRANDS } from '../../config/taxonomy.config.js';
import { el, icon, qs, trapFocus } from '../core/dom.js';
import { currency } from '../core/format.js';
import { findRelated, getImageUrl } from '../data/catalogRepository.js';
import { isFavorite, toggleFavorite } from '../features/favorites.js';
import { closeProduct } from '../features/router.js';
import { openLightbox, closeLightbox, isLightboxOpen } from './lightbox.js';
import { toast } from './toast.js';

/** @type {{node: HTMLElement, release: () => void}|null} */
let open = null;

/**
 * Muestra la ficha de un producto.
 * @param {object} product
 */
export async function showDetail(product) {
  closeDetail();

  const brand = BRANDS.find((item) => item.id === product.brandId);
  const imageUrl = await getImageUrl(product.code);

  const image = imageUrl
    ? el('img', {
        class: 'detail__image',
        src: imageUrl,
        alt: `${product.name} · referencia ${product.code}`,
        onclick: () => openLightbox(imageUrl, product.name)
      })
    : el('p', { class: 'faint', text: 'Este producto todavía no tiene fotografía en la lista de precios.' });

  const media = el('div', { class: 'detail__media' }, [
    image,
    imageUrl && el('span', { class: 'detail__zoom-hint' }, [icon('icon-zoom-in'), 'Clic para ampliar'])
  ]);

  const favButton = el('button', {
    class: 'button',
    type: 'button',
    'aria-pressed': String(isFavorite(product.code)),
    onclick: () => {
      const active = toggleFavorite(product.code);
      favButton.setAttribute('aria-pressed', String(active));
      qs('span', favButton).textContent = active ? 'En favoritos' : 'Guardar';
      toast(active ? 'Añadido a favoritos' : 'Quitado de favoritos', 'icon-heart');
    }
  }, [icon('icon-heart'), el('span', { text: isFavorite(product.code) ? 'En favoritos' : 'Guardar' })]);

  const info = el('div', { class: 'detail__info' }, [
    el('div', { class: 'detail__eyebrow' }, [
      el('span', { class: 'detail__code', text: product.code }),
      brand && el('span', { class: 'label', text: `${brand.name} · ${brand.tier}` })
    ]),
    el('h1', { class: 'detail__name', text: product.name }),
    priceBlock(product),
    product.specs.length > 0 && el('section', {}, [
      el('p', { class: 'label', style: 'margin-bottom:var(--s-2)', text: 'Ficha técnica' }),
      el('div', { class: 'specs' }, product.specs.map((spec) => el('div', { class: 'specs__row' }, [
        el('span', { class: 'specs__key', text: spec.key }),
        el('span', { class: 'specs__value', text: spec.value })
      ])))
    ]),
    product.notes.length > 0 && el('div', { class: 'detail__notes' },
      product.notes.map((note) => el('p', { class: 'detail__note' }, [icon('icon-alert'), note]))),
    el('div', { class: 'detail__actions' }, [
      favButton,
      el('a', {
        class: 'button button--primary',
        href: whatsappLink(product),
        target: '_blank',
        rel: 'noopener'
      }, [icon('icon-whatsapp'), 'Consultar por WhatsApp'])
    ]),
    el('p', { class: 'label', text: `Página ${product.page} de la lista de precios oficial` })
  ]);

  const panel = el('div', {
    class: 'detail__panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `Ficha de ${product.name}`
  }, [
    el('div', { class: 'detail__bar' }, [
      el('button', { class: 'detail__back', type: 'button', onclick: closeProduct },
        [icon('icon-arrow-left'), 'Volver al catálogo']),
      el('span', { class: 'detail__breadcrumb', text: product.category }),
      el('div', { class: 'detail__bar-actions' }, [
        el('button', {
          class: 'header__action', type: 'button', 'aria-label': 'Cerrar la ficha', onclick: closeProduct
        }, [icon('icon-close')])
      ])
    ]),
    el('div', { class: 'detail__content' }, [media, info, relatedSection(product)])
  ]);

  const overlay = el('div', { class: 'detail' }, [
    el('div', { class: 'detail__scrim', onclick: closeProduct }),
    panel
  ]);

  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  const release = trapFocus(panel);
  open = { node: overlay, release };

  qs('.detail__back', panel)?.focus();
  document.addEventListener('keydown', onKeydown);
}

/** Cierra la ficha si está abierta. */
export function closeDetail() {
  closeLightbox();
  if (!open) return;
  document.removeEventListener('keydown', onKeydown);
  open.release();
  open.node.remove();
  document.body.style.overflow = '';
  open = null;
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key === 'Escape' && !isLightboxOpen()) closeProduct();
}

/**
 * Los dos precios, siempre visibles y etiquetados sin ambigüedad.
 * @param {object} product
 * @returns {HTMLElement}
 */
function priceBlock(product) {
  return el('div', { class: 'detail__prices' }, [
    el('div', { class: 'detail__price', dataset: { primary: 'true' } }, [
      el('span', { class: 'price__label', text: 'P.V.D · precio público' }),
      el('span', { class: 'price__value', text: currency(product.priceGross) })
    ]),
    el('div', { class: 'detail__price' }, [
      el('span', { class: 'price__label', text: 'P.V.D sin IVA · distribuidor' }),
      el('span', { class: 'price__value', text: currency(product.priceNet) })
    ])
  ]);
}

/**
 * Productos relacionados: misma categoría, precio cercano.
 * @param {object} product
 * @returns {HTMLElement|null}
 */
function relatedSection(product) {
  const related = findRelated(product);
  if (related.length === 0) return null;

  return el('section', { class: 'related' }, [
    el('p', { class: 'label', text: 'También en esta categoría' }),
    el('div', { class: 'related__grid' }, related.map((item) => {
      const thumb = el('img', {
        class: 'related__thumb',
        alt: item.name,
        loading: 'lazy'
      });
      getImageUrl(item.code).then((url) => { if (url) thumb.src = url; });

      return el('a', {
        class: 'related__item',
        href: `#/producto/${encodeURIComponent(item.code)}`
      }, [
        thumb,
        el('span', { class: 'code faint', text: item.code }),
        el('span', { class: 'related__name clamp-2', text: item.name }),
        el('span', { class: 'related__price', text: currency(item.priceGross) })
      ]);
    }))
  ]);
}

/**
 * Enlace de WhatsApp con la consulta ya redactada. Es la vía real por la que un
 * distribuidor colombiano pide precio y disponibilidad.
 * @param {object} product
 * @returns {string}
 */
function whatsappLink(product) {
  const message = `Hola, quisiera información sobre ${product.name} (referencia ${product.code}).`;
  return `https://wa.me/${APP_CONFIG.contact.whatsapp}?text=${encodeURIComponent(message)}`;
}
