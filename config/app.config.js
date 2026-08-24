/**
 * Configuración general de la aplicación.
 * Único lugar donde se declaran rutas, identidad y datos de contacto.
 * @module config/app
 */

export const APP_CONFIG = Object.freeze({
  /** Nombre comercial mostrado en la interfaz. */
  companyName: 'Equipos Supra S.A.S.',
  shortName: 'Supra',
  tagline: 'Más que maquinaria, un compromiso con quienes hacen grande el campo',

  /** Ruta del PDF fuente. Reemplazar ESTE archivo actualiza todo el catálogo. */
  pdfUrl: 'data/lista-precios.pdf',

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
    schemaVersion: 4
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
