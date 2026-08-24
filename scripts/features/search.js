/**
 * Búsqueda instantánea sobre el catálogo.
 *
 * Con ochenta productos no hace falta un índice invertido: un recorrido lineal
 * sobre un texto ya normalizado resuelve en menos de un milisegundo. Lo que sí
 * importa es la CALIDAD del orden, porque quien busca en un mostrador escribe
 * medio código o media palabra y espera lo suyo arriba del todo.
 *
 * @module features/search
 */

import { normalize, tokenize } from '../core/text.js';

/**
 * Peso de cada tipo de coincidencia. Cuanto mayor, más arriba aparece.
 *
 * Los tres primeros se evalúan sobre la CONSULTA COMPLETA, no sobre sus
 * palabras sueltas, y por eso pesan tanto: los códigos de Supra llevan guiones
 * y barras ("SPS-260", "SWP-F20/20AH"), de modo que trocear la consulta haría
 * que "SPS-260" puntuase igual para SPS-260 que para SPS-260A/210. Buscar una
 * referencia exacta y que salga segunda es, en un mostrador, un error grave.
 */
const SCORE = Object.freeze({
  exactCode: 2000,
  codeStartsWithQuery: 900,
  nameContainsQuery: 320,
  codePrefix: 600,
  codeContains: 300,
  nameStart: 200,
  nameContains: 120,
  categoryContains: 60,
  specContains: 25
});

/**
 * Filtra y puntúa productos contra una consulta de texto.
 *
 * @param {object[]} products
 * @param {string} query
 * @returns {object[]} coincidencias ordenadas por relevancia
 */
export function search(products, query) {
  const terms = tokenize(query);
  if (terms.length === 0) return products;

  const phrase = normalize(query);
  const scored = [];
  for (const product of products) {
    const score = scoreProduct(product, terms, phrase);
    if (score > 0) scored.push({ product, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, 'es'))
    .map((entry) => entry.product);
}

/**
 * Puntúa un producto. Devuelve 0 si algún término no aparece en ningún campo:
 * la búsqueda es conjuntiva, que es lo que el usuario espera al añadir palabras.
 *
 * @param {object} product
 * @param {string[]} terms
 * @param {string} phrase Consulta completa normalizada
 * @returns {number}
 */
function scoreProduct(product, terms, phrase) {
  const code = normalize(product.code);
  const name = normalize(product.name);
  const category = normalize(product.category);
  let total = 0;

  // Coincidencias sobre la consulta completa: son las que deciden el primer
  // puesto cuando alguien teclea una referencia entera.
  if (code === phrase) total += SCORE.exactCode;
  else if (code.startsWith(phrase)) total += SCORE.codeStartsWithQuery;
  if (name.includes(phrase)) total += SCORE.nameContainsQuery;

  for (const term of terms) {
    let best = 0;
    if (code === term) best = SCORE.exactCode;
    else if (code.startsWith(term)) best = SCORE.codePrefix;
    else if (code.includes(term)) best = SCORE.codeContains;

    if (name.startsWith(term)) best = Math.max(best, SCORE.nameStart);
    else if (name.includes(term)) best = Math.max(best, SCORE.nameContains);

    if (category.includes(term)) best = Math.max(best, SCORE.categoryContains);
    if (best === 0 && product.searchText.includes(term)) best = SCORE.specContains;

    if (best === 0) return 0;          // término no encontrado: no es coincidencia
    total += best;
  }

  return total;
}

/**
 * Sugerencias para el desplegable de búsqueda: los códigos y nombres más
 * próximos a lo tecleado.
 *
 * @param {object[]} products
 * @param {string} query
 * @param {number} [limit]
 * @returns {object[]}
 */
export function suggest(products, query, limit = 6) {
  return search(products, query).slice(0, limit);
}
