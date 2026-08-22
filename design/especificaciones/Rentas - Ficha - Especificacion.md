# Rentas — Ficha del aviso

Especificación para implementar. Cubre flujo, UI, colores y reglas.

Archivos de diseño: `Rentas - Ficha - Mobile.dc.html` · `Rentas - Ficha - Desktop.dc.html`
Contexto general: `Rentas - Flujos y funcionalidades.md`

---

## 1. Qué es esta pantalla

La ficha es donde el inquilino decide si escribe o sigue buscando. Todo su contenido es **público e indexable por Google**: es la puerta de entrada al sitio desde una búsqueda. Lo único detrás del registro es el teléfono.

### URL

```
/alquiler/<ciudad>/<zona>/<slug>-<id>
```

Ejemplo real:

```
/alquiler/distrito-capital/chacao/apartamento-2-habitaciones-con-puesto-84512
```

**Foto individual:** la misma ruta + `/foto/<n>`

```
/alquiler/distrito-capital/chacao/apartamento-2-habitaciones-con-puesto-84512/foto/2
```

**Reglas de la ruta**

- El `<id>` al final es lo único canónico. El slug es decorativo: si cambia el título, la URL vieja **redirige 301** a la nueva en vez de romperse.
- `<ciudad>` y `<zona>` en minúsculas, sin tildes, con guiones: `distrito-capital`, `los-palos-grandes`.
- Si ciudad o zona de la URL no coinciden con las del aviso, se redirige 301 a la correcta. Evita que circulen dos URLs del mismo aviso.
- La jerarquía `/alquiler/ciudad/zona/` es la misma de las páginas de zona, así que las tres primeras partes son navegables por sí solas.

---

## 2. Flujo

```
RESULTADOS ──tocar tarjeta──► FICHA
                                │
                    ┌───────────┼────────────┐
       tocar foto   │           │            │  "Ver el WhatsApp"
                    ▼           ▼            ▼
                 VISOR      reportar      ENTRAR
                    │                        │
              ‹ › entre 6                    ▼
              × vuelve             vuelve a LA MISMA FICHA
              a la ficha           con el número completo
```

### Recorrido paso a paso

| # | Usuario | Sistema |
|---|---|---|
| 1 | Llega desde resultados o desde Google | Renderiza la ficha completa en servidor. Solo la primera foto se carga con la página |
| 2 | Desliza la tira de fotos | Carga cada foto al entrar en pantalla. Puntos de posición se actualizan |
| 3 | Toca una foto | Abre el visor en esa foto, con su propia URL |
| 4 | Navega ‹ › | Cada foto es una URL nueva: `…-84512/foto/3`. El botón de volver retrocede **una foto** |
| 5 | Cierra el visor | Vuelve a la ficha, a la posición donde estaba |
| 6 | Lee datos y descripción | — |
| 7 | Toca "Ver el WhatsApp" | Sin sesión: abre entrar (móvil hoja, escritorio diálogo). Con sesión: ya estaba visible |
| 8 | Entra | Vuelve **a esta misma ficha** con el número completo |
| 9 | Toca "Escribir por WhatsApp" | Abre `wa.me` con un mensaje redactado que menciona el aviso |
| 10 | O toca "Reportar" | Formulario de reporte. Un reporte aceptado pasa el aviso a **oculta** |

---

## 3. Estructura de la pantalla

### Orden de lectura, idéntico en móvil y escritorio

1. Barra: "← Resultados" + badge de publicador
2. Galería
3. Precio
4. Título
5. Tipo · zona · ciudad
6. Tira de cuatro datos
7. La propiedad tiene
8. Descripción
9. Quién publica
10. Contacto
11. Advertencia de negociación
12. Reportar + ID + vencimiento

### Móvil 360

Todo en flujo vertical, un bloque debajo del otro. La galería es una **tira horizontal** de hasta 6 fotos con `scroll-snap-align: center` y puntos de posición debajo.

### Escritorio 1280 (contenedor 1100)

Dos columnas: `grid-template-columns: 640px 1fr; gap: 40px`.

- **Izquierda:** foto de 640×360 + tres miniaturas de 120×90. Debajo, datos, atributos y descripción.
- **Derecha:** badge, precio, título, ubicación, quién publica y contacto, con `position: sticky; top: 24px`.

El contacto pegado a la derecha es la razón de las dos columnas: se puede leer la descripción entera sin perder de vista el botón.

---

## 4. Reglas de contenido

**R1 · El precio pesa más que el título.** Móvil 28px/700, título 17px/600. Escritorio 34px/700, título 19px/600. Tipografía monoespaciada con `font-variant-numeric: tabular-nums`.

**R2 · El publicador siempre visible**, distinguible **sin color**: dueño con relleno sólido, inmobiliaria con borde. Debe funcionar en escala de grises.

**R3 · El tipo de propiedad va con la ubicación**, no en la tira de cifras: "Apartamento · Chacao · Distrito Capital". Es una categoría, no un número.

**R4 · Las cuatro celdas de datos se dibujan siempre.** Habitaciones, baños, m², puestos. Un cero se muestra como "0"; no se oculta la celda.

**R5 · Solo se lista lo declarado.** Se muestran los atributos que la propiedad tiene. **Nunca se afirma una ausencia.** Que el dueño no marcara "amoblado" no significa que no lo esté, significa que no lo declaró. Debajo de la lista, una línea aclara qué quedó fuera: "Solo se lista lo declarado. No amoblado."

**R6 · La descripción exige 120 caracteres mínimo**, validado al publicar.

**R7 · Texto alternativo compuesto al renderizar.** No hay columna en la base, y es decisión. Formato: **posición primero**, después título y zona.
`Foto 2 de 6 — Apartamento 2 habitaciones, Chacao`
Quien usa lector de pantalla necesita saber dónde está antes que qué mira.

---

## 5. Galería

### Presupuesto

| | Móvil | Escritorio |
|---|---|---|
| Foto principal | ancho completo × 180 | 640 × 360 |
| Secundarias | tira, 6 máximo | 3 miniaturas de 120×90 |
| Con la página | primera foto, ~40 KB | primera foto, ~62 KB |
| Al deslizar | 5 más, ~240 KB | resto al abrir el visor |
| Techo de la ficha | 500 KB | 500 KB |

Es scroll nativo con `scroll-snap`: **funciona sin JavaScript**.

### Visor

**Cada foto tiene su propia URL.** Anterior y siguiente son enlaces reales, no estado en cliente.

Consecuencias que justifican la decisión:
- funciona con JavaScript apagado;
- se comparte una foto concreta por WhatsApp;
- el botón de volver retrocede una foto, no sale del aviso;
- Google indexa cada foto.

Con JavaScript se agregan encima: deslizar con el dedo y precargar la siguiente.

| | Móvil | Escritorio |
|---|---|---|
| Presentación | pantalla completa | modal sobre el aviso |
| Navegación | zonas de toque de 88 px + flechas | flechas de 52 px al costado, fuera de la foto |
| Posición | puntos | tira de miniaturas de 84×56 |
| Cerrar | × arriba a la derecha | × arriba a la derecha, Escape |
| Teclado | — | ← → cambian de foto, Esc cierra |

**El precio queda visible en el visor.** Se sigue decidiendo mientras se miran las fotos.

**Fondo `#131517`**, gris muy oscuro y neutro. No es el azul de la paleta: cualquier tinte le cambia la temperatura a la foto.

---

## 6. Bloque de contacto — tres estados

Es lo único de la ficha que cambia según quién mira. **El número siempre se ve que existe**; lo que cambia es si está completo.

### Sin cuenta
- `+58 4•• ••• ••••` en 14px/600
- "Mostramos el WhatsApp a usuarios registrados. Pedimos la cuenta para frenar avisos falsos: es gratis y es un toque."
- Botón de acción: "Ver el WhatsApp"

### Con cuenta
- `+58 412 555 0134` en 17px/700 monoespaciado
- "verificado por WhatsApp el 19 ago"
- Botón de acción: "Escribir por WhatsApp" → `wa.me` con mensaje redactado
- Botón neutro: "Copiar el número"

### Aviso vencido
- Sin contacto, en ningún estado de sesión
- Recuadro punteado: "Venció el 12 de septiembre y el dueño no lo renovó. No mostramos el contacto de avisos vencidos."
- Salida: "Ver avisos activos en Chacao"

### Advertencia de negociación

Acompaña al contacto, **no va al pie**:

> Rentas no participa en la negociación. Visitá la propiedad y verificá quién es el dueño antes de entregar dinero.

---

## 7. Colores

Paleta Menta. Estas son las variables, tal como están en los archivos de diseño.

```css
--surface:  #FFFFFF;   /* fondo de la ficha */
--bg:       #F0F5F9;   /* bloques agrupados: contacto, quién publica */
--line:     #e1e4e6;   /* separadores y bordes suaves */
--rule:     #788189;   /* bordes de control y punteados */
--ink:      #1E2022;   /* texto principal, badge de dueño */
--soft:     #52616B;   /* texto secundario, metadatos */
--accent:   #272343;   /* botones de acción, iconos de atributos */
--acc-ink:  #FFFFFF;   /* texto sobre acento */
--tint:     #E3F6F5;   /* fondo de iconos y avatar */
--r:        12px;      /* radio de contenedores */
--rs:       999px;     /* radio de pastillas y badges */
```

**Visor, colores propios:**

```css
fondo:        #131517;              /* neutro, no la paleta */
texto:        #F2F3F3;
secundario:   rgba(242,243,243,.62);  /* AA sobre #131517 */
bordes:       rgba(242,243,243,.24);
```

### Tipografía

```css
--sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--mono: ui-monospace, SFMono-Regular, Menlo, monospace;
```

`--mono` para precio, cifras, metadatos y rótulos en mayúsculas. Sin webfonts.

### Jerarquía de botones

| Nivel | Estilo | Dónde |
|---|---|---|
| Acción | relleno `--accent`, texto `--acc-ink` | Ver el WhatsApp · Escribir por WhatsApp |
| Selección | fondo `--tint`, borde y texto `--accent` | iconos de atributos |
| Neutro | borde `--rule`, sin relleno | Copiar el número · Reportar |

**Ningún texto se atenúa con `opacity`.** Se usa `--soft`, que pasa AA.

---

## 8. Medidas

| Pieza | Móvil | Escritorio |
|---|---|---|
| Contenedor | 360, márgenes 16 | 1100 centrado, fijo |
| Foto principal | ancho completo × 180 | 640 × 360 |
| Miniatura | tira de 6 | 120 × 90 |
| Miniatura del visor | — | 84 × 56 |
| Precio | 28px / 700 | 34px / 700 |
| Título | 17px / 600 | 19px / 600 |
| Descripción | 15px / 1.6 | 15px / 1.6 |
| Botón de acción | 46px de alto | 46px de alto |
| Área táctil mínima | 44px | 40px |
| Columna de contacto | ancho completo | 328px, pegada |

El contenedor de 1100 **no se estira** en 1440, 1920 ni 4K: crece el aire lateral. Ver sección 7bis del documento general.

---

## 9. Campos que faltan en la base

| Campo | Estado | Consecuencia |
|---|---|---|
| Tipo de propiedad | **no existe** | La ficha no puede decir si es apartamento, casa, quinta, anexo o habitación. Lista cerrada de 5 valores. Debería ser también filtro, o queda huérfano |
| Planta eléctrica | **no existe** | |
| Agua regular | **no existe** | Sin estos cinco booleanos la sección "La propiedad tiene" desaparece, |
| Amoblado | **no existe** | y con ella lo que distingue una propiedad de otra en este mercado |
| Vigilancia 24 h | **no existe** | |
| Línea blanca | **no existe** | |
| Puesto de estacionamiento | existe | |

---

## 10. Criterios de aceptación

1. La ficha se renderiza en servidor y es indexable, salvo el teléfono.
1b. La URL sigue `/alquiler/<ciudad>/<zona>/<slug>-<id>`, y un slug viejo redirige 301 en vez de dar 404.
2. El precio se lee antes que el título, en orden y en peso.
3. Dueño e inmobiliaria se distinguen en escala de grises.
4. Las cuatro celdas de datos se dibujan siempre, incluso en cero.
5. La ficha nunca afirma que una propiedad **no** tiene un atributo.
6. Cada foto del visor tiene su propia URL y se puede compartir.
7. El botón de volver, dentro del visor, retrocede una foto y no sale del aviso.
8. El visor funciona con JavaScript apagado.
9. En escritorio, ← → cambian de foto y Escape cierra.
10. El texto alternativo empieza por la posición de la foto.
11. La ficha completa pesa menos de 500 KB con las 6 fotos.
12. Con la página solo se carga la primera foto.
13. Después de entrar, el usuario vuelve a esta misma ficha con el número visible.
14. Un aviso vencido no muestra contacto en ningún estado de sesión, y ofrece salida.
15. Todo texto pasa AA y ninguno usa `opacity` para atenuarse.
16. En móvil todo control táctil mide 44 px o más.
