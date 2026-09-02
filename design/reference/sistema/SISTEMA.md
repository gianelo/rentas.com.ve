# Sistema de diseño — Rentas

> **Esta es la fuente de verdad visual del proyecto.** Combinación adoptada: estructura **`compacto`** + paleta **`menta`**. Registrada en el plan como D14 (dirección visual) y D16 (contrato de tokens) en `openspec/changes/mvp-rental-listings/design.md`.
>
> **Cubre 6 de las 22 superficies del producto.** Las dibujadas son las que cargan peso: resultados, ficha, publicar paso 1, página de zona, mis publicaciones e importar cartera. Las 16 restantes — vacío, rechazado, vencido, registro, aporte, correos — **se derivan de este sistema, no se improvisan**: mismos tokens, misma jerarquía de tres botones, misma anatomía de fila. Si una pantalla necesita un valor que el sistema no define, se extiende el sistema; no se inventa un valor local.
>
> `BRIEF.md` y `BRIEF-PANTALLAS.md` en la carpeta padre son los insumos que produjeron esto y quedaron **históricos**. Donde discrepen, manda este documento.
>
> `support.js` es el runtime de la herramienta de diseño. Sirve para abrir el HTML de referencia en el navegador y **no se porta a producción**.

---

## Overview

Rentas es un portal de clasificados de alquiler residencial de larga estadía para Distrito Capital y Maracaibo. Publicar y buscar son gratis; la plataforma no participa en el trato (no retiene pagos, no redacta contratos, no cobra comisión). Cuando un inquilino encuentra algo, se registra y recibe el WhatsApp de quien publicó.

Este paquete cubre seis pantallas en móvil (360px) y escritorio (1280px), en una única combinación de diseño elegida: **estructura "Directorio compacto" + paleta "Menta"**.

## About the Design Files

Los archivos HTML de este paquete son **referencias de diseño**: prototipos que muestran el aspecto y el comportamiento buscados, no código de producción para copiar. La tarea es **recrear estos diseños en el entorno del codebase destino** (React, Vue, Astro, plantillas de servidor, etc.) usando sus patrones y librerías establecidas. Si todavía no hay entorno, elegí el framework más apropiado — considerando la restricción de "sin JavaScript en el camino de lectura" descrita abajo — e implementá los diseños ahí.

El HTML de referencia usa una capa de runtime propia de la herramienta de diseño (`support.js`) y estilos inline. Nada de eso debe llegar a producción.

## Fidelity

**Alta fidelidad.** Colores, tipografía, espaciado, densidad y copia son definitivos. Las imágenes son marcadores: los rectángulos con trama diagonal representan fotos de propiedades que vendrán del usuario. Recrear la UI con precisión usando las librerías del codebase.

## Restricciones no negociables

Estas condiciones son el producto, no preferencias. Cualquier implementación tiene que respetarlas.

| Restricción | Detalle |
|---|---|
| Peso | Resultados ≤ 150 KB · ficha ≤ 500 KB · miniatura ≤ 40 KB · LCP ≤ 2,5 s en 3G |
| Sin JavaScript al leer | Buscar, filtrar y navegar funcionan con JS apagado. Solo subir fotos e importar cartera pueden usarlo |
| Sin webfonts | Solo el stack tipográfico del sistema. Una webfont son 30–80 KB antes de ver nada |
| Móvil primero | Se diseña a 360px. Sin scroll horizontal. Objetivos táctiles de 44px mínimo |
| El precio domina | Es lo primero que se escanea. Más grande y más pesado que el título |
| Dueño / inmobiliaria siempre visible | En todo lugar donde aparezca un aviso, y distinguible **sin depender del color** (tiene que funcionar en blanco y negro) |
| Contacto con llave | El WhatsApp solo se muestra a usuarios registrados. Se ve que existe y se explica qué falta para verlo |
| Ciudad aislada | Una búsqueda en Maracaibo jamás muestra nada de Distrito Capital, ni en sugerencias |
| Accesible | Contraste WCAG AA, etiquetas reales en formularios, foco de teclado visible, texto alternativo en fotos |
| Indexable | El contenido del aviso es público y renderizado en servidor. Solo el teléfono queda detrás del registro |

Consecuencia práctica: el camino de lectura (resultados, ficha, página de zona) debe renderizarse en servidor. Filtros y paginación son formularios y enlaces `GET`, no estado en cliente.

## Design Tokens

### Color — paleta "Menta"

| Token | Hex | Uso |
|---|---|---|
| `--accent` | `#272343` | Acción primaria (fondo de botón), enlaces |
| `--accent-ink` | `#FFFFFF` | Texto sobre acento |
| `--surface` | `#FFFFFF` | Superficie de tarjeta y de página |
| `--bg` | `#F0F5F9` | Fondo de bloques y relleno de controles |
| `--ctl` | `#F0F5F9` | Relleno de campos e inputs |
| `--line` | `#e1e4e6` | Separadores, bordes de miniatura |
| `--strong` | `#788189` | Borde de campo, borde de badge secundario |
| `--ink` | `#1E2022` | Texto principal, precio |
| `--soft` | `#52616B` | Texto secundario y metadatos |
| `--tint` | `#E3F6F5` | Fondo de estado seleccionado y del bloque de aporte |
| `--warn` | `#8a5a00` | Texto de "vence pronto" |
| `--warn-bg` | `#faf2e1` | Fondo de "vence pronto" |
| `--err` | `#9c2b20` | Error de validación, estado oculto |
| `--err-bg` | `#fbecea` | Fondo de error |

Color de miniatura marcadora: trama diagonal `#BAE8E8` sobre `#E3F6F5`. En producción es una foto real.

Sin usar de la paleta original: `#788e98` (`primary-200`) es casi idéntico a `#788189` y quedó sin rol.

### Radio de esquina

| Token | Valor | Uso |
|---|---|---|
| `--r` | `12px` | Tarjetas, campos, botones, miniaturas, recuadros |
| `--rs` | `999px` | Badges y chips (pastilla) |

### Tipografía

Stack único, sin descarga:

```
--sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--mono: ui-monospace, SFMono-Regular, Menlo, monospace;
```

En la estructura "Directorio compacto" el precio usa `--mono` (`--disp: var(--mono)`) para que las cifras se alineen en columna. Todo lo demás usa `--sans`.

| Rol | Tamaño / peso / interlínea | Notas |
|---|---|---|
| Precio en tarjeta | **16px móvil / 17px escritorio** / 700 / 1.15 | `--mono`, `tabular-nums`. `--card-price-fs` y `--card-price-fs-desktop` |
| Precio en fila | 15px / 700 / 1.15 | `--fp`. La fila ya no está en el camino de lectura (ver la corrección de abajo) |
| Precio en ficha | 30px móvil / 34px escritorio / 700 / 1.1 | `--mono`. La lámina móvil dibuja 30 y la especificación escribe 28 dos veces: **manda la lámina** (16.23). Lo dibuja `--ficha-price-fs` / `--ficha-price-fs-desktop`; **`--fpb` (26) queda fuera del subconjunto que ship*a*** (16.37, ver abajo) |
| Título de página | 20px / 700 / 1.25 | |
| Título de aviso (ficha) | 17px móvil / 19px escritorio / 600 / 1.35 | `text-wrap: pretty` |
| Título de aviso (lista) | 13px / 400 / 1.35 | `--card-title-fs` / `--ftw`. **El recorte a dos líneas es del contenedor, no del tipo** |
| Cuerpo | **15px / 1.6 móvil / 16px / 1.65 escritorio** / 400 | ancho de lectura máx. 520px. `--ficha-body-fs` / `--ficha-body-fs-desktop` y su par de interlineado. **RESUELTO por el fundador el 2026-08-29** (16.38): el par gana paso de escritorio y crecen con él **las ocho pantallas que lo comparten**, no sólo la ficha |
| Metadato | 12px / 600 / 1.4 | color `--soft` |
| Badge / etiqueta | 11px / 700 / 1.4 | `letter-spacing: .06em`, mayúsculas |

**Un papel tipográfico se declara en un solo sitio** (2026-08-28, tareas 22.3 y 22.4). El metadato y el título de lista estaban escritos tres veces cada uno, y las copias ya habían empezado a discrepar: `/mis-avisos` dibujaba el metadato en 400 donde la cuadrícula lo dibujaba en 600, y el título al revés. Hoy los dibujan `components/atoms/ListingMeta.tsx` y `components/atoms/ListingTitle.tsx`, y que las dos pantallas coincidan **se mide en un navegador**, no se afirma leyendo una hoja.

**El recorte del título es del contenedor.** La cuadrícula lo necesita —un título largo empuja los metadatos y desalinea la tarjeta vecina— y la lista apilada de `/mis-avisos` no: la lámina 14c la dibuja sin recortar. Por eso viaja como una bandera de quien dibuja (`clamp`) y no como parte del tipo.

**Contradicción abierta, verificada y NO resuelta acá — requiere al fundador.** Las láminas nuevas dibujan la tipografía de la tarjeta más chica que lo que este documento declara: título **12,5px** a 360 y 13 a 1280 contra los 13 de la tabla, y metadato **10,5px** a 360 y 11 a 1280 en `--meta` (mono, peso 400) contra los 12 / 600 / `--sans` de la fila «Metadato». Bajarlos es un cambio visible en dos pantallas y no lo pidió ninguna tarea; lo que sí se hizo fue **dejar un solo sitio donde cambiarlos** el día que se decida.

### Espaciado

Escala: `4 · 8 · 12 · 16 · 24 · 32 · 48`. Nada fuera de esa escala.

| Token | Valor | Uso |
|---|---|---|
| `--rowpad` | `7px 12px` | Padding vertical/horizontal de fila de resultado |
| `--gap` | `8px` | Separación entre miniatura y contenido |

### Geometría de la tarjeta de resultado

> **RESINCRONIZADO 2026-08-28 contra las láminas del 2026-08-25.** Este apartado describía una **fila** con miniatura al costado, y el producto dibuja una **cuadrícula de tarjetas** desde la 14.25 (PR #77). Lo que decía antes, y qué decisión lo cambió, está en «Lo que este documento decía y por qué cambió», al final.

| Token | Móvil (lámina 6c) | Escritorio (lámina 7c) |
|---|---|---|
| `--card-w` / `--card-w-desktop` (ancho de tarjeta) | 158 px | 254 px |
| columnas de la cuadrícula | 2 | 4 |
| `--card-gap` | 12 px | 12 px |
| `--card-photo-ratio` (portada) | 4 / 3 | 4 / 3 |

**La portada va por proporción y no por alto fijo:** las dos derivadas —`thumb` 160×120 y `card` 256×192— son 4:3, y la columna se encoge por debajo de 158 px en un teléfono angosto, donde un alto fijo deformaría la foto.

**Sin foto no hay tarjeta.** Una fila sin miniatura se ve pobre; una tarjeta sin imagen se lee como *rota*, y quien la ve no culpa al aviso sino al sitio. El aviso sin portada se cuenta pero no se dibuja (F9).

#### La miniatura de 44 × 34, y por qué sigue declarada

`--tw`/`--th` (44 × 34) y `--twd`/`--thd` (64 × 48) siguen en el conjunto porque **siguen vistiendo dos superficies**: la fila de `/mis-avisos` y el subidor de fotos del paso 2 de publicar. Lo que ya no visten es el camino de lectura, que es la anatomía que este apartado describía.

**Contradicción abierta, verificada y NO resuelta acá — requiere al fundador.** Ninguna de las nueve láminas dibuja una miniatura de 44 × 34, y la de `/mis-avisos` (artboards 14c y 14d) dibuja **74 × 56**, que no es ninguno de los dos pares. El código usa `--tw`/`--th`. No se cambió de oficio porque mover esa miniatura es un cambio visible que ninguna tarea pidió y ninguna decisión del fundador cubre.

### Layout de escritorio

- Contenedor: 1100px centrado, dentro de viewport de 1280.
- **Sin barra lateral de filtros.** La lámina 7c lo escribe con todas las letras: *«Sin barra lateral: los filtros viven solo en el modal»*. Lo entregó la 14.33, **resuelta por el fundador el 2026-08-26 «en TODOS los anchos»**, y lo que la lista compró con ese ancho es la cuarta columna de la cuadrícula.
- Columna de resultados: el ancho entero del contenedor.
- Ficha: foto 640px + columna de datos de 420px fija y sticky. *(Los 328 px que la tabla §8 de la especificación de la ficha pone bajo «Escritorio» son el ancho útil del **teléfono**: la lámina de escritorio no dibuja ningún bloque de 328 y la móvil lo dibuja seis veces — medido, tarea 16.29.)*
- Formularios: una sola columna de 600px.
- **La puerta de entrar** (láminas 8b/9b, tarea 15.8): en móvil es una hoja que sube desde abajo y ocupa el ancho; en escritorio es un diálogo de **460px** (`--door-w`) centrado sobre el aviso oscurecido. El sistema no definía ni el velo, ni el radio de 18 que las dos láminas dibujan (`--r` es 12), ni una sombra de esa escala, así que se extiende con `--scrim` (era `--door-veil` hasta la 14.46), `--door-r`, `--door-w`, `--door-shadow` y `--door-sheet-shadow` — no se escriben literales en la hoja del componente. Las medidas dibujadas se comprueban en `tests/measure/puerta.spec.ts`, no en la hoja.
- **El velo de los modales** (`--scrim`, tarea 14.46). Un modal se dibuja sobre lo que había, y sin un token de velo la única salida que dejaba `lint:tokens` era tapar el viewport con `var(--surface)`: un token, gate en verde, y una hoja opaca donde la 14.33 dice modal. Lo usan la puerta de entrar y el panel de filtros, y **tiene par claro/oscuro** — a diferencia de `--viewer-scrim`, que vive fuera del tema a propósito. La razón está medida y no es de gusto: el velo de `menta` (`rgba(30,32,34,.55)`, el que dibuja la lámina 9b) separa el fondo velado de la lámina **3,98:1** contra 1,10:1 sin velo, y ese mismo velo en `oscuro` da **1,13:1 contra el 1,15:1 que el tema ya tenía sin nada** — oscurecer un fondo ya oscuro no separa, empeora. La cuenta la hace `components/design-contract.test.tsx` contra `src/styles/tokens.css`, y el color que sale del compositor lo mide `tests/measure/layout.spec.ts` en un navegador.
- Altura mínima de control: **44px en las dos pantallas**. Era 36 en escritorio; **decidido por el fundador el 2026-08-27** (tarea 16.24) porque de los tres candidatos —36, los 40 de su especificación y 44— **sólo 44 alcanza WCAG 2.2 SC 2.5.5 (AAA)**. Los botones de acción miden 46 (`--action-h`), que es un valor propio y no una variante de éste.

## Jerarquía de botones

Tres niveles, y no deben mezclarse:

1. **Acción** — relleno `--accent`, texto `--accent-ink`. Publicar, Continuar, Renovar, Crear.
2. **Selección / estado** — fondo `--tint`, borde y texto `--accent`. Toggle Dueño/Inmobiliaria, ciudad, habitaciones, chips activos. Comunica estado, no invita a enviar.
3. **Neutro** — borde `--strong`, sin relleno, texto `--ink`. Cancelar, Corregir archivo.

## Distinción dueño / inmobiliaria

Requisito central de confianza. Debe leerse en escala de grises:

- **Dueño**: badge con relleno `--ink` y texto `--surface` (invertido).
- **Inmobiliaria**: badge con borde `--strong`, sin relleno, texto `--soft`.

El badge **no** usa el color de acento: el contraste es relleno vs borde. Aparece en toda superficie donde figure un aviso: lista, ficha, página de zona, mis publicaciones.

## Screens / Views

### 1. Resultados de búsqueda

**Propósito:** la pantalla del producto. El inquilino filtra por ciudad, zona y precio, y compara.

**Layout móvil (360, lámina 6c):** barra de marca 60px con la **pastilla de búsqueda** dentro → miga de pan → título de la pantalla → conteo de resultados → fichas de filtro puesto, quitables de a una → **cuadrícula de dos columnas de 158px** → paginación.

**Layout escritorio (1280, lámina 7c):** barra de 68px con marca, pastilla al centro y las acciones contra el borde → contenedor 1100, **sin barra lateral** → miga de pan, título, conteo → fichas de filtro puesto → **cuadrícula de cuatro columnas de 254px** → paginación. Los filtros viven sólo en el modal, que se abre desde la propia pastilla y **por dirección**, no por un manejador de clic. **El modal va sobre la lista, no en lugar de ella** (14.46): velo `--scrim` de borde a borde y la hoja como tarjeta de 800 con borde y `--r`. La lámina 7b lo dibuja distinto —panel sobre una banda de `--bg`, sin velo— y ahí la lámina queda corregida por la 14.46, igual que la 16.24 corrigió su `min-height:40px`. En el teléfono no hay tarjeta: la lámina 6b dibuja una pantalla completa y así se entrega.

**Tarjeta de resultado:** portada 4:3 arriba, y debajo, en este orden de documento: placa de publicador, precio, título recortado a dos líneas, metadatos (`zona · N hab · N m²`). El precio va antes del título en el orden de lectura y con más peso visual. Un solo enlace por tarjeta —su nombre accesible es el título— y el área tocable se extiende a la tarjeta entera con un `::after`, porque dos líneas de texto no llegan a 44px de forma confiable y errarle en una cuadrícula de dos columnas abre el aviso de al lado.

**Densidad:** cuadrícula de tarjetas con portada. Ver la corrección de abajo — este documento decía lo contrario.

**Orden de la lista:** la lámina 7c dibuja **«Recientes ▾»** junto al conteo. **No está construido**: hoy el orden lo fija el adaptador de búsqueda y no se puede cambiar desde la pantalla. Queda como tarea 14.47, y con una consecuencia que no es cosmética — si el orden es parte de la dirección entra en `FILTER_KEYS`, porque la misma lista en otro orden es la misma página.

> **Corrección medida, primera vuelta (2026-08-16).** Este documento decía "10 propiedades sobre el pliegue de 640px" como criterio de aceptación. No se sostenía contra el propio mockup: con la anatomía de fila de entonces entraban **cinco**. **El criterio implementado no fue un conteo sino una cota: la fila no supera 96px a 360px.** Un conteo se mueve con la tipografía del sistema, el alto del encabezado y el largo de un título — o sea, falla por razones que no son la regresión que quería detectar.
>
> **Corrección medida, segunda vuelta (2026-08-28): la fila ya no existe en el camino de lectura.** La reemplazó la tarjeta (14.25, PR #77) y la cuadrícula ganó una columna al irse la barra lateral (14.33). El criterio de aceptación de la densidad vuelve a ser un conteo, y esta vez a propósito, porque lo que se cuenta es una caja de alto fijo y no una de alto tipográfico: **4 avisos completos sobre el pliegue a 360 px y 6 a 1280** (tarea 14.29, todavía sin medir; lo que sí se mide hoy es que a 1280 la primera fila lleva cuatro tarjetas).
>
> **Corrección medida, tercera vuelta (2026-09-02): el conteo se midió, y el criterio lo revisó el fundador — son 2 y 4.** El «6 a 1280» de arriba es anterior a la 14.33 y la lámina 7c lo corrige sola («cuatro columnas de 254: 8 avisos sobre el pliegue, contra 6 antes»), así que el objetivo de las láminas era **4 y 8**. Medido con Chromium real sobre `app/measure/lista` (14.29): entran **2 y 4**. La 14.53 construyó las dos decisiones que el fundador tomó ese día —las fichas quitables fuera del teléfono, la placa del publicador encima de la portada— y ganó 181 px en el teléfono y 54 en escritorio sin mover el conteo; lo único que faltaba era el encabezado de tres líneas (miga de pan, `<h1>`, conteo) que las láminas no dibujan. **El fundador eligió conservarlo**: preguntó primero si la lista se puede bajar —sí—, y decidió que **volver, en un teléfono, vale más que un aviso y medio**, porque la miga de pan es la salida que la 14.41 dejó puesta. **Las láminas siguen dibujando 4 y 8 y el producto sirve 2 y 4**; la diferencia son 35 px en el teléfono y 33 en escritorio, y queda escrita acá para que no se lea como una lámina cumplida.
>
> **Y la primera vuelta tenía razón en algo que costó un rojo de CI comprobar.** Aquélla escribió que *«un conteo se mueve con la tipografía del sistema»* y por eso prefirió una cota. La medición del 2026-09-02 encontró la otra mitad: **el conteo NO se movió entre plataformas —2 y 4 en macOS y en el Linux de CI— y la cota en píxeles SÍ**, 35 contra 69 sobre el mismo commit. La causa está medida: la línea de metadato de la tarjeta ocupa 131,3 px de los 136 disponibles a 360 —4,7 px de holgura— y `system-ui` no resuelve a la misma fuente en las dos, así que se pliega y cada tarjeta crece 16,8 px. En escritorio la misma frase tiene 100,7 px de holgura y las dos máquinas coinciden al píxel. **Sobre esta pantalla, el conteo es la medida portátil y el píxel no**; y de paso queda dicho que en un teléfono el metadato de la tarjeta está a un pelo de plegarse, o sea que un aparato con una fuente de sistema más ancha ve cada tarjeta 17 px más alta.

> **Lo que decide si la cuadrícula sobrevive sigue siendo el peso, no el gusto** (14.27). El argumento original de «fila y nunca cuadrícula» era el presupuesto de bytes: una cuadrícula de portadas de 158px gasta el margen que hoy queda entre la página y su tope de 150 KB. `budget:bundle` y Lighthouse son las que contestan, y hay que mirarlas antes de dar la cuadrícula por buena.

**Paginación:** enlaces `GET`, no scroll infinito (requisito de "sin JS").

### 2. Ficha del aviso

**Propósito:** decidir si vale escribirle a quien publica, y obtener el contacto.

**Layout móvil:** barra con "← Resultados" y el badge de publicador → foto principal 180px → precio, título, ubicación → tira de cuatro datos en fila con separadores (hab / baños / m² / puesto) → descripción → bloque de contacto → enlace de reporte.

**Layout escritorio:** grid `640px 1fr`. Izquierda: foto de 640×360, tira de tres miniaturas de 120×90, descripción a 520px de ancho, enlace de reporte. Derecha: tarjeta sticky con precio, título, datos y bloque de contacto.

**Bloque de contacto (con llave):** recuadro con borde punteado `--strong` y fondo `--bg`. Texto: "El contacto se muestra a usuarios registrados". Botón de acción: "Ver WhatsApp del dueño". Debajo, en escritorio: "Rentas no participa en la negociación. Verificá la propiedad antes de entregar dinero."

Debe verse que el teléfono existe y qué falta para verlo. Nunca ocultar el bloque entero.

**Fotos:** sin carrusel. Las miniaturas son enlaces a la foto siguiente. Una sola foto grande en el camino crítico.

### 3. Publicar — paso 1 de 2

**Propósito:** la única pantalla compleja del lado de la oferta. El dueño la llena de pie, con una mano.

**Campos, en orden:** publicás como (toggle Dueño / Inmobiliaria) · título · precio mensual en dólares · ciudad · zona · descripción.

**Validación:**
- Obligatorio se marca con el glifo `✱` **más la palabra "obligatorio"**, nunca solo con color.
- Campo en error: borde de 2px `--err` y mensaje propio debajo (`✱ Mínimo 120 caracteres. Vas 24.`), además del texto de ayuda neutro.
- Descripción: mínimo 120 caracteres, con contador.
- Precio: solo el número; todos los precios están en dólares.
- El toggle dueño/inmobiliaria no se puede cambiar después de publicar; el texto de ayuda lo dice.

**Copia de cierre:** "Tu aviso queda activo 30 días. Te avisamos antes de que venza."

Es un formulario, no un embudo de cinco pasos. Paso 2 son las fotos (el único lugar donde se permite JS, para comprimir en el dispositivo antes de subir).

### 4. Página de zona

**Propósito:** aterrizaje de búsqueda orgánica. Una por zona. Tiene que ser indexable y renderizada en servidor.

**Layout:** encabezado con miga de pan (`Inicio › Distrito Capital › Chacao`), título `Alquiler en Chacao` y una línea de resumen con conteo y rango de precios reales. Luego la misma lista de resultados. En escritorio, barra lateral con zonas cercanas y su conteo.

**Bloque de aporte:** fondo `--tint`, borde `--accent`, radio `--r`. Texto: "Rentas es gratis y sin comisión. Si te sirve, podés colaborar." Botón neutro "Colaborar" y una × de descarte de 44px. Es descartable y no debe empujar los resultados abajo del pliegue.

### 5. Mis publicaciones

**Propósito:** que quien publica vea el estado de sus avisos y renueve.

**Cinco estados, y el estado NO es un badge:** es una **línea de metadato con color**, debajo de la de `zona · N hab · N m²`. Resincronizado 2026-08-28 contra los artboards 14c y 14d, que es donde se ve; este documento describía cuatro estados y una pastilla.

| Estado | Línea de estado | Recuadro de la fila | Acción en la fila |
|---|---|---|---|
| Activa | `--soft` — "Activa · vence en 22 días" | neutro | ninguna |
| Vence pronto | `--warn` — "Vence en 3 días" | fondo `--warn-bg`, borde `--warn` | **Renovar 30 días** (acción) |
| Vencida | `--soft` — "Vencida el 2 de agosto", con precio y título atenuados a `--soft` | neutro | **Volver a publicar** (neutro) |
| Oculta | `--err` — "Oculta por reportes" | fondo `--err-bg`, borde `--err` | ninguna |
| **Borrador** | `--ink` — "Borrador · faltan fotos" | **borde punteado `--strong`**, y el marcador de foto también punteado | **Subir fotos** / **Publicar** |

El color aparece solo en los dos estados que piden algo. Activa y vencida son neutras.

**El borrador se distingue por punteado y no por un color nuevo** — la anotación al pie de 14d lo dice: el punteado se lee en blanco y negro sin robarle urgencia al `--warn` ni al `--err`. Es el quinto estado porque la importación de cartera crea avisos sin fotos, y fotografiar cincuenta propiedades toma una semana mientras importarlas toma un minuto: por eso los borradores van primero y con su cuenta, no escondidos al pie de una lista de cincuenta.

**Las fichas de filtro por estado** (una por estado, más «Todos», con su conteo) usan el **nivel 2 de la jerarquía de botones** cuando están elegidas: relleno `--tint`, borde y texto `--accent`. **Decidido por el fundador el 2026-08-28**, después de que la pantalla las dibujara con relleno `--tint` pero borde `--strong` y texto `--ink` — el mismo componente pintado con dos idiomas según la pantalla.

**Layout escritorio:** grid `120px 1fr 200px` — la acción vive en su propia columna, alineada a la derecha.

### 7. La pastilla de búsqueda y la barra que la lleva

**Faltaba entera en este documento**, y no es una pantalla sino el componente que aparece en casi todas: se agregó el 2026-08-28 al resincronizar contra las láminas del 2026-08-25, donde tiene su propio artboard (14i).

**Tres piezas dentro de un mismo borde y sin divisores:** el texto, el control de filtro y la lupa. La pastilla es un `<form method="get">` de verdad — sin script sigue buscando, y las sugerencias al escribir son una mejora encima, nunca el mecanismo.

| Estado | Qué dibuja |
|---|---|
| vacía | "¿En qué zona buscás?" y la lupa. **El control de filtro no aparece**: sin búsqueda no hay nada que filtrar |
| con zona | el nombre de la zona y, en la segunda línea, el conteo — "9 avisos" |
| con filtros puestos | la etiqueta del control pasa a "3 filtros" en `--accent`. **Sin badge: la palabra dice el estado** |

**En móvil el filtro pierde la palabra, nunca el número:** a 360 px "Filtros" le robaba 44 px al nombre de la zona, y el nombre es contenido.

**El conteo de la pastilla NO es el del engranaje.** Es el del engranaje **menos la zona**, porque desde la resolución de ubicación del fundador la ubicación vive sólo en la ruta y ya no es un filtro del panel — la lámina 7c lo dibuja: con dos zonas, precio, habitaciones y dueños puestos, la pastilla dice «3 filtros», no 4.

**Está en cuatro pantallas y en la ficha NO**, acotado por el fundador el 2026-08-25 (*«seguí el diseño, que fue lo que se decidió acá»*): ninguna de las dos láminas de la ficha la dibuja, y una ficha no es una búsqueda — no hay nada que filtrar ni conteo que resumir. La ficha lleva en su lugar el enlace de vuelta.

**La barra que la contiene** es una sola con puntos de quiebre, nunca dos implementaciones: `--nav-h` 60px en móvil y `--nav-h-desktop` 68px, en grid `250px 1fr 250px` a 1280 con la pastilla en la columna del centro y las acciones contra el borde. En la ficha a 1280 la marca **no cede**: el `←` toma un tercer slot y la marca se corre al centro; a 360 sí cede, porque no caben tres. Las dos láminas tienen razón y describen anchos distintos (14.40, resuelto por el fundador el 2026-08-25).

**Publicar depende de la sesión** (14.38, resuelto por el fundador el 2026-08-25): sin sesión queda afuera y en acento, que es cuando hay que provocar; con sesión se muda a la primera fila del menú de cuenta.

### 6. Importar cartera

**Propósito:** el corredor carga 20–50 propiedades de un archivo. Requiere habilitación por cuenta, hecha a mano por el operador.

**Layout escritorio:** dos contadores (listas / con error, el de error en `--err`) → línea de explicación → tabla de vista previa con columnas `Fila · Referencia · Precio · Zona · Habitaciones · Título · Problema`, en grid de ancho fijo, sin scroll lateral → dos acciones al pie.

**Filas con error:** primero en la tabla, con fondo `--err-bg` y borde izquierdo de 3px `--err`. El problema se explica en lenguaje llano y menciona el valor ofensor: `«El Rosal» no existe en Maracaibo`, `Falta el precio`.

**Layout móvil:** la tabla se convierte en tarjetas de error, una por fila con problema, más un resumen de las filas correctas. No es una tabla con scroll.

**Acciones:** "Crear las 38 propiedades" (acción) y "Corregir el archivo y volver a subir" (neutro).

### 8. Entrar — la pantalla con su propia dirección

**Propósito:** es la puerta que se pega en un correo y a la que Google devuelve. La hoja de la ficha (§Layout de escritorio, «La puerta de entrar») no la reemplaza porque una hoja no tiene dirección.

**Layout móvil (360, lámina 8a):** barra con `← Volver` a la izquierda y la marca al centro → título → motivo → botón «Continuar con Google» a todo el ancho → línea legal; y debajo, sólo por la puerta de publicar, la caja `--bg` con los tres pasos.

**Layout escritorio (1280, lámina 9a):** misma barra con la marca a la izquierda y la vuelta contra el borde → dentro del contenedor de 1100, cuadrícula de **420 + 80 + 600**: el motivo y el botón en la columna de 420 y los pasos al costado, «así el botón queda alto». El 420 es el mismo ancho de la columna de datos de la ficha y se escribe literal como en `DetailSplit`: es una medida estructural que este documento ya fija, y un segundo nombre para un valor existente hace discrepar la paleta. Medido en `tests/measure/entrar.spec.ts`, no declarado en la hoja.

**Lo que dice depende de por qué puerta se entró** (`signInPageFor`, `src/modules/identity/domain/sign-in-page.ts`): publicar trae los tres pasos, un aviso trae la promesa de vuelta, y la cuenta no promete ninguno de los dos. La copia es de producto y vive en el dominio, no en la pantalla.

**Desvíos de la lámina, deliberados.** El `<h1>` usa `--title-fs` como el de todas las demás pantallas, y no el 22/28 que estas dos láminas dibujan sólo acá: un tamaño de encabezado propio de una pantalla es cómo empieza la deriva. El enlace de vuelta va en `--ink`, igual que el «← Resultados» de la ficha, y no en `--accent`. El campo de correo y su botón «Enviarme el enlace» **no están dibujados todavía**: desembocan en la pantalla de espera, que no existe (tarea 15.9). Y el botón va **sin la marca de Google**, en el nivel 1 — ver Assets y la tarea 22.20.

## Interactions & Behavior

- **Navegación:** enlaces reales. Resultados → ficha, ficha → resultados, zona → ficha.
- **Filtros:** formulario `GET`. Cada cambio recarga con la query en la URL, así el estado es compartible e indexable.
- **Ciudad:** cambiar de ciudad descarta los filtros de zona. Una búsqueda en Maracaibo nunca puede devolver ni sugerir algo de Distrito Capital.
- **Contacto:** el botón lleva a registro/login; al volver, la ficha muestra el número completo.
- **Sin animaciones de entrada, sin carruseles, sin efectos al hacer scroll.**
- **Foco de teclado:** visible en todo control, con el contorno del navegador o un anillo propio de contraste suficiente.
- **Responsive:** un solo punto de quiebre relevante entre el layout móvil de una columna y el de escritorio con barra lateral. Sin scroll horizontal a 360px.

## State Management

Poca. El camino de lectura no tiene estado en cliente.

- **Servidor:** query de búsqueda (ciudad, zonas, precio mín/máx, habitaciones, orden, página), sesión del usuario (para revelar el contacto), avisos del usuario y sus estados, resultado del parseo del archivo importado.
- **Cliente (único lugar permitido):** paso 2 de publicar — selección, compresión y previsualización de fotos antes de subirlas; e importar cartera, para la vista previa del archivo.
- **Vencimiento:** los avisos duran 30 días. Se necesita un trabajo programado que marque "vence pronto" (3 días antes), "vencida", y dispare el correo de recordatorio.

## Assets

Ninguno propio. No hay logotipo: la marca es la palabra "rentas." en el stack del sistema. Los rectángulos con trama diagonal son marcadores de foto — las fotos reales las suben los usuarios.

**Glifos de texto por defecto.** `←`, `✓`, `✱`, `×`, `·` son caracteres, no imágenes: no piden red, heredan el color y la métrica del texto que los rodea, y escalan con el tipo.

**Y un conjunto CERRADO de dos SVG en línea** (decisión del fundador, 2026-08-25), que son los de la pastilla de búsqueda:

| Glifo | Uso | Por qué no es un carácter |
|---|---|---|
| tres rayas | el contador de filtros | no hay carácter que signifique "filtro" sin ambigüedad |
| lupa | la acción de buscar | `◎` se lee como un ojo, no como una lupa |

Las condiciones son parte de la regla, no una sugerencia:

- **En línea, nunca un paquete de iconos.** Dos SVG pesan menos de 200 bytes; una librería pesa decenas de KB y trae cientos que nadie usa.
- **`aria-hidden="true"`** y su etiqueta accesible al lado — la lupa va dentro de un enlace con `aria-label="Buscar"`.
- **`stroke="currentColor"`**, así heredan el color como lo haría un carácter.
- **El conjunto es cerrado.** Un tercer icono no se agrega: se discute. Esta tabla es la lista completa, y ampliarla es cambiar el sistema, no usarlo.

## Contenido real usado

Los mockups no usan texto de relleno. Cualquier dato nuevo debe seguir este registro.

- **Zonas de Distrito Capital:** Chacao, Altamira, La Castellana, Los Palos Grandes, El Rosal, Las Mercedes
- **Zonas de Maracaibo:** Tierra Negra, Bella Vista, La Lago, Indio Mara
- **Precios:** de $250 a $900 mensuales
- **Títulos como los escribe la gente:** "Apartamento 2 habitaciones con puesto de estacionamiento" · "Apto amoblado cerca del metro, edificio con vigilancia" · "Estudio en Altamira, ideal para una persona" · "Apartamento amplio en La Castellana, 3 habitaciones"
- **Detalles que importan en este mercado:** planta eléctrica, vigilancia 24 horas, agua regular, puesto de estacionamiento, línea blanca incluida, depósito de dos meses

Idioma: español de Venezuela, neutro y directo, sin regionalismos marcados. Voseo en instrucciones ("Contanos", "Revisá", "Verificá"), consistente en toda la interfaz.

## Cambiar de estilo después, sin rehacer nada

La combinación entregada es **Directorio compacto + Menta**, pero el diseño se exploró como dos ejes independientes, y la implementación debe conservarlos:

- **Eje de estilo** (`data-theme`): color, radio de esquina, relleno de controles. Nueve valores.
- **Eje de estructura** (`data-layout`): densidad de fila, tamaño de miniatura, escala del precio, tipografía de títulos. Cuatro valores.

`tokens.css` trae los 13 conjuntos completos. Son 36 combinaciones válidas.

**Regla de implementación, no negociable para esto:** ningún componente escribe un hex, un radio, un tamaño de miniatura o un tamaño de precio literal. Todos leen variables CSS. Con eso, cambiar de combinación es cambiar dos atributos:

```html
<html data-theme="menta" data-layout="compacto">
<!-- pasar a utilitario + estándar: -->
<html data-theme="bronce" data-layout="estandar">
```

Si el codebase usa Tailwind, mapear los tokens en `theme.extend` para que las utilidades resuelvan a `var(--...)`. Si usa CSS-in-JS, exponerlos igual como variables, no como objeto de JS: el cambio tiene que funcionar sin reconstruir ni recargar estado.

El criterio de aceptación de esta parte: cambiar los dos atributos en el inspector del navegador debe repintar la aplicación completa y correctamente. Si algo no cambia, ahí quedó un valor literal.

### Valores de los dos ejes

| `data-theme` | Acento | Radio | Notas |
|---|---|---|---|
| `bronce` | `#6b5518` | 6px | Utilitario. Neutro cálido |
| `tinta` | `#1f4b7a` | 8px | Institucional. Neutro frío |
| `papel` | `#245a42` | 8px | Papel cálido, verde profundo |
| `suave` | `#4a4f7a` | 16px | Controles con relleno, badges en pastilla |
| `senal` | `#b3261e` | 10px | Gris neutro, rojo de acción |
| `menta` | `#272343` | 12px | **Entregado.** Azul profundo sobre gris frío |
| `coral` | `#cc4f34` | 12px | Terracota sobre gris verdoso |
| `violeta` | `#D7C5DF` | 12px | Oscuro. Lila claro sobre violeta |
| `oscuro` | `#d8a13a` | 10px | Oscuro. Dorado sobre gris azulado |

| `data-layout` | Miniatura móvil | Precio en lista | Tipografía de precio | Densidad relativa |
|---|---|---|---|---|
| `estandar` | 96 × 72 | 17px / 800 | sans | media |
| `compacto` | 44 × 34 | 15px / 700 | mono | **alta** (entregado) |
| `barrio` | 80 × 80 | 19px / 700 | serif | media |
| `editorial` | 64 × 64 | 18px / 700 | sans | baja |

Advertencia al cambiar de estructura: solo `compacto` y `estandar` cumplen el presupuesto de bytes con holgura. `editorial` usa mucho aire vertical, lo que en un catálogo chico se lee como vacío. Si se cambia de estructura hay que volver a medir dos cosas: la cota de alto de fila y el tamaño del derivado de miniatura.

Los dos ejes se dejan tokenizados por dos razones prácticas, más allá de poder cambiar de opinión: `violeta` y `oscuro` son la base de un modo oscuro real vía `prefers-color-scheme`, y `compacto` es candidato a una preferencia de densidad del usuario.

## Files

- `Rentas - Compacto Menta.dc.html` — las seis pantallas en móvil y escritorio, con la combinación elegida fija. Abrir en el navegador.
- `tokens.css` — los nueve estilos y las cuatro estructuras como variables CSS, listos para copiar al proyecto.
- `support.js` — runtime de la herramienta de diseño. Necesario solo para que el HTML de referencia se abra; **no** portarlo.

Las líneas punteadas horizontales con la etiqueta "640" son guías de diseño que marcan el pliegue del móvil, y las listas en monoespaciado bajo cada pantalla son notas para el diseñador. Ninguna de las dos es parte de la interfaz.

## Lo que este documento decía y por qué cambió

**El sistema se escribió antes que las pantallas, y ése es el origen de todo lo de abajo.** Cuando arrancó el proyecto no había láminas: esta anatomía de componentes se redactó como **hipótesis**. Las nueve pantallas llegaron el **2026-08-25** y contestaron distinto en varios puntos. Nadie rompió el sistema — el sistema se escribió primero.

Se deja escrito porque dentro de tres meses alguien va a leer «nunca una cuadrícula» en una versión vieja, o en un `.dc.html` histórico, y va a creer que se violó una regla.

| Decía | Dice | Qué lo cambió |
|---|---|---|
| «Nunca convertir la lista en cuadrícula de tarjetas» y «lista densa, nunca grilla de tarjetas» | Cuadrícula de tarjetas con portada: 2 columnas de 158 en móvil, 4 de 254 en escritorio | Las láminas 6c y 7c del **2026-08-25**, entregadas por la 14.25 (PR #77) y la 14.33. El argumento original era el **peso**, no el gusto, y sigue vivo como la tarea 14.27 |
| Barra lateral de filtros de 240px, `sticky` | Sin barra lateral: los filtros viven sólo en el modal, **en todos los anchos** | Lámina 7c, y **el fundador el 2026-08-26** cerrando la 14.33. La cuarta columna de la cuadrícula es exactamente lo que se compró con ese ancho |
| Fila de resultado con miniatura de 44 × 34 | La fila no está en el camino de lectura. `--tw`/`--th` siguen vistiendo `/mis-avisos` y el subidor de fotos | La misma cuadrícula. **Ninguna lámina nueva dibuja 44 × 34**, y la de `/mis-avisos` dibuja 74 × 56 — contradicción abierta, anotada arriba |
| `/mis-avisos`: cuatro estados, cada uno un **badge** | Cinco estados, y el estado es una **línea de metadato con color** | Artboards 14c y 14d. El quinto es **Borrador**, que la importación de cartera hace inevitable |
| El panel de filtros sobre una banda de `--bg`, opaco de borde a borde (lámina 7b) | Modal sobre la lista: velo `--scrim` y la hoja como tarjeta en escritorio | La **14.46**, posterior a la lámina. La 7b no dibuja velo ninguno; el único que el diseño dibuja es el de la puerta (9b) y es el que se toma |
| Criterio de densidad: **4 avisos completos sobre el pliegue a 360 y 6 a 1280** (segunda vuelta; el 6 es anterior a la 14.33 y la 7c lo corrige a 8) | **2 y 4** | Medido con Chromium real (14.29) y **revisado por el fundador el 2026-09-02**: las láminas dibujan 4 y 8, y llegar pedía sacar el encabezado de tres líneas. Eligió conservarlo — la miga de pan es la salida que la 14.41 dejó puesta, y *volver en un teléfono vale más que un aviso y medio*. Las dos decisiones que sí tomó están construidas en la **14.53** |
| Nada sobre la pastilla de búsqueda | Su propia sección, con sus tres estados | Artboard 14i, más las acotaciones del fundador del **2026-08-25** (14.30b, 14.38, 14.40) |
| «No hay iconos» | Conjunto **cerrado** de dos SVG en línea: las tres rayas del filtro y la lupa | **RESUELTO por el fundador el 2026-08-25** (14.37). Ganó la lámina, y el sistema quedó con las condiciones escritas |
| Altura mínima de control: 36px en escritorio | 44px en las dos pantallas | **Decidido por el fundador el 2026-08-27** (16.24): es el único de los tres candidatos que alcanza WCAG 2.2 SC 2.5.5 (AAA) |
| Precio en ficha 26px | 30px en móvil, 34px en escritorio | Lámina móvil de la ficha contra la tabla §8 de la especificación, que escribe 28 dos veces. **Manda la lámina** (16.23) |
| Precio en lista 15px, un solo valor | Precio **en tarjeta** 16/17; el 15 es el de la fila | Láminas 6c y 7c. Las dos tienen razón porque describen anchos distintos, la misma resolución que la 14.40 usó para el nav |
| `--fpb` («Precio en ficha», 26px) forma parte del conjunto que ship*a* | **El subconjunto que ship*a* lo omite a propósito.** Sigue declarado en `design/reference/sistema/tokens.css` para las cuatro estructuras, porque la referencia describe el SISTEMA; `src/styles/tokens.css` describe lo que este producto usa, y no lo usa | **Decidido por el fundador el 2026-08-29** (16.37, salida A). El papel que `--fpb` nombra lo cumple `--ficha-price-fs` (30/34) desde la 16.23, así que quedaba un token del sistema sin un solo `var(--fpb)` conviviendo con uno propio haciendo su trabajo — que es exactamente cómo el `<h1>` del inicio terminó agarrando `--fpb`. **`lint:tokens` no puede ver un token sin uso**: verifica que un valor SEA una propiedad personalizada, nunca que alguien la use |
| Cuerpo 15/1.6 en las dos pantallas | **15/1.6 en móvil y 16/1.65 en escritorio**, para las ocho pantallas que comparten el par | **Decidido por el fundador el 2026-08-29** (16.38, salida A). La tabla §8 de la especificación de la ficha da 15/1.6 para las dos y la lámina de escritorio dibuja 16/1.65: **manda la lámina**. El fundador vio el alcance antes de elegir — 20 declaraciones en 8 hojas — y eligió que crezcan todas, en vez de darle a la ficha un token propio y dejar a las otras siete más chicas sin que ninguna lámina lo pida |

**El orden de autoridad, fijado por el fundador:** manda la lámina, y donde una decisión posterior del fundador corrigió una lámina, manda la decisión. Las dos direcciones ya ocurrieron: *«la lámina de móvil tenía el bug — el panel NO lleva ciudad ni zona»* (14.36) corrigió una lámina, y *«seguí el diseño, que fue lo que se decidió acá»* (14.40) corrigió un texto del plan.

**Lo que queda abierto y NO se resolvió acá** — cada uno necesita al fundador, y ninguno se decidió en silencio:

1. La miniatura de `/mis-avisos`: el código usa `--tw`/`--th` (44 × 34) y las láminas 14c/14d dibujan 74 × 56.
2. La tipografía de la tarjeta: las láminas dibujan título 12,5/13 y metadato 10,5/11 en `--meta`, contra los 13 y 12/600/`--sans` que declara la tabla de arriba.
3. La franja de 768 a 1099 px no está dibujada en ninguna lámina (tarea 20.10). Los nueve artboards son 360 o 1280, y es justo donde se rompe una cuadrícula.

**Y dos donde el fundador YA decidió, y lo que queda es corregir la lámina** (2026-08-29). Se anotan acá porque en los dos casos manda la decisión posterior y no el dibujo, que es el orden de autoridad fijado arriba:

4. **El mes abreviado: la lámina dice «12 sep» y el producto escribe «12 sept.»** (16.40). `Intl.DateTimeFormat("es-VE", { month: "short" })` devuelve la abreviatura del CLDR, con punto y con cuatro letras en septiembre. **El fundador eligió quedarse con lo que da el idioma**: la única salida que produce exactamente lo dibujado es una tabla de doce literales escrita a mano, y eso sería inventar un valor que el sistema no define. Las dos láminas de la Ficha divergen del formato que ship*a* **a propósito**.
5. **El aviso vencido: la lámina y la §6 escriben «y el dueño no lo renovó»; el producto escribe «y no fue renovado»** (16.41). **El fundador eligió la voz pasiva del código**, y la razón es de verdad y no de estilo: un aviso puede ser de una inmobiliaria, y ahí «el dueño» es falso. **Lo que queda pendiente es corregir las dos láminas de la Ficha y la §6 de la especificación**, no el código.

## Cómo se evalúa la implementación

1. ¿Entran **dos** avisos completos sobre el pliegue a 360px y **cuatro** a 1280? (criterio revisado por el fundador el 2026-09-02 — ver la corrección de densidad, tercera vuelta: las láminas dibujan 4 y 8, y la diferencia es el encabezado de tres líneas que él eligió conservar porque volver en un teléfono vale más que un aviso y medio. Se cuenta y no se acota en píxeles: el conteo es igual en macOS y en Linux, la cota de píxeles no)
2. ¿Se distingue dueño de inmobiliaria en blanco y negro?
3. ¿El precio se lee antes que el título?
4. ¿Entra en el presupuesto de bytes?
5. ¿Funciona con JavaScript apagado?
6. ¿Se ve cuidado sin verse caro?
7. ¿Cambiar `data-theme` y `data-layout` en el `<html>` repinta todo, sin excepciones?
