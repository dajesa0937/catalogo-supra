# Catálogo Web · Equipos Supra S.A.S.

Catálogo de maquinaria agrícola y equipos que se construye **directamente desde
la lista de precios oficial en PDF**. Reemplazar ese archivo actualiza todo:
productos, categorías, fichas técnicas e imágenes. No hay que tocar ni una línea
de código.

HTML5 · CSS3 · JavaScript ES6 · PDF.js · IndexedDB. Sin frameworks, sin
compilación y sin servidor: se publica tal cual en GitHub Pages.

> **El catálogo está publicado en modo presentación.** Se ve la ficha técnica
> completa de cada referencia, pero **no los precios**, y no hay botón de
> WhatsApp. Es deliberado: la página la enseña un distribuidor a *su* cliente.
> Ver [Los dos modos](#los-dos-modos).

---

## Índice

1. [Los dos modos](#los-dos-modos)
2. [Puesta en marcha](#puesta-en-marcha)
3. [Actualizar el catálogo](#actualizar-el-catálogo)
4. [Publicar en GitHub Pages](#publicar-en-github-pages)
5. [Cómo funciona](#cómo-funciona)
6. [Estructura del proyecto](#estructura-del-proyecto)
7. [Personalización](#personalización)
8. [Pruebas](#pruebas)
9. [Decisiones técnicas](#decisiones-técnicas)
10. [Resolución de problemas](#resolución-de-problemas)

---

## Los dos modos

Todo el comportamiento cuelga de **una sola línea** en `config/app.config.js`:

```js
export const CATALOG_MODE = 'presentacion';   // o 'precios'
```

| | `presentacion` *(actual)* | `precios` |
|---|---|---|
| Para quién | El cliente final del distribuidor | Mostrador y distribuidores |
| Precios | **No se muestran.** "Bajo consulta" | P.V.D y sin IVA, con conmutador |
| Orden por precio | No se ofrece | Sí |
| Botón de WhatsApp | **No aparece** | Sí, con mensaje por referencia |
| Contacto en el pie | Solo la marca | Dirección, teléfono, correo |
| Exportar CSV/JSON | Sin columnas de precio | Con precios |
| De dónde salen los datos | `data/catalogo.json`, ya generado | Del PDF, en el navegador |
| El PDF viaja al sitio | **No** | Sí |

### Por qué el modo presentación no publica el PDF

Quitar los precios de la pantalla no serviría de nada si el PDF siguiera
colgado en `https://…/data/lista-precios.pdf`: cualquiera que escribiera esa
dirección se descargaría la lista de distribución completa. Y ahora que el
catálogo circula entre los clientes de los distribuidores, esa dirección la
puede probar mucha más gente.

Por eso, en este modo el PDF se lee **una sola vez, en tu computador**, con
`npm run generar`, y al sitio solo sube el resultado: fichas técnicas y
fotografías, sin ninguna cifra. El archivo con los precios nunca sale de tu
equipo — `.gitignore` se encarga de que no se suba ni por descuido.

De paso, el catálogo publicado carga bastante más rápido: deja de descargar el
PDF y la librería que lo interpreta, que entre los dos pesan 1,7 MB.

### Por qué no hay botón de WhatsApp

La página la usan los distribuidores con **sus propios clientes**. Un enlace
directo a Equipos Supra en esa pantalla sería una invitación a saltarse a quien
está haciendo la venta. En modo `precios` el botón vuelve solo.

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

Abrir <http://localhost:8000>. Abre en medio segundo: los datos ya vienen
generados.

Para las pruebas y para generar el catálogo hace falta Node:

```bash
npm install     # pdfjs-dist y playwright
```

---

## Actualizar el catálogo

Este es todo el mantenimiento. Son tres pasos, y el segundo es el nuevo:

```bash
# 1 · Reemplazar la lista, con ESE MISMO nombre
#     data/lista-precios.pdf

# 2 · Regenerar el catálogo publicable
npm run generar

# 3 · Subir el cambio
git add . && git commit -m "Lista de agosto" && git push
```

`npm run generar` lee el PDF, extrae los 80 productos y sus 80 fotografías, y
escribe `data/catalogo.json` y `assets/products/`. Termina con un informe:

```
  Productos:   80
  Categorías:  18
  Fotografías: 80
  Precios:     NO se publican
```

> **Antes de subir**, mirar ese informe. Que el número de productos cuadre con
> la lista y que no aparezca el bloque `ATENCIÓN · el lector no pudo completar
> N fila(s)`. Si aparece, ver
> [Resolución de problemas](#resolución-de-problemas). Y abrir el catálogo en
> local para ver dos o tres fichas.

### Qué ocurre con lo que ya no está en la lista nueva

No hay nada que borrar a mano. El catálogo se reconstruye entero desde el PDF,
así que las **referencias retiradas** desaparecen solas y sus fotografías se
borran de `assets/products/` en la propia generación.

Quedan dos cabos sueltos en el navegador de cada vendedor, y el catálogo los
resuelve por su cuenta:

- Los **favoritos** de referencias retiradas se descartan al arrancar y se
  avisa con una notificación. Sin eso, el contador diría "3 favoritos" y solo
  aparecerían dos, y el vendedor pensaría que la aplicación perdió algo suyo.
- Un **enlace compartido** (por WhatsApp, por ejemplo) a una referencia que ya
  no existe muestra un aviso con el código y devuelve al catálogo, en lugar de
  redirigir en silencio.

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

### Si el PDF ya se subió alguna vez

`.gitignore` impide subirlo de aquí en adelante, pero **no retira lo que Git ya
está rastreando**. Si en algún momento se publicó, hay que sacarlo a mano:

```bash
git rm --cached data/*.pdf
git commit -m "El PDF de precios deja de publicarse"
git push
```

Esto no borra el archivo de tu computador: solo deja de subirlo. Para
comprobarlo, `git ls-files data/` no debe devolver ningún `.pdf`.

> Un aviso honesto: el historial de Git conserva las versiones ya subidas, así
> que quien sepa buscarlas puede recuperarlas. Si eso importa, la vía limpia es
> crear un repositorio nuevo. La prueba
> `La lista de precios en PDF no se publica` vigila el estado actual.

---

## Cómo funciona

Hay dos recorridos, uno por modo. El lector del PDF es **el mismo** en los dos;
lo único que cambia es *dónde* se ejecuta.

### Modo presentación · el que está publicado

```
EN TU COMPUTADOR                         │  EN EL SITIO PUBLICADO
                                         │
data/lista-precios.pdf                   │
        │                                │
        │  npm run generar               │
        ▼                                │
   Chromium sin ventana                  │
   PDF.js ─► texto por coordenadas       │
          └► imágenes por recorte        │
        │                                │
        ▼                                │
   data/catalogo.json  ────── git push ──┼──►  fetch  ──►  catálogo en pantalla
   assets/products/*.webp                │                    (< 500 ms)
                                         │
   (el PDF se queda aquí)                │
```

**Cada visita.** Se descarga un JSON de 89 KB y las fotografías que se vean en
pantalla. Ni PDF.js ni el PDF: medio segundo, y no hay nada que cachear a mano.

**Por qué un navegador para generar.** Recortar las fotografías necesita un
`canvas`, y un `canvas` necesita un navegador. En vez de mantener un segundo
extractor para Node —que se desincronizaría del bueno a la primera— se ejecuta
el pipeline **real** dentro de un Chromium sin ventana. Lo que se genera es
exactamente lo que vería un visitante, con el mismo código.

### Modo precios · lectura en el navegador

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

En modo presentación, si `data/catalogo.json` no existe todavía, el catálogo
**cae a leer el PDF** y lo avisa por consola. Así el proyecto sigue siendo
utilizable en local aunque falte el paso de generación.

---

## Estructura del proyecto

```
catalogo-supra/
├── index.html                   Estructura de la aplicación
├── .nojekyll                    Necesario para GitHub Pages
│
├── data/
│   ├── lista-precios.pdf        ← EL ÚNICO ARCHIVO QUE HAY QUE REEMPLAZAR
│   │                              (NO se publica: está en .gitignore)
│   └── catalogo.json            Generado por `npm run generar`. No editar
│
├── tools/                       Utilidades de generación, NO parte del sitio
│   ├── generar-catalogo.mjs     `npm run generar`
│   └── bake.html                Página auxiliar que ejecuta el lector real
│
├── config/                      Todo lo configurable, sin lógica
│   ├── app.config.js            MODO, rutas, contacto, caché, interfaz
│   ├── parser.config.js         Columnas, umbrales y patrones del lector
│   ├── taxonomy.config.js       Marcas, iconos y correcciones de texto
│   └── overrides.json           Correcciones por producto (opcional)
│
├── assets/
│   ├── brand/                   Logotipos oficiales y favicon
│   ├── icons/sprite.svg         Iconografía propia, sin librerías
│   └── products/                Fotografías + manifest.json (generado)
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

### Marcar una referencia como agotada

`config/overrides.json`, campo `stock`. El producto **no desaparece**: se queda
en el catálogo con distintivo, la fotografía atenuada y un aviso en la ficha.
(En modo `precios`, además, el mensaje de WhatsApp se adapta a preguntar por la
reposición.)

> Este archivo lo lee el navegador en cada visita, así que un cambio aquí
> **no necesita `npm run generar`**: basta con subirlo. Es la vía rápida para
> marcar un agotado el mismo día.

```json
{
  "products": {
    "SPS-260": { "stock": "agotado" },
    "SCS-5800": { "stock": "bajo-pedido" }
  }
}
```

Es deliberado que siga visible. Un vendedor necesita poder buscar la referencia
que el cliente le está pidiendo y responderle que no hay existencias; si la
referencia se hubiera esfumado del catálogo, parecería que nunca existió y la
conversación se complica en vez de resolverse.

Para retirarla de verdad está `"hidden": true`, pero eso es para referencias
descatalogadas, no para faltantes de inventario. Los estados disponibles se
definen en `config/taxonomy.config.js` y añadir uno nuevo es una entrada más.

### Corregir un precio sin esperar a la lista siguiente

> Solo tiene efecto en modo `precios`. En presentación no se muestra ningún
> precio, así que una sobrescritura aquí queda guardada pero no se ve.

Mismo archivo, campos `priceNet` y `priceGross`, en pesos y sin puntos:

```json
{
  "products": {
    "SGE-210": { "priceNet": 395000, "priceGross": 469900 }
  }
}
```

> **El PDF sigue siendo la fuente oficial.** Un precio puesto aquí y no
> corregido en la lista oficial deja las dos fuentes en desacuerdo.
> Úsalo como puente hasta la lista siguiente,
> y vacía la sobrescritura cuando el PDF nuevo ya traiga el precio corregido.
> Las exportaciones a JSON y CSV marcan qué precios se ajustaron y conservan el
> valor original del PDF, para poder auditarlo.

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
tarjetas, justo para el zoom. Para usar una fotografía propia:

1. Copiarla en `assets/products/` con **el código como nombre** y una extensión
   que **no** sea `.webp`: `SPS-260.jpg`, `SGE-210.png`.
2. Ejecutar `npm run generar`.

Eso es todo: el manifiesto se escribe solo y la fotografía propia tiene
prioridad sobre el recorte del PDF. El informe lo confirma
(`Fotografías: 80 (2 propia(s), respetada(s))`).

`.webp` está reservado para lo que extrae el lector — esos archivos se borran y
se rehacen en cada generación —, y por eso las tuyas deben llevar otra
extensión. Si el código lleva una barra (`SPS-260A/210`), sustitúyela por un
guion bajo en el nombre del archivo: `SPS-260A_210.jpg`.

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
temas, el diseño en móvil y el contraste WCAG 2.1 AA. **Se adapta al modo**: las
comprobaciones que no aplican salen en gris (`·`) en lugar de en rojo.

Cuatro comprobaciones son la razón de ser del modo presentación y aparecen bajo
el epígrafe **Filtraciones**. Si alguna se pone en rojo, el catálogo no se sube:

| Comprobación | Qué significaría fallar |
|---|---|
| La lista de precios en PDF no se publica | La lista completa está a un clic desde el sitio |
| No aparece ningún teléfono de Equipos Supra | El distribuidor enseña a su cliente el teléfono del proveedor |
| No aparece ningún enlace de WhatsApp | Lo mismo, por otra vía |
| No se pinta ningún precio en la cuadrícula | Se filtró un precio a la pantalla |

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

**`npm run generar` avisa de filas no reconocidas.**
El lector encontró un bloque al que le falta el código, el precio o la imagen.
El informe dice la página y el producto exactos. Suele deberse a un cambio de
maquetado en el PDF; se corrige ajustando los umbrales de
`config/parser.config.js` o, si es un caso aislado, desde `overrides.json`.

**`npm run generar` saca muchos menos productos de los que tiene la lista.**
Casi siempre el PDF está **rasterizado**: sus páginas son fotografías de texto,
no texto, y no hay nada que leer en ellas. Ocurre cuando el archivo se hizo con
*Imprimir → Microsoft Print to PDF*. La solución está en cómo se exporta desde
Word: **Archivo → Guardar como → PDF**, no *Imprimir*. Para comprobarlo,
abrir el PDF y tratar de seleccionar una palabra con el cursor: si no se puede,
está rasterizado.

**Subí un PDF nuevo y el catálogo no cambió.**
Falta el paso 2: `npm run generar`. En modo presentación el sitio no lee el PDF
—por eso los precios no están publicados—, así que reemplazar el archivo no
basta por sí solo.

**El catálogo no se actualiza tras subir un catálogo nuevo.**
El navegador está sirviendo la copia guardada. Forzar una recarga completa
(`Ctrl+F5`) o borrar los datos del sitio.

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
