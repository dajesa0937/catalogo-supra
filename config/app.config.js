/**
 * Configuración general de la aplicación.
 * Único lugar donde se declaran rutas, identidad y datos de contacto.
 * @module config/app
 */

/**
 * Modo del catálogo. Es el interruptor que decide qué se publica.
 *
 *   'presentacion' — Pieza comercial para que los distribuidores la enseñen a
 *                    SUS clientes. Sin precios y sin vías de contacto directo:
 *                    un botón hacia Equipos Supra dejaría al distribuidor fuera
 *                    de su propia venta. La fuente se hornea en local
 *                    (`npm run generar`) y el PDF NO se publica.
 *
 *   'precios'      — Catálogo interno con los dos precios y contacto directo.
 *                    Lee el PDF en el navegador de cada visitante, lo que
 *                    obliga a publicar el PDF junto al sitio.
 *
 * Cambiar esta palabra reconfigura el catálogo entero. No hay que tocar nada más.
 */
export const CATALOG_MODE = 'presentacion';

/** Qué habilita cada modo. */
const MODES = Object.freeze({
  presentacion: Object.freeze({
    showPrices: false,
    showDirectContact: false,
    exportPrices: false,
    /** El PDF no se publica: los datos vienen ya horneados. */
    source: 'baked'
  }),
  precios: Object.freeze({
    showPrices: true,
    showDirectContact: true,
    exportPrices: true,
    source: 'pdf'
  })
});

/** Capacidades activas, derivadas del modo. */
export const MODE = MODES[CATALOG_MODE] ?? MODES.precios;

export const APP_CONFIG = Object.freeze({
  /** Nombre comercial mostrado en la interfaz. */
  companyName: 'Equipos Supra S.A.S.',
  shortName: 'Supra',
  tagline: 'Más que maquinaria, un compromiso con quienes hacen grande el campo',

  /** Ruta del PDF fuente. Solo se usa en modo 'precios' o al hornear en local. */
  pdfUrl: 'data/lista-precios.pdf',

  /**
   * Catálogo ya horneado. Es lo que se publica en modo 'presentacion': los
   * productos y sus fichas, sin precios y sin el PDF de origen.
   */
  bakedUrl: 'data/catalogo.json',

  /** Ruta de la librería PDF.js (versión vendorizada, sin CDN). */
  pdfWorkerUrl: 'vendor/pdfjs/pdf.worker.min.mjs',

  /**
   * Carpeta de imágenes en alta resolución opcionales.
   * Si existe `assets/products/<CODIGO>.webp`, sustituye a la imagen del PDF.
   */
  hdImageDir: 'assets/products/',
  hdImageExt: '.webp',

  /** Sobrescrituras declarativas de datos (correcciones, enriquecimiento). */
  overridesUrl: 'config/overrides.json',

  contact: Object.freeze({
    address: 'Calle 59 # 3A - 35, Ibagué, Tolima',
    phone: '+57 318 082 5116',
    whatsapp: '573180825116',
    email: 'administrativo@equipossupra.com',
    website: 'https://equipossupra.com'
  }),

  /** Configuración de la caché persistente. */
  cache: Object.freeze({
    dbName: 'supra-catalogo',
    dbVersion: 1,
    /** Fuerza un reparseo aunque el PDF no cambie (subir al cambiar el parser). */
    schemaVersion: 5
  }),

  /** Claves de LocalStorage (solo preferencias de usuario, nunca datos). */
  storageKeys: Object.freeze({
    favorites: 'supra:favorites',
    theme: 'supra:theme',
    priceMode: 'supra:price-mode',
    viewMode: 'supra:view-mode'
  }),

  /** Ajustes de la interfaz. */
  ui: Object.freeze({
    searchDebounceMs: 120,
    relatedProductsCount: 4,
    maxZoom: 3,
    gridChunkSize: 24
  })
});
