/**
 * Criterios de ordenación del catálogo.
 * @module features/sorting
 */

/** Comparador de textos en español (respeta tildes y la ñ). */
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * Opciones ofrecidas en la interfaz, en el orden en que se muestran.
 */
export const SORT_OPTIONS = Object.freeze([
  { id: 'relevance', label: 'Orden del catálogo' },
  { id: 'name-asc', label: 'Nombre · A-Z' },
  { id: 'name-desc', label: 'Nombre · Z-A' },
  { id: 'price-asc', label: 'Precio · menor a mayor' },
  { id: 'price-desc', label: 'Precio · mayor a menor' }
]);

/**
 * Ordena una lista de productos.
 *
 * @param {object[]} products
 * @param {string} sort         Identificador de `SORT_OPTIONS`
 * @param {'gross'|'net'} priceMode Precio sobre el que ordenar
 * @returns {object[]} una lista nueva; no muta la original
 */
export function sortProducts(products, sort, priceMode = 'gross') {
  const priceOf = (product) =>
    (priceMode === 'net' ? product.priceNet ?? product.priceGross : product.priceGross ?? product.priceNet)
    ?? Number.POSITIVE_INFINITY;

  const copy = [...products];

  switch (sort) {
    case 'name-asc':
      return copy.sort((a, b) => collator.compare(a.name, b.name));
    case 'name-desc':
      return copy.sort((a, b) => collator.compare(b.name, a.name));
    case 'price-asc':
      return copy.sort((a, b) => priceOf(a) - priceOf(b));
    case 'price-desc':
      return copy.sort((a, b) => priceOf(b) - priceOf(a));
    default:
      return copy;                     // orden del PDF: categoría a categoría
  }
}
