/**
 * Exportación del catálogo.
 *
 * JSON para integrar con otros sistemas (ERP, tienda en línea, cotizador) y CSV
 * para abrir directamente en Excel, que es lo que de verdad usa un almacén.
 * Ambas exportan EXACTAMENTE lo que el usuario está viendo: si hay filtros
 * puestos, se exporta lo filtrado.
 *
 * @module features/exporter
 */

import { APP_CONFIG, MODE } from '../../config/app.config.js';

/**
 * Estructura serializable de un producto, sin campos internos de la interfaz.
 * @param {object} product
 * @returns {object}
 */
function toPlainProduct(product) {
  const plano = {
    codigo: product.code,
    nombre: product.name,
    categoria: product.category,
    marca: product.brandId,
    disponibilidad: product.stock,
    ficha_tecnica: Object.fromEntries(product.specs.map((spec) => [spec.key, spec.value])),
    notas: product.notes,
    detalles: product.details ?? [],
    pagina_pdf: product.page
  };

  // La exportación es otra puerta de salida de los precios. Si el catálogo no
  // los publica, el archivo descargado tampoco puede llevarlos.
  if (MODE.exportPrices) {
    plano.precio_sin_iva = product.priceNet;
    plano.precio_pvd = product.priceGross;
    // Si el precio se corrigió a mano, se conserva el del PDF para poder
    // auditar de dónde sale cada cifra.
    plano.precio_original_pdf = product.priceFromPdf ?? null;
  }
  return plano;
}

/**
 * Descarga el conjunto indicado como JSON.
 * @param {object[]} products
 * @param {object} [meta] Metadatos del catálogo de origen
 */
export function exportJson(products, meta = {}) {
  const payload = {
    empresa: APP_CONFIG.companyName,
    generado: new Date().toISOString(),
    origen: APP_CONFIG.pdfUrl,
    total: products.length,
    catalogo: meta,
    productos: products.map(toPlainProduct)
  };
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    fileName('json')
  );
}

/**
 * Descarga el conjunto indicado como CSV listo para Excel.
 * @param {object[]} products
 */
export function exportCsv(products) {
  const columnasPrecio = MODE.exportPrices ? ['P.V.D sin IVA', 'P.V.D', 'Precio ajustado'] : [];
  const header = ['Código', 'Nombre', 'Categoría', 'Marca', 'Disponibilidad',
    ...columnasPrecio, 'Ficha técnica'];

  const rows = products.map((product) => [
    product.code,
    product.name,
    product.category,
    product.brandId,
    product.stock ?? '',
    ...(MODE.exportPrices
      ? [product.priceNet ?? '', product.priceGross ?? '', product.priceFromPdf ? 'sí' : '']
      : []),
    product.specs.map((spec) => `${spec.key}: ${spec.value}`).join(' | ')
  ]);

  // El separador es el punto y coma: es lo que espera Excel en configuración
  // regional española, donde la coma es el separador decimal.
  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsv).join(';'))
    .join('\r\n');

  download(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), fileName('csv'));
}

/**
 * @param {*} value
 * @returns {string}
 */
function escapeCsv(value) {
  const text = String(value ?? '');
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {string} extension
 * @returns {string}
 */
function fileName(extension) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `catalogo-supra-${stamp}.${extension}`;
}

/**
 * @param {Blob} blob
 * @param {string} name
 */
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
