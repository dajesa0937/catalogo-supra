/**
 * Taxonomía del catálogo: marcas propias, iconografía por familia de producto
 * y normalización de nombres de categoría.
 *
 * Supra, Reload y Mechanics Pro son las tres líneas de producto de la misma
 * empresa (profesional, semiprofesional e industrial respectivamente), por lo
 * que la marca es un filtro comercial real y no una etiqueta decorativa.
 *
 * @module config/taxonomy
 */

/**
 * Marcas reconocidas. El orden importa: se evalúan de arriba a abajo y gana
 * la primera cuyo patrón aparezca en el nombre o la descripción del producto.
 */
export const BRANDS = Object.freeze([
  Object.freeze({
    id: 'reload',
    name: 'Reload',
    color: '#BF002B',
    tier: 'Semiprofesional',
    match: /\bRELOAD\b/i
  }),
  Object.freeze({
    id: 'mechanics-pro',
    name: 'Mechanics Pro',
    color: '#EC6D26',
    tier: 'Industrial',
    match: /\bMECHANICS(\s+PRO)?\b/i
  }),
  Object.freeze({
    id: 'supra',
    name: 'Supra',
    color: '#EC6D26',
    tier: 'Profesional',
    match: /\bSUPRA\b/i
  })
]);

/** Marca asignada cuando el texto no menciona ninguna explícitamente. */
export const DEFAULT_BRAND_ID = 'supra';

/**
 * Icono por familia de producto. La clave se busca como subcadena dentro del
 * nombre normalizado de la categoría; gana la primera coincidencia.
 * Los identificadores corresponden a los símbolos de `assets/icons/sprite.svg`.
 */
export const CATEGORY_ICONS = Object.freeze([
  ['hidrolavadora', 'icon-pressure'],
  ['motobomba', 'icon-pump'],
  ['bomba', 'icon-pump'],
  ['kit bombas', 'icon-pump'],
  ['fumigad', 'icon-spray'],
  ['manguera', 'icon-hose'],
  ['desbrozadora', 'icon-trimmer'],
  ['cortaseto', 'icon-trimmer'],
  ['motosierra', 'icon-chainsaw'],
  ['ahoyadora', 'icon-auger'],
  ['sopladora', 'icon-blower'],
  ['motoazada', 'icon-tiller'],
  ['motor', 'icon-engine']
]);

export const DEFAULT_CATEGORY_ICON = 'icon-gear';

/**
 * Correcciones ortográficas heredadas del PDF original.
 * Se aplican solo a las CLAVES de la ficha técnica, nunca a los valores,
 * para no alterar cifras ni referencias técnicas.
 */
export const SPEC_KEY_FIXES = Object.freeze({
  'comsumo combustible': 'Consumo de combustible',
  'rotacion maxima': 'Rotación máxima',
  'presion maxima': 'Presión máxima',
  'potencia maxima': 'Potencia máxima',
  'diametro del eje': 'Diámetro del eje',
  'sistema encendido': 'Sistema de encendido',
  'acceorios': 'Accesorios',
  'accesorios': 'Accesorios',
  'capacidad combustible': 'Capacidad de combustible',
  'capacidad aceite': 'Capacidad de aceite',
  'tamaño del embalaje': 'Tamaño del embalaje',
  'el émbolo no. y dia': 'Émbolo (n.º y diámetro)',
  'el embolo no. y dia': 'Émbolo (n.º y diámetro)',
  'tipo bomba': 'Tipo de bomba',
  'potencia requerida': 'Potencia requerida',
  'sello mecanico': 'Sello mecánico',
  'filtro de aire': 'Filtro de aire',
  'cilindrada': 'Cilindrada',
  'presión': 'Presión',
  'presion': 'Presión',
  'flujo': 'Flujo',
  'peso': 'Peso',
  'color': 'Color',
  'caudal': 'Caudal',
  'rpm': 'RPM',
  'lonas': 'Lonas',
  'carburador': 'Carburador'
});

/**
 * Restitución de tildes perdidas en el PDF original. Se aplica palabra a
 * palabra sobre nombres de producto y de categoría, nunca sobre valores
 * técnicos, para no alterar referencias ni cifras.
 */
export const WORD_FIXES = Object.freeze({
  fumigacion: 'fumigación',
  presion: 'presión',
  diesel: 'diésel',
  rigido: 'rígido',
  canon: 'cañón',
  'cañon': 'cañón',
  hidrolavadora: 'hidrolavadora',
  piston: 'pistón',
  ceramica: 'cerámica',
  automatico: 'automático',
  hidraulico: 'hidráulico',
  electrico: 'eléctrico',
  gasolina: 'gasolina',
  mantenimiento: 'mantenimiento',
  succion: 'succión',
  aluminio: 'aluminio',
  multifuncional: 'multifuncional',
  portatil: 'portátil',
  bateria: 'batería',
  escualizable: 'escualizable',
  estandar: 'estándar',
  maxima: 'máxima',
  numero: 'número'
});

/**
 * Estados de disponibilidad.
 *
 * Se asignan desde `config/overrides.json` (campo `stock`) y son independientes
 * de la lista de precios: el PDF dice qué existe y cuánto vale, no si queda
 * inventario. Un producto agotado SIGUE en el catálogo, con distintivo: el
 * vendedor necesita poder encontrarlo y decirle al cliente que no hay, no que
 * la referencia se haya esfumado como si nunca hubiera existido.
 *
 * Para añadir un estado nuevo basta con una entrada más aquí.
 */
export const STOCK_STATES = Object.freeze({
  disponible: Object.freeze({
    label: 'Disponible',
    tone: 'ok',
    /** Sin distintivo: es el estado normal y no merece ruido visual. */
    badge: false
  }),
  agotado: Object.freeze({
    label: 'Agotado',
    tone: 'danger',
    badge: true,
    note: 'Sin existencias en este momento. Consulta el tiempo de reposición.',
    /** Mensaje de WhatsApp adaptado al estado. */
    inquiry: 'quisiera saber cuándo tendrán disponible'
  }),
  'bajo-pedido': Object.freeze({
    label: 'Bajo pedido',
    tone: 'warn',
    badge: true,
    note: 'No se mantiene en inventario: se trae bajo pedido.',
    inquiry: 'quisiera cotizar bajo pedido'
  })
});

/** Estado asignado a todo producto que no lo declare explícitamente. */
export const DEFAULT_STOCK = 'disponible';

/**
 * Claves de ficha técnica destacadas en la tarjeta de producto,
 * por orden de prioridad. La primera que exista se muestra como resumen.
 */
export const HIGHLIGHT_SPEC_KEYS = Object.freeze([
  'Potencia máxima',
  'Cilindrada',
  'Presión',
  'Flujo',
  'Caudal',
  'Potencia requerida',
  'Tipo',
  'Peso'
]);
