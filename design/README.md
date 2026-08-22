# `design/` — qué es cada archivo

Este índice existe porque los archivos **fueron movidos y renombrados** respecto de
como los exporta Claude Design, y sin un mapa no había forma de saber cuál era cuál.
Eso ya costó una confusión real: buscando el sistema de diseño en
`design_handoff_rentas/` parecía que solo estaba el README, y la conclusión —
equivocada — fue que el resto no estaba en el repo. Estaba, con otro nombre y en
otra carpeta.

**No renombrar estos archivos.** `SISTEMA.md` está referenciado 45 veces fuera de
esta carpeta (el plan, las specs y comentarios de código). Moverlo otra vez rompe
todo eso a cambio de nada.

---

## La carpeta está en transición, y conviene saberlo antes de leer nada

Hay **dos diseños** conviviendo, y no es desorden: es el estado real del proyecto.

| | Dónde | Qué implementa |
|---|---|---|
| **El diseño vigente en el código** | `reference/` | Lo que está construido y desplegado hoy |
| **El diseño nuevo** | `pantallas/` | Lo que se va a construir (fases 14 a 19 del plan) |

`reference/` **no se borra hasta que el código deje de citarlo.** Sus 45 citas no son
decorativas: la mayoría son reglas y copia —"dura 30 días", "mínimo 120 caracteres",
"dueño distinguible en escala de grises"— que el diseño nuevo **no cambia**. Lo que
cambia son los layouts y algunas medidas.

---

## `pantallas/` — el diseño nuevo

Artboards de Claude Design, uno por pantalla y por ancho. Móvil está dibujado a 360
y escritorio a 1280 con contenedor de 1100.

| Archivo | Pantalla |
|---|---|
| `Rentas - Entrar - Mobile.dc.html` | Entrar: página propia, hoja, y espera del enlace por correo |
| `Rentas - Entrar - Desktop.dc.html` | Ídem, con diálogo de 460 px en vez de hoja |
| `Rentas - Ficha - Mobile.dc.html` | Ficha del aviso y visor de fotos |

**Faltan por importar:** Ficha escritorio, Lista y Filtros (móvil y escritorio),
Publicar (móvil y escritorio).

### Puntos de quiebre, y valen para todas las pantallas

| Ancho | Comportamiento |
|---|---|
| `< 768` | versión móvil, fluida con márgenes de 16 |
| `768 – 1099` | contenedor fluido, márgenes de 24 — **sin diseñar** |
| `1100 – ∞` | contenedor fijo en 1100, centrado |
| `1440 · 1920 · 4K` | idéntico a 1280: solo crece el aire lateral |

**El contenedor no se estira nunca.** Lo que escala con el ancho es el número de
columnas, no el tamaño de la tarjeta ni el ancho de un campo. En 4K tampoco se
sirven fotos al doble de densidad: chocaría con el presupuesto de bytes.

---

## `reference/` — el diseño vigente en el código

| Archivo | Qué es | Citas en el código |
|---|---|---|
| `sistema/SISTEMA.md` | **La fuente de verdad de lo construido.** Reglas, medidas y copia por pantalla | 45 |
| `sistema/pantallas-compacto-menta.html` | Los artboards renderizables de las 6 pantallas viejas | 6 |
| `sistema/tokens.css` | Los 4 ejes de estructura × 9 paletas. Verificado idéntico a `src/styles/tokens.css` para `compacto` + `menta` | 4, una es `lint-tokens.mjs` |
| `sistema/support.js` | Runtime que los `.dc.html` necesitan para renderizar | — |
| `BRIEF.md` · `BRIEF-PANTALLAS.md` | El brief que produjo el sistema. **Superado por `SISTEMA.md` donde difieran**, y difieren: fue escrito contra la estructura `estandar` | se conservan por procedencia |

**La combinación adoptada es `data-layout="compacto"` + `data-theme="menta"`**, fijada
en `app/layout.tsx`. Las otras 35 combinaciones viven en `tokens.css` y no se usan.

---

## Qué se borró, y por qué

Eliminados el 2026-08-22, con cero citas en el código:

- **`png/`** — cinco exportes de las pantallas viejas (artboards `2a` a `2e`), 2,3 MB.
  Documentaban el diseño que `pantallas/` reemplaza. El README anterior defendía
  conservarlos porque una revisión de fidelidad encontró nueve diferencias en minutos
  mirando un PNG; ese argumento sigue siendo válido y ahora lo cumplen los `.dc.html`
  de `pantallas/`, que además son navegables. Recuperables con `git show` si hacen falta.
- **`design_handoff_rentas/`** — quedó un README suelto describiendo un movimiento de
  archivos que ya está documentado acá.
