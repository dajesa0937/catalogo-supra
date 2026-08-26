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

import { APP_CONFIG, MODE } from '../../config/app.config.js';
import { BRANDS, STOCK_STATES, DEFAULT_STOCK } from '../../config/taxonomy.config.js';
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
  const stock = STOCK_STATES[product.stock] ?? STOCK_STATES[DEFAULT_STOCK];
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
      brand && el('span', { class: 'label', text: `${brand.name} · ${brand.tier}` }),
      stock.badge && el('span', { class: `stock-badge stock-badge--${stock.tone}`, text: stock.label })
    ]),
    el('h1', { class: 'detail__name', text: product.name }),
    stock.note && el('p', { class: `detail__note detail__note--${stock.tone}` },
      [icon('icon-alert'), stock.note]),
    MODE.showPrices ? priceBlock(product) : enquireBlock(),
    product.specs.length > 0 && el('section', {}, [
      el('p', { class: 'label', style: 'margin-bottom:var(--s-2)', text: 'Ficha técnica' }),
      el('div', { class: 'specs' }, product.specs.map((spec) => el('div', { class: 'specs__row' }, [
        el('span', { class: 'specs__key', text: spec.key }),
        el('span', { class: 'specs__value', text: spec.value })
      ])))
    ]),
    product.notes.length > 0 && el('div', { class: 'detail__notes' },
      product.notes.map((note) => el('p', { class: 'detail__note' }, [icon('icon-alert'), note]))),
    product.details?.length > 0 && el('ul', { class: 'detail__details' },
      product.details.map((detail) => el('li', { text: detail }))),
    el('div', { class: 'detail__actions' }, [
      favButton,
      // El botón de contacto solo existe en el catálogo interno. En modo
      // presentación lo enseña un distribuidor a SU cliente: un enlace directo
      // a Equipos Supra lo dejaría fuera de su propia venta.
      MODE.showDirectContact && el('a', {
        class: 'button button--primary',
        href: whatsappLink(product, stock),
        target: '_blank',
        rel: 'noopener'
      }, [icon('icon-whatsapp'), 'Consultar por WhatsApp'])
    ]),
    // Referencia a la página del documento oficial: le sirve a quien lo tiene
    // delante para contrastar. Al cliente de un distribuidor no le dice nada, y
    // además le anuncia la existencia de una lista de precios que no debe pedir.
    MODE.showPrices && el('p', { class: 'label', text: `Página ${product.page} de la lista de precios oficial` })
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
 * Sustituto del bloque de precios en modo presentación. Ocupa su sitio a
 * propósito: un hueco vacío se lee como una web incompleta, y el catálogo debe
 * parecer lo que es, una decisión y no una carencia.
 * @returns {HTMLElement}
 */
function enquireBlock() {
  return el('div', { class: 'detail__enquire' }, [
    el('span', { class: 'price__label', text: 'Precio' }),
    el('span', { class: 'detail__enquire-value', text: 'Bajo consulta' }),
    el('span', { class: 'detail__enquire-note', text: 'Consulta el precio con tu distribuidor Supra.' })
  ]);
}

/**
 * Productos relacionados: misma categoría y, si esa categoría tiene una sola
 * referencia, de la misma línea de producto.
 *
 * El titular se ajusta a lo que de verdad se está mostrando. Anunciar "también
 * en esta categoría" sobre productos de otra categoría es una mentira pequeña,
 * pero de las que hacen dudar del resto de la ficha.
 *
 * @param {object} product
 * @returns {HTMLElement|null}
 */
function relatedSection(product) {
  const related = findRelated(product);
  if (related.length === 0) return null;

  const mismaCategoria = related.every((item) => item.categoryId === product.categoryId);

  return el('section', { class: 'related' }, [
    el('p', { class: 'label', text: mismaCategoria ? 'También en esta categoría' : 'También te puede interesar' }),
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
        MODE.showPrices && el('span', { class: 'related__price', text: currency(item.priceGross) })
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
function whatsappLink(product, stock) {
  // El texto se adapta al estado: preguntar por un producto agotado como si
  // estuviera disponible hace perder tiempo a las dos partes.
  const intent = stock?.inquiry ?? 'quisiera información sobre';
  const message = `Hola, ${intent} ${product.name} (referencia ${product.code}).`;
  return `https://wa.me/${APP_CONFIG.contact.whatsapp}?text=${encodeURIComponent(message)}`;
}
