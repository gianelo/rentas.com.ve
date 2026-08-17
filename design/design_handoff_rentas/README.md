# Handoff: Rentas — portal de alquiler residencial (Venezuela)

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
| Precio en lista | 15px / 700 / 1.15 | `--mono`, `font-variant-numeric: tabular-nums` |
| Precio en ficha | 26px / 700 / 1.1 | `--mono`, `letter-spacing: -.02em` |
| Título de página | 20px / 700 / 1.25 | |
| Título de aviso (ficha) | 17px / 600 / 1.35 | `text-wrap: pretty` |
| Título de aviso (lista) | 13px / 400 / 1.35 | recortado a 2 líneas (`max-height: 36px`) |
| Cuerpo | 15px / 400 / 1.55 | ancho de lectura máx. 520px |
| Metadato | 12px / 600 / 1.4 | color `--soft` |
| Badge / etiqueta | 11px / 700 / 1.4 | `letter-spacing: .06em`, mayúsculas |

### Espaciado

Escala: `4 · 8 · 12 · 16 · 24 · 32 · 48`. Nada fuera de esa escala.

| Token | Valor | Uso |
|---|---|---|
| `--rowpad` | `7px 12px` | Padding vertical/horizontal de fila de resultado |
| `--gap` | `8px` | Separación entre miniatura y contenido |

### Geometría de la fila de resultado

| Token | Móvil | Escritorio |
|---|---|---|
| `--tw` / `--th` (miniatura) | 44 × 34 px | — |
| `--twd` / `--thd` (miniatura) | — | 64 × 48 px |

Alto de fila resultante: ~62px en móvil. **Nunca convertir la lista en cuadrícula de tarjetas** — con catálogo chico se ve vacío y baja la densidad.

### Layout de escritorio

- Contenedor: 1100px centrado, dentro de viewport de 1280.
- Barra lateral de filtros: 240px, `position: sticky; top: 24px`.
- Columna de resultados: resto del ancho, `gap: 32px`.
- Ficha: foto 640px + columna de datos de 420px fija y sticky.
- Formularios: una sola columna de 600px.
- Altura mínima de control: 36px en escritorio, 44px en móvil.

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

**Layout móvil (360):** barra de marca 48px → fila de chips de filtro con scroll horizontal contenido, fondo `--bg` → conteo de resultados → filas de resultado → botón de paginación.

**Layout escritorio (1280):** barra 56px con logo y botón Publicar → contenedor 1100 en grid `240px 1fr` con gap 32. La barra lateral trae ciudad (dos opciones exclusivas), zona (checkboxes), rango de precio (dos campos), habitaciones (segmentado 1/2/3/4+) y el botón de acción.

**Fila de resultado:** grid `[miniatura] 1fr`. En la columna de contenido, precio y badge de publicador comparten la primera línea (`justify-content: space-between`); debajo el título recortado a dos líneas; debajo los metadatos (`zona · N hab · N m²`). El precio va antes del título en el orden de lectura y con más peso visual.

**Densidad:** 10 propiedades completas sobre el pliegue de 640px en móvil. Ese número es el criterio de aceptación de esta pantalla.

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

**Cuatro estados:**

| Estado | Badge | Acción en la fila |
|---|---|---|
| Activa | borde `--strong`, texto `--soft` + "vence en 22 días" | ninguna |
| Vence pronto | fondo `--warn-bg`, borde y texto `--warn` + "en 3 días" | **Renovar 30 días** (acción) |
| Vencida | borde `--strong`, texto `--soft`, precio y título atenuados a `--soft` | **Volver a publicar** (neutro) |
| Oculta | fondo `--err-bg`, borde y texto `--err` + "por reportes" | ninguna |

El color aparece solo en los dos estados que piden algo. Activa y vencida son neutras.

**Layout escritorio:** grid `120px 1fr 200px` — la acción vive en su propia columna, alineada a la derecha.

### 6. Importar cartera

**Propósito:** el corredor carga 20–50 propiedades de un archivo. Requiere habilitación por cuenta, hecha a mano por el operador.

**Layout escritorio:** dos contadores (listas / con error, el de error en `--err`) → línea de explicación → tabla de vista previa con columnas `Fila · Referencia · Precio · Zona · Habitaciones · Título · Problema`, en grid de ancho fijo, sin scroll lateral → dos acciones al pie.

**Filas con error:** primero en la tabla, con fondo `--err-bg` y borde izquierdo de 3px `--err`. El problema se explica en lenguaje llano y menciona el valor ofensor: `«El Rosal» no existe en Maracaibo`, `Falta el precio`.

**Layout móvil:** la tabla se convierte en tarjetas de error, una por fila con problema, más un resumen de las filas correctas. No es una tabla con scroll.

**Acciones:** "Crear las 38 propiedades" (acción) y "Corregir el archivo y volver a subir" (neutro).

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

Ninguno propio. No hay logotipo: la marca es la palabra "rentas." en el stack del sistema. No hay iconos: los glifos usados (`←`, `✓`, `✱`, `×`, `·`) son caracteres de texto. Los rectángulos con trama diagonal son marcadores de foto — las fotos reales las suben los usuarios.

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

| `data-layout` | Miniatura móvil | Precio en lista | Tipografía de precio | Avisos sobre el pliegue |
|---|---|---|---|---|
| `estandar` | 96 × 72 | 17px / 800 | sans | 5 |
| `compacto` | 44 × 34 | 15px / 700 | mono | **10** (entregado) |
| `barrio` | 80 × 80 | 19px / 700 | serif | 6 |
| `editorial` | 64 × 64 | 18px / 700 | sans | 4 |

Advertencia al cambiar de estructura: solo `compacto` y `estandar` cumplen el presupuesto de bytes con holgura. `editorial` muestra 4 avisos por pantalla, lo que en un catálogo chico se lee como vacío. Si se cambia de estructura, volver a medir el conteo sobre 640px.

Los dos ejes se dejan tokenizados por dos razones prácticas, más allá de poder cambiar de opinión: `violeta` y `oscuro` son la base de un modo oscuro real vía `prefers-color-scheme`, y `compacto` es candidato a una preferencia de densidad del usuario.

## Files

- `Rentas - Compacto Menta.dc.html` — las seis pantallas en móvil y escritorio, con la combinación elegida fija. Abrir en el navegador.
- `tokens.css` — los nueve estilos y las cuatro estructuras como variables CSS, listos para copiar al proyecto.
- `support.js` — runtime de la herramienta de diseño. Necesario solo para que el HTML de referencia se abra; **no** portarlo.

Las líneas punteadas horizontales con la etiqueta "640" son guías de diseño que marcan el pliegue del móvil, y las listas en monoespaciado bajo cada pantalla son notas para el diseñador. Ninguna de las dos es parte de la interfaz.

## Cómo se evalúa la implementación

1. ¿Cuántas propiedades se ven en la primera pantalla a 360px? (objetivo: 10)
2. ¿Se distingue dueño de inmobiliaria en blanco y negro?
3. ¿El precio se lee antes que el título?
4. ¿Entra en el presupuesto de bytes?
5. ¿Funciona con JavaScript apagado?
6. ¿Se ve cuidado sin verse caro?
7. ¿Cambiar `data-theme` y `data-layout` en el `<html>` repinta todo, sin excepciones?
