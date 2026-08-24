/**
 * Perfil de extracción del PDF de lista de precios.
 *
 * Toda la fragilidad posible del proyecto está concentrada aquí. Si Equipos Supra
 * rediseña la lista de precios, este archivo es lo único que debería cambiar:
 * el resto del código no contiene ni una sola constante de layout.
 *
 * Las columnas se expresan en puntos PDF (1/72") sobre una página carta (612 × 792).
 * Los tamaños de fuente NO se expresan en absoluto sino como múltiplos del tamaño
 * modal de la columna de descripción, medido página a página. Así el parser sigue
 * funcionando si el documento se genera con otro cuerpo de texto.
 *
 * @module config/parser
 */

export const PARSER_CONFIG = Object.freeze({
  /** Páginas ignoradas por completo (portada y contraportadas). */
  skipPages: Object.freeze({ leading: 1, trailing: 2 }),

  /**
   * Límites horizontales de cada columna de la tabla, en puntos PDF.
   * Medidos sobre la fila de encabezado real: Item No. (87) · Imagen (173) ·
   * Descripción (258–314) · P.V.D sin IVA (425) · P.V.D (484).
   */
  columns: Object.freeze({
    codeMaxX: 140,
    descMinX: 140,
    descMaxX: 405,
    priceNetMaxX: 470
  }),

  /**
   * Umbrales de tamaño de fuente, relativos al cuerpo de la ficha técnica.
   * Ficha técnica ≈ 1.0 · Nombre de producto ≈ 1.25 · Categoría ≈ 1.8
   */
  fontRatio: Object.freeze({
    productName: 1.12,
    categoryHeading: 1.55
  }),

  /** Tolerancia vertical para considerar que dos fragmentos son la misma línea. */
  lineToleranceY: 3.2,

  /**
   * Proporción mínima de mayúsculas para aceptar un texto como nombre de
   * producto. En esta lista los nombres van en caja alta y las claves de la
   * ficha técnica en caja de título, así que distingue "MOTOSIERRA:" (nombre)
   * de "Caudal:" (clave de ficha sin valor).
   */
  titleUppercaseRatio: 0.6,

  /** Texto que identifica la fila de encabezado de tabla. */
  tableHeaderMarker: /^item\s*no\.?/i,

  /** Un código de producto: mayúsculas, dígitos y separadores técnicos. */
  codePattern: /^[A-Z0-9][A-Z0-9\-./"']{1,20}$/,

  /** Un importe en pesos colombianos tal como aparece en el PDF. */
  pricePattern: /\$\s*([\d.,]+)/,

  /** Una línea de ficha técnica: `Clave: Valor`. */
  specPattern: /^([^:]{2,60}?)\s*:\s*(.+)$/,

  /**
   * Aclaraciones comerciales ("Nota: No incluye manguera").
   * Van en cuerpo grande, como los nombres, así que hay que reconocerlas
   * explícitamente para que no abran un bloque de producto falso.
   */
  notePattern: /^(nota|obs|observaci[oó]n|importante)\s*[:.]/i,

  /** Líneas de ruido descartadas antes de parsear. */
  noisePatterns: Object.freeze([
    /^\d{1,3}$/,                       // numeración de página
    /^lista de precios/i,
    /^gracias\.?$/i,
    /^by supra/i,
    /^p\.?v\.?d/i,
    /^imagen\.?$/i,
    /^descripcion\.?$/i
  ]),

  /**
   * Área de imagen candidata dentro de la página, en puntos.
   * Descarta logotipos de cabecera o pie que pudieran incrustarse en el futuro.
   */
  image: Object.freeze({
    minWidth: 28,
    minHeight: 28,
    maxWidthRatio: 0.6,
    /** Escala de render usada para recortar. 2.5 ≈ 180 ppp efectivos. */
    renderScale: 2.5,
    /** Margen en píxeles añadido al recorte para no cortar bordes. */
    padding: 2,
    outputType: 'image/webp',
    outputQuality: 0.86,
    thumbMaxSize: 420
  })
});
