# Catálogo Web · Equipos Supra S.A.S.

Catálogo de maquinaria agrícola y equipos que se alimenta **directamente de la
lista de precios oficial en PDF**. Reemplazar ese archivo actualiza todo el
catálogo: productos, categorías, fichas técnicas, imágenes y precios. No hay que
tocar ni una línea de código.

HTML5 · CSS3 · JavaScript ES6 · PDF.js · IndexedDB. Sin frameworks, sin
compilación y sin servidor: se publica tal cual en GitHub Pages.

---

## Índice

1. [Puesta en marcha](#puesta-en-marcha)
2. [Actualizar la lista de precios](#actualizar-la-lista-de-precios)
3. [Publicar en GitHub Pages](#publicar-en-github-pages)
4. [Cómo funciona](#cómo-funciona)
5. [Estructura del proyecto](#estructura-del-proyecto)
6. [Personalización](#personalización)
7. [Pruebas](#pruebas)
8. [Decisiones técnicas](#decisiones-técnicas)
9. [Resolución de problemas](#resolución-de-problemas)

---

## Puesta en marcha

El proyecto no necesita compilarse, pero **sí necesita servirse por HTTP**: usa
módulos de JavaScript y un sprite SVG externo, y ambos están sujetos a la
política de mismo origen, que el protocolo `file://` no satisface.

```bash
# Con Python (viene instalado en Windows con Python, macOS y Linux)
python -m http.server 8000

# Con Node
npx serve .

# Con VS Code
# Extensión "Live Server" → clic derecho en index.html → Open with Live Server
```

Abrir <http://localhost:8000>.

La **primera carga** tarda unos segundos: es cuando se lee el PDF completo. Las
siguientes abren en menos de medio segundo porque el catálogo ya está en la
caché del navegador.

---

## Actualizar la lista de precios

Este es todo el mantenimiento del catálogo:

1. Reemplazar `data/lista-precios.pdf` por la lista nueva, **con ese mismo
   nombre**.
2. Subir el cambio (`git add`, `git commit`, `git push`).

Cada visitante verá el catálogo actualizado la próxima vez que abra la página.
El sistema detecta el cambio comparando el tamaño y la fecha del archivo, vuelve
a leerlo y renueva la caché por su cuenta.

> **Antes de subir**, conviene abrir el catálogo en local y comprobar dos cosas:
> que el número de productos cuadra con la lista, y que no aparece el aviso
> amarillo de filas no reconocidas. Si aparece, ver
> [Resolución de problemas](#resolución-de-problemas).

### Qué formato debe tener el PDF

El lector espera la estructura de tabla que ya usa Equipos Supra:

| Columna | Contenido |
|---|---|
| `Item No.` | Código de referencia |
| `Imagen` | Fotografía del producto |
| `Descripción` | Nombre comercial y ficha técnica |
| `P.V.D sin IVA` | Precio de distribuidor |
| `P.V.D` | Precio público |

Y tres convenciones del documento:

- El **nombre del producto** es la primera línea del bloque y termina en dos
  puntos (`KIT BOMBA 22lts RETORNO MANUAL PREMIUM:`).
- La **ficha técnica** son las líneas siguientes, con formato `Clave: Valor`.
- La **categoría** es el titular en mayúsculas que precede a cada fila
  `Item No.`, y se hereda hacia abajo hasta el siguiente titular.

Si en el futuro cambia el maquetado, lo único que hay que ajustar es
`config/parser.config.js`. Ver [Personalización](#personalización).

---

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "Catálogo web Equipos Supra"
git branch -M main
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

En GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.

El archivo `.nojekyll` de la raíz ya está incluido: sin él, GitHub ignoraría
carpetas y el catálogo no encontraría sus recursos.

---

## Cómo funciona

```
data/lista-precios.pdf
        │
        ▼
  ¿cambió el archivo?  ──── no ──►  IndexedDB  ──►  catálogo en pantalla
        │                                              (< 300 ms)
       sí
        │
        ▼
    PDF.js  ──►  texto por coordenadas   ──►  productos ──►  IndexedDB
             └►  imágenes por recorte     ──►  fotografías
```

**Primera visita.** Se descarga PDF.js (1,7 MB, se queda en la caché del
navegador), se lee el PDF página a página con una barra de progreso real y se
guarda el resultado en IndexedDB. Unos 4 segundos.

**Visitas siguientes.** Una petición `HEAD` de milisegundos comprueba si el PDF
cambió. Si no, el catálogo sale de IndexedDB sin descargar nada más y sin
ejecutar el lector. Medio segundo.

**Cuando el PDF cambia.** La huella no coincide, se reparsea y se renueva la
caché. El usuario no tiene que hacer nada.

---

## Estructura del proyecto

```
catalogo-supra/
├── index.html                   Estructura de la aplicación
├── .nojekyll                    Necesario para GitHub Pages
│
├── data/
│   └── lista-precios.pdf        ← EL ÚNICO ARCHIVO QUE HAY QUE REEMPLAZAR
│
├── config/                      Todo lo configurable, sin lógica
│   ├── app.config.js            Rutas, contacto, caché, ajustes de interfaz
│   ├── parser.config.js         Columnas, umbrales y patrones del lector
│   ├── taxonomy.config.js       Marcas, iconos y correcciones de texto
│   └── overrides.json           Correcciones por producto (opcional)
│
├── assets/
│   ├── brand/                   Logotipos oficiales y favicon
│   ├── icons/sprite.svg         Iconografía propia, sin librerías
│   └── products/                Fotografías en alta resolución (opcional)
│
├── vendor/pdfjs/                PDF.js vendorizado (sin CDN)
│
├── styles/
│   ├── main.css                 Punto de entrada
│   ├── base/                    reset · tokens de marca · tipografía
│   ├── layout/                  armazón · barra superior
│   └── components/              barra de herramientas · tarjeta · ficha · varios
│
├── scripts/
│   ├── main.js                  Arranque
│   ├── core/                    Bus de eventos, estado, DOM, texto, formato
│   ├── data/                    Lectura del PDF, parseo, caché, repositorio
│   ├── features/                Búsqueda, filtros, orden, favoritos, tema…
│   └── ui/                      Componentes de presentación
│
└── tests/
    ├── parser.test.mjs          Verifica la extracción contra el PDF real
    └── e2e.test.mjs             Verifica la aplicación en un navegador real
```

Cada archivo tiene una única responsabilidad y las dependencias apuntan siempre
hacia dentro: `ui/` conoce a `features/` y a `data/`, `data/` no sabe que existe
una interfaz, y `core/` no depende de nadie.

---

## Personalización

### Colores y tipografías

Todo el sistema visual está en `styles/base/tokens.css`. Es el único archivo con
valores de color; ningún componente contiene un literal. Los colores actuales
son los oficiales, muestreados píxel a píxel de los logotipos incrustados en la
lista de precios:

| Token | Valor | Uso |
|---|---|---|
| `--brand` | `#EC6D26` | Naranja Supra, acento principal |
| `--brand-bright` | `#FC8637` | Naranja claro, estados de foco |
| `--bar` | `#100F0D` | Negro Supra, barra superior |
| `--reload` | `#BF002B` | Rojo de la línea Reload |

Si llega el manual de identidad corporativa, basta con actualizar este archivo.

### Corregir o enriquecer un producto

`config/overrides.json` permite ajustar cualquier referencia por su código, sin
tocar el lector:

```json
{
  "products": {
    "SPS-260": {
      "name": "Kit bomba de fumigación 22 L · retorno manual",
      "specs": { "Garantía": "12 meses" },
      "notes": ["Incluye manual de instalación."],
      "keywords": "cafetal aspersión",
      "hidden": false
    }
  }
}
```

El propio archivo lleva documentados todos los campos disponibles.

### Fotografías en alta resolución

Las imágenes incrustadas en el PDF miden entre 200 y 360 px: suficiente para las
tarjetas, justo para el zoom. Para usar las fotografías originales:

1. Copiar los archivos en `assets/products/` con el nombre del código de
   producto: `SPS-260.webp`, `SGE-210.webp`…
2. Añadir los códigos a `assets/products/manifest.json`:

```json
{ "codes": ["SPS-260", "SGE-210"] }
```

El catálogo las usará automáticamente donde existan y seguirá usando las del PDF
donde no. Mientras la lista esté vacía no se hace ni una petición de más.

### Añadir una línea de producto

`config/taxonomy.config.js` → `BRANDS`. Cada marca declara el patrón de texto
que la identifica, su color y su gama. También ahí se asignan los iconos por
familia de producto y las correcciones ortográficas heredadas del PDF.

---

## Pruebas

```bash
npm install          # solo para las pruebas: pdfjs-dist y playwright
npm test             # extracción + extremo a extremo
npm run test:parser  # solo el lector del PDF (rápido, sin navegador)
npm run test:e2e     # solo la aplicación en navegador
npm run test:shots   # además guarda capturas en tests/
```

`parser.test.mjs` ejecuta el lector sobre el PDF real y comprueba que los 80
productos salen con código, con los dos precios, con ficha técnica y con
categoría, además de contrastar tres referencias de control contra sus valores
exactos del PDF.

`e2e.test.mjs` levanta un servidor estático equivalente a GitHub Pages, abre el
catálogo en Chromium y verifica la extracción de imágenes, la caché, la
búsqueda, los filtros, el orden, la ficha de producto, los favoritos, ambos
temas, el diseño en móvil y el contraste WCAG 2.1 AA.

Varias comprobaciones son **pruebas de regresión**: fijan defectos concretos ya
corregidos para que no vuelvan. En particular, que la fotografía nunca exceda su
bandeja —en cuadrícula, en lista y en la ficha—, que en la ficha la foto no se
superponga al nombre y al precio, y que la ficha técnica completa entre en
pantalla sin desplazarse en un portátil de 1366 × 768.

Las dependencias de prueba **no** son necesarias para publicar el catálogo: la
aplicación no usa ninguna librería en tiempo de ejecución salvo PDF.js, que va
vendorizado en `vendor/`.

---

## Decisiones técnicas

Las cuatro decisiones que explican por qué el proyecto está construido así.

### 1 · El lector trabaja con coordenadas, no con líneas de texto

Extraer el texto del PDF como líneas planas falla en aproximadamente una de cada
cuatro filas: cuando la descripción es larga, Word desplaza el código y el
precio a renglones distintos del nombre. El lector agrupa los fragmentos por
banda vertical y los clasifica por su posición horizontal, lo que hace el
resultado inmune a ese comportamiento.

La segmentación de cada bloque combina tres señales, porque ninguna basta sola:
el cuerpo de letra, el cierre del titular en dos puntos y el predominio de caja
alta —que es lo que distingue `MOTOSIERRA:` (un producto) de `Caudal:` (una
clave de ficha técnica que se quedó sin valor)—.

### 2 · Las imágenes se obtienen instrumentando el render

Decodificar los objetos de imagen de PDF.js obliga a componer a mano las
máscaras de transparencia y depende de una API que ha cambiado entre versiones.
Simular la matriz de transformación es frágil con documentos de Word. En su
lugar, se renderiza la página y se intercepta `drawImage` para anotar dónde cae
cada fotografía: la posición no es una estimación, es la que el navegador acaba
de usar para pintar. Después se recorta del propio lienzo, con la transparencia
ya compuesta.

### 3 · IndexedDB para el catálogo, LocalStorage para las preferencias

LocalStorage tiene un tope de unos 5 MB, solo guarda cadenas y escribe de forma
síncrona bloqueando la interfaz. Las ochenta fotografías lo desbordarían.
IndexedDB es asíncrona, guarda `Blob` binarios y dispone de cientos de MB.
LocalStorage se queda con lo suyo: favoritos, tema y modo de precio.

### 4 · Las cajas de imagen se acotan por fuera, nunca por su contenido

Toda fotografía del catálogo vive dentro de un marco de altura conocida —una
relación de aspecto en la tarjeta, una altura explícita en la ficha— y va
posicionada en absoluto dentro de él. La alternativa natural, dejar que la
imagen dimensione su marco con `height: 100%`, `min-height` o `aspect-ratio`,
crea una dependencia circular que el navegador resuelve de formas distintas
según el contexto: en la tarjeta hacía crecer la imagen por encima de su marco
y el producto salía recortado; en la ficha colapsaba la fila de la rejilla y la
foto se superponía al nombre y al precio.

### 5 · La URL es la fuente de verdad de la navegación

Cada categoría y cada producto tienen su propia dirección
(`#/producto/SPS-260`). Un vendedor puede copiar el enlace de una referencia y
mandarlo por WhatsApp, y el botón "atrás" del navegador se comporta como se
espera, todo sin una sola recarga de página.

---

## Resolución de problemas

**Aparece un aviso amarillo con filas no reconocidas.**
El lector encontró un bloque al que le falta el código, el precio o la imagen.
Desplegando el aviso se ve la página y el producto exactos. Suele deberse a un
cambio de maquetado en el PDF; se corrige ajustando los umbrales de
`config/parser.config.js` o, si es un caso aislado, desde `overrides.json`.

**El catálogo no se actualiza tras subir un PDF nuevo.**
El navegador está sirviendo la copia guardada. Forzar una recarga completa
(`Ctrl+F5`) o borrar los datos del sitio. Si el servidor no envía la cabecera
`Last-Modified`, la detección de cambios se apoya solo en el tamaño del archivo;
GitHub Pages sí la envía.

**La página se queda en blanco al abrirla con doble clic.**
El proyecto necesita servirse por HTTP; `file://` bloquea los módulos de
JavaScript. Ver [Puesta en marcha](#puesta-en-marcha).

**Las categorías salen mal agrupadas.**
El titular de sección se reconoce por su cuerpo de letra, más grande que el del
resto. Si en el PDF nuevo esa diferencia se redujo, hay que bajar
`fontRatio.categoryHeading` en `config/parser.config.js`.

**Los iconos no se ven.**
El sprite SVG se carga como archivo externo y requiere mismo origen. Ocurre solo
al abrir el proyecto sin servidor.

---

## Contacto

**Equipos Supra S.A.S.** · Calle 59 # 3A-35, Ibagué, Tolima
WhatsApp +57 318 082 5116 · <administrativo@equipossupra.com> ·
<https://equipossupra.com>
