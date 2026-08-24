/**
 * Localiza y recorta las fotografías de producto incrustadas en el PDF.
 *
 * Decisión de arquitectura
 * ------------------------
 * Hay tres formas de sacar las imágenes de un PDF con PDF.js y aquí se usa la
 * tercera, que es la única realmente robusta:
 *
 *   1. Decodificar `page.objs` — descartada: devuelve formatos distintos según
 *      la versión (bytes crudos con `kind`, o `ImageBitmap`) y obliga a componer
 *      a mano la máscara de transparencia (`SMask`) de cada foto.
 *   2. Simular la matriz de transformación recorriendo la lista de operadores —
 *      descartada: este PDF sale de Word con el contenido dentro de un sistema
 *      de coordenadas escalado, y reimplementar el modelo gráfico de PDF solo
 *      para averiguar el factor es frágil y difícil de mantener.
 *   3. **Instrumentar el propio render.** Se renderiza la página al canvas y se
 *      intercepta `drawImage` para anotar la matriz vigente en el momento exacto
 *      en que PDF.js dibuja cada imagen. La posición resultante no es una
 *      estimación: es la que el navegador acaba de usar para pintar.
 *
 * Además, recortar del canvas ya renderizado da la foto tal y como se ve, con la
 * transparencia compuesta sobre el fondo blanco de la página.
 *
 * @module data/imageExtractor
 */

import { PARSER_CONFIG } from '../../config/parser.config.js';

/**
 * @typedef {object} ImageRegion
 * @property {string} id      Identificador estable `p<página>-i<índice>`
 * @property {number} top     Puntos PDF desde el borde superior de la página
 * @property {number} bottom
 * @property {number} left
 * @property {number} right
 * @property {Blob} blob      Recorte listo para almacenar
 */

/**
 * Renderiza una página, localiza las imágenes que PDF.js dibuja en ella y
 * devuelve un recorte por cada una.
 *
 * @param {object} page Página de PDF.js
 * @param {number} pageNumber
 * @returns {Promise<ImageRegion[]>} regiones ordenadas de arriba a abajo
 */
export async function extractPageImages(page, pageNumber) {
  const { renderScale, minWidth, minHeight, maxWidthRatio } = PARSER_CONFIG.image;
  const viewport = page.getViewport({ scale: renderScale });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const painted = [];
  const restoreHook = hookDrawImage(context, painted);
  try {
    await page.render({ canvasContext: context, viewport }).promise;
  } finally {
    restoreHook();
  }

  // De píxeles de canvas a puntos PDF con el origen arriba a la izquierda.
  const pageWidthPt = viewport.width / renderScale;
  const candidates = mergeOverlapping(painted)
    .map((rect) => ({
      left: rect.left / renderScale,
      right: rect.right / renderScale,
      top: rect.top / renderScale,
      bottom: rect.bottom / renderScale,
      pixels: rect
    }))
    .filter((rect) => {
      const width = rect.right - rect.left;
      const height = rect.bottom - rect.top;
      if (width < minWidth || height < minHeight) return false;   // iconos y filetes
      if (width > pageWidthPt * maxWidthRatio) return false;      // cenefas y fondos
      return true;
    })
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const regions = [];
  for (const [index, candidate] of candidates.entries()) {
    const blob = await cropToBlob(canvas, candidate.pixels);
    if (!blob) continue;
    regions.push({
      id: `p${pageNumber}-i${index}`,
      top: round(candidate.top),
      bottom: round(candidate.bottom),
      left: round(candidate.left),
      right: round(candidate.right),
      blob
    });
  }

  releaseCanvas(canvas);
  return regions;
}

/**
 * Sustituye temporalmente `drawImage` para anotar dónde cae cada imagen.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {{left:number,top:number,right:number,bottom:number}[]} sink
 * @returns {() => void} función para deshacer la instrumentación
 */
function hookDrawImage(context, sink) {
  const original = context.drawImage;

  context.drawImage = function instrumentedDrawImage(image, ...args) {
    try {
      sink.push(destinationRect(context.getTransform(), image, args));
    } catch {
      // Si el navegador no expone getTransform, se pinta igual y se pierde
      // únicamente la posición de esa imagen.
    }
    return original.call(this, image, ...args);
  };

  return () => { context.drawImage = original; };
}

/**
 * Calcula la caja que ocupa una llamada a `drawImage` en píxeles de canvas.
 *
 * `drawImage` admite tres firmas: (dx, dy), (dx, dy, dw, dh) y
 * (sx, sy, sw, sh, dx, dy, dw, dh). El destino son siempre los cuatro últimos
 * argumentos cuando hay ocho, los cuatro primeros cuando hay cuatro.
 *
 * @param {DOMMatrix} matrix Transformación vigente del contexto
 * @param {CanvasImageSource} image
 * @param {number[]} args
 * @returns {{left:number,top:number,right:number,bottom:number}}
 */
function destinationRect(matrix, image, args) {
  let dx = 0;
  let dy = 0;
  let dw = image.width ?? 0;
  let dh = image.height ?? 0;

  if (args.length >= 8) [, , , , dx, dy, dw, dh] = args;
  else if (args.length >= 4) [dx, dy, dw, dh] = args;
  else if (args.length >= 2) [dx, dy] = args;

  const corners = [[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]]
    .map(([x, y]) => ({
      x: matrix.a * x + matrix.c * y + matrix.e,
      y: matrix.b * x + matrix.d * y + matrix.f
    }));

  return {
    left: Math.min(...corners.map((point) => point.x)),
    right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
    bottom: Math.max(...corners.map((point) => point.y))
  };
}

/**
 * Funde las cajas que se solapan. PDF.js puede dibujar una misma fotografía en
 * varias pasadas (imagen y máscara), y cada pasada llega como un `drawImage`.
 *
 * @param {{left:number,top:number,right:number,bottom:number}[]} rects
 * @returns {{left:number,top:number,right:number,bottom:number}[]}
 */
function mergeOverlapping(rects) {
  const merged = [];
  for (const rect of rects) {
    const hit = merged.find((other) => intersects(other, rect));
    if (hit) {
      hit.left = Math.min(hit.left, rect.left);
      hit.top = Math.min(hit.top, rect.top);
      hit.right = Math.max(hit.right, rect.right);
      hit.bottom = Math.max(hit.bottom, rect.bottom);
    } else {
      merged.push({ ...rect });
    }
  }
  return merged;
}

/**
 * @param {{left:number,top:number,right:number,bottom:number}} a
 * @param {{left:number,top:number,right:number,bottom:number}} b
 * @returns {boolean}
 */
function intersects(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Recorta una región del canvas de página y la codifica.
 * @param {HTMLCanvasElement} pageCanvas
 * @param {{left:number,top:number,right:number,bottom:number}} rect en píxeles
 * @returns {Promise<Blob|null>}
 */
async function cropToBlob(pageCanvas, rect) {
  const { padding, outputType, outputQuality, thumbMaxSize } = PARSER_CONFIG.image;

  const sx = Math.max(0, Math.floor(rect.left) - padding);
  const sy = Math.max(0, Math.floor(rect.top) - padding);
  const sw = Math.min(pageCanvas.width - sx, Math.ceil(rect.right - rect.left) + padding * 2);
  const sh = Math.min(pageCanvas.height - sy, Math.ceil(rect.bottom - rect.top) + padding * 2);
  if (sw <= 0 || sh <= 0) return null;

  const scale = Math.min(1, thumbMaxSize / Math.max(sw, sh));
  const crop = createCanvas(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
  const context = crop.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, crop.width, crop.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);

  const blob = await toBlob(crop, outputType, outputQuality);
  releaseCanvas(crop);
  return blob;
}

/* ------------------------------ canvas ------------------------------- */

/**
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Libera la memoria de vídeo del canvas en cuanto deja de usarse. Con 19
 * páginas a 2.5× es la diferencia entre decenas y cientos de MB retenidos.
 * @param {HTMLCanvasElement} canvas
 */
function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * `canvas.toBlob` con reserva a JPEG si el navegador no codifica WebP.
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} quality
 * @returns {Promise<Blob|null>}
 */
function toBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob && blob.size > 0) resolve(blob);
      else canvas.toBlob((fallback) => resolve(fallback), 'image/jpeg', quality);
    }, type, quality);
  });
}

/**
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Math.round(value * 10) / 10;
}
