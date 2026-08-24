/**
 * Caché persistente del catálogo en IndexedDB.
 *
 * Por qué IndexedDB y no LocalStorage
 * -----------------------------------
 * LocalStorage tiene un tope de unos 5 MB, solo guarda cadenas y escribe de
 * forma síncrona bloqueando el hilo principal. Las ochenta fotografías del
 * catálogo, codificadas en base64, lo desbordarían. IndexedDB es asíncrona,
 * almacena `Blob` binarios sin convertir y dispone de cientos de MB.
 * LocalStorage se reserva para lo que le corresponde: las preferencias del
 * usuario (favoritos, tema, modo de precio), que ocupan bytes.
 *
 * Invalidación: se guarda la huella del PDF (tamaño + fecha de modificación).
 * Si al arrancar la huella coincide, se sirve la caché; si no, se reparsea.
 * Reemplazar el PDF publicado actualiza el catálogo sin tocar el código.
 *
 * @module data/cacheService
 */

import { APP_CONFIG } from '../../config/app.config.js';

const STORE_META = 'meta';
const STORE_CATALOG = 'catalog';
const STORE_IMAGES = 'images';
const META_KEY = 'current';

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

/**
 * Abre (y si hace falta crea) la base de datos.
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const { dbName, dbVersion } = APP_CONFIG.cache;
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of [STORE_META, STORE_CATALOG, STORE_IMAGES]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * Envuelve una transacción en una promesa.
 * @template T
 * @param {string[]} stores
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => T | Promise<T>} work
 * @returns {Promise<T>}
 */
async function transact(stores, mode, work) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    Promise.resolve(work(tx)).then((value) => { result = value; }, reject);
  });
}

/**
 * Convierte una petición IndexedDB en promesa.
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function toPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @typedef {object} CacheMeta
 * @property {string} fingerprint    Huella del PDF con la que se generó
 * @property {number} schemaVersion  Versión del parser
 * @property {number} builtAt        Marca de tiempo de la construcción
 * @property {number} productCount
 */

/**
 * ¿Sirve la caché para esta huella de PDF?
 * @param {string} fingerprint
 * @returns {Promise<CacheMeta|null>} los metadatos si es válida, `null` si no
 */
export async function readValidMeta(fingerprint) {
  try {
    const meta = await transact([STORE_META], 'readonly', (tx) =>
      toPromise(tx.objectStore(STORE_META).get(META_KEY)));
    if (!meta) return null;
    if (meta.schemaVersion !== APP_CONFIG.cache.schemaVersion) return null;
    if (fingerprint !== 'desconocida' && meta.fingerprint !== fingerprint) return null;
    return meta;
  } catch {
    return null;                       // sin IndexedDB se reparsea y punto
  }
}

/**
 * Lee el catálogo almacenado.
 * @returns {Promise<{products: object[], categories: object[], warnings: string[]}|null>}
 */
export async function readCatalog() {
  try {
    return await transact([STORE_CATALOG], 'readonly', (tx) =>
      toPromise(tx.objectStore(STORE_CATALOG).get('data')));
  } catch {
    return null;
  }
}

/**
 * Lee la imagen de un producto.
 * @param {string} code
 * @returns {Promise<Blob|null>}
 */
export async function readImage(code) {
  try {
    return await transact([STORE_IMAGES], 'readonly', (tx) =>
      toPromise(tx.objectStore(STORE_IMAGES).get(code)));
  } catch {
    return null;
  }
}

/**
 * Guarda el catálogo completo, sustituyendo cualquier versión anterior.
 *
 * @param {object} catalog          Productos, categorías y diagnóstico
 * @param {Map<string, Blob>} images Imagen por código de producto
 * @param {CacheMeta} meta
 * @returns {Promise<boolean>} `false` si el navegador no permitió guardar
 */
export async function writeCatalog(catalog, images, meta) {
  try {
    await transact([STORE_META, STORE_CATALOG, STORE_IMAGES], 'readwrite', (tx) => {
      tx.objectStore(STORE_CATALOG).clear();
      tx.objectStore(STORE_IMAGES).clear();
      tx.objectStore(STORE_CATALOG).put(catalog, 'data');
      for (const [code, blob] of images) tx.objectStore(STORE_IMAGES).put(blob, code);
      tx.objectStore(STORE_META).put(meta, META_KEY);
    });
    return true;
  } catch (error) {
    console.warn('[cache] no se pudo guardar el catálogo', error);
    return false;
  }
}

/**
 * Borra la caché por completo. Expuesto en la interfaz para forzar una
 * relectura del PDF sin tener que limpiar los datos del navegador a mano.
 * @returns {Promise<void>}
 */
export async function clearCache() {
  try {
    await transact([STORE_META, STORE_CATALOG, STORE_IMAGES], 'readwrite', (tx) => {
      tx.objectStore(STORE_META).clear();
      tx.objectStore(STORE_CATALOG).clear();
      tx.objectStore(STORE_IMAGES).clear();
    });
  } catch (error) {
    console.warn('[cache] no se pudo limpiar la caché', error);
  }
}
