# `design/` — qué es cada archivo

Este índice existe porque los archivos **fueron movidos y renombrados** respecto de
como los exporta Claude Design (commit `3193f0f`), y sin un mapa no había forma de
saber cuál era cuál. Eso ya costó una confusión real: buscando el sistema de diseño
en `design_handoff_rentas/` parecía que solo estaba el README, y la conclusión —
equivocada — fue que el resto no estaba en el repo. Estaba, con otro nombre y en
otra carpeta.

**No renombrar estos archivos.** `SISTEMA.md` está referenciado 69 veces fuera de
esta carpeta (el plan, las specs y comentarios de código). Moverlo otra vez rompe
todo eso a cambio de nada.

## Fuente de verdad visual

| Archivo | Qué es | Nombre original en Claude Design |
|---|---|---|
| `reference/sistema/SISTEMA.md` | **La fuente de verdad.** Reglas, medidas y copia por pantalla. Lo que citan el plan y los comentarios | — (escrito acá, a partir del handoff) |
| `reference/sistema/pantallas-compacto-menta.html` | Los artboards renderizables de las 6 pantallas | `Rentas - Compacto Menta.dc.html` |
| `reference/sistema/tokens.css` | Los 4 ejes de estructura × 9 paletas. **Verificado idéntico** a `src/styles/tokens.css` para `compacto` + `menta`: 29 de 29 tokens | `tokens.css` |
| `reference/sistema/support.js` | Runtime que el `.dc.html` necesita para renderizar | `support.js` |
| `png/` | Exportes visuales de las pantallas (índice abajo) | — |

### Qué es cada PNG

Los nombres que exporta la herramienta son opacos (`(1)`, `(2)`…) y **no se
renombran**: renombrar archivos de diseño es lo que produjo esta confusión la
primera vez. Se documentan en su lugar.

| Archivo | Artboard | Pantalla |
|---|---|---|
| `Rentas - Sistema-selection.png` | `2a` | 1 · Resultados de búsqueda |
| `Rentas - Sistema-selection (1).png` | `2b` | 2 · Ficha del inmueble |
| `Rentas - Sistema-selection (2).png` | `2c` | 3 · Publicar, paso 1 de 2 |
| `Rentas - Sistema-selection (3).png` | `2d` | 4 · Página de zona |
| `Rentas - Sistema-selection (4).png` | `2e` | 5 · Mis publicaciones |

No hay export de la pantalla 6 (Importar cartera).

**Cuidado con los pies de página de los PNG.** El de `2a` dice "fila 96×72 en móvil,
120×90 en escritorio", que son las medidas de la estructura `estandar`, no de
`compacto`. Es texto viejo de la era del BRIEF. La medida que rige es la de
`SISTEMA.md` líneas 115–116: **44 × 34 móvil, 64 × 48 escritorio**, que es lo
implementado y de donde salen los 128 × 96 del thumbnail derivado (2×).

**Dos campos que la pantalla 2 dibuja y el schema no tiene**: el bloque de datos de
la ficha muestra `2 HAB · 2 BAÑOS · 78 M² · 1 PUESTO`, y **`baños` y `puesto` no
existen como columnas**. Bloquea la ficha cuando se construya, del mismo modo que
`habitaciones` y `metros²` bloqueaban el formulario.

**La combinación adoptada es `data-layout="compacto"` + `data-theme="menta"`**, fijada
en `app/layout.tsx`. Las otras 35 combinaciones viven en `tokens.css` y no se usan.

### Para qué sirven los PNG, concretamente

Son lo único de esta carpeta que se puede leer **visualmente**. El markdown describe
las reglas pero no la disposición: `SISTEMA.md` dice que el formulario de publicación
pide "ciudad · zona" sin decir que van **lado a lado**, y esa clase de detalle solo
aparece mirando. La primera revisión de fidelidad de la pantalla 3 encontró nueve
diferencias en minutos con un PNG, después de que la versión construida desde el
texto pasara todos los gates.

Pesan ~2.4 MB contra un repo de ~2.3 MB, y se versionan igual: un archivo que solo
existe en el disco de una máquina es el archivo que la próxima sesión no encuentra,
que es precisamente el problema que este índice arregla.

## Histórico — no es la fuente de verdad

| Archivo | Qué es |
|---|---|
| `design_handoff_rentas/README.md` | El handoff original tal como lo entregó Claude Design, sin editar |
| `reference/BRIEF.md` | El brief que produjo el sistema. **Superado por `SISTEMA.md` donde difieran**, y difieren: fue escrito contra la estructura `estandar` |
| `reference/BRIEF-PANTALLAS.md` | Ídem, por pantalla. Es de donde sale el breakpoint de 768px que cita `design.md` |

Se conservan por procedencia: cuando una decisión del plan cita "esto viene del
brief", el brief tiene que existir para poder comprobarlo.
