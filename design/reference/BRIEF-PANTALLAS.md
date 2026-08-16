# Especificación de pantallas — Rentas

**Continúa el brief anterior.** Ese documento define el producto, las restricciones y las referencias. Este define **exactamente qué construir**: cada elemento, en qué orden, con qué medida y con qué texto.

Lo único que queda a tu criterio es la **estética**: paleta, personalidad tipográfica, forma de los componentes, tono. La estructura, las medidas, el contenido y la jerarquía están fijados acá y no se cambian.

**Entregá HTML abrible en el navegador.** Un archivo por pantalla o uno solo con todas, como prefieras, pero que se pueda abrir y medir.

---

## 1 · Sistema base

### Puntos de quiebre

| Nombre | Ancho | Contenedor máximo |
|---|---|---|
| Móvil | 360px | 100%, con 16px de margen lateral |
| Tablet | 768px | 100%, con 24px de margen lateral |
| Escritorio | 1280px | 1100px centrado |

Diseñá y entregá **móvil 360** y **escritorio 1280**. Tablet se resuelve solo si el diseño es fluido.

### Escala tipográfica

Seis tamaños, ninguno más. Stack del sistema.

| Uso | Tamaño | Peso | Interlineado |
|---|---|---|---|
| Etiqueta / metadato | 12px | 600 | 1.4 |
| Título de aviso en fila | 13px | 400 | 1.35 |
| Cuerpo | 15px | 400 | 1.55 |
| Precio en fila | 17px | 800 | 1.2 |
| Encabezado de pantalla | 20px | 700 | 1.25 |
| Precio en ficha | 28px | 800 | 1.1 |

Las etiquetas de una sola palabra en mayúsculas llevan `letter-spacing` de 0.06em. Los precios y cualquier columna de cifras llevan `font-variant-numeric: tabular-nums`.

### Escala de espaciado

Solo estos valores: **4 · 8 · 12 · 16 · 24 · 32 · 48**. Nada intermedio.

### Medidas fijas

| Elemento | Móvil | Escritorio |
|---|---|---|
| Miniatura de fila | 96 × 72 px (4:3) | 120 × 90 px |
| Alto de fila de resultado | ~92 px | ~108 px |
| Objetivo táctil mínimo | 44 px | 36 px |
| Ancho de columna de formulario | 100% | 600 px centrado |
| Ancho de barra lateral de filtros | — | 240 px |
| Foto principal de ficha | 100% × 180 px | 640 px de ancho |

---

## 2 · Componentes

### Fila de resultado

El componente más importante del producto. Se repite en resultados, página de zona, mis publicaciones, vencido y borradores.

**Anatomía en móvil**, grilla de dos columnas, `gap` 12px, `padding` 12px 16px, borde inferior de 1px:

```
[miniatura 96×72]  PRECIO            ← 17px / peso 800
                   Título del aviso   ← 13px, máximo 2 líneas, corta con puntos suspensivos
                   Zona · N hab · N m² [BADGE]   ← 12px, color suave
```

**En escritorio** la miniatura pasa a 120×90 y la línea de metadatos puede sumar un dato más. **Sigue siendo una fila, no una tarjeta.** No se convierte en grilla a ningún ancho.

### Badge de publicador

Dos variantes que deben distinguirse **en escala de grises**:

- **Dueño** — relleno sólido, texto invertido
- **Inmobiliaria** — fondo transparente, borde de 1px, texto en color suave

11px, peso 700, mayúsculas, `letter-spacing` 0.06em, `padding` 2px 6px.

### Chip de estado

Para mis publicaciones. Cuatro variantes:

| Estado | Tratamiento |
|---|---|
| Activa | Neutro, borde suave |
| Vence pronto | Color de advertencia, con fondo tenue |
| Vencida | Neutro, texto en color suave |
| Oculta | Color de error, con fondo tenue |

**El color aparece solo en las dos que piden acción.** Activa y vencida son neutras.

### Botón

Tres variantes: **primario** (relleno), **secundario** (borde), **texto**. Alto mínimo 44px en móvil. Ancho completo dentro de formularios, ancho automático en filas.

### Campo de formulario

Etiqueta visible arriba, siempre. **Nunca un placeholder haciendo de etiqueta.** Debajo del campo, texto de ayuda de 12px cuando haga falta. En estado de error: borde de 2px en color de error y mensaje de 12px debajo.

---

## 3 · Biblioteca de contenido

Usá estos textos exactos. No inventes ni traduzcas.

### Avisos

| Precio | Título | Zona | Ciudad | Hab | m² | Publicador |
|---|---|---|---|---|---|---|
| $450 | Apartamento 2 habitaciones con puesto de estacionamiento | Chacao | Distrito Capital | 2 | 78 | Dueño |
| $320 | Apto amoblado cerca del metro, edificio con vigilancia | Los Palos Grandes | Distrito Capital | 1 | 55 | Inmobiliaria |
| $680 | Apartamento amplio en La Castellana, 3 habitaciones | La Castellana | Distrito Capital | 3 | 120 | Inmobiliaria |
| $275 | Estudio en Altamira, ideal para una persona | Altamira | Distrito Capital | 1 | 42 | Dueño |
| $540 | Apartamento en El Rosal con línea blanca incluida | El Rosal | Distrito Capital | 2 | 88 | Dueño |
| $890 | Penthouse con terraza y vista abierta en Chacao | Chacao | Distrito Capital | 3 | 165 | Inmobiliaria |
| $280 | Apartamento 2 habitaciones en Bella Vista | Bella Vista | Maracaibo | 2 | 70 | Dueño |
| $410 | Apartamento amplio en La Lago con estacionamiento | La Lago | Maracaibo | 3 | 95 | Inmobiliaria |

### Zonas

**Distrito Capital:** Chacao · Altamira · La Castellana · Los Palos Grandes · El Rosal · Las Mercedes
**Maracaibo:** Tierra Negra · Bella Vista · La Lago · Indio Mara

### Descripción larga, para la ficha

> Edificio con vigilancia 24 horas y planta eléctrica. Piso 6 con ascensor. Cocina con tope de granito. Agua regular. Se pide depósito de dos meses.

### Textos de interfaz

| Contexto | Texto exacto |
|---|---|
| Marca | rentas. |
| Acción principal en encabezado | Publicar |
| Conteo de resultados | 47 propiedades activas |
| Botón de filtros | Ver 12 propiedades |
| Aviso de contacto con llave | El contacto se muestra a usuarios registrados |
| Botón de contacto | Ver WhatsApp del dueño |
| Advertencia en contacto revelado | Rentas no participa en la negociación. Verificá la propiedad antes de entregar dinero. |
| Etiqueta de tipo de publicador | ¿Publicás como dueño o inmobiliaria? |
| Ayuda del tipo de publicador | Se muestra siempre en tu aviso. No se puede cambiar después. |
| Ayuda del precio | Solo el número. Todos los precios están en dólares. |
| Ayuda de fotos | Al menos una. Tienen que ser tuyas: rechazamos fotos ya publicadas por otra cuenta. |
| Ayuda de descripción | Mínimo 120 caracteres. Mientras más detalle, más contactos recibís. |
| Aviso de vencimiento al publicar | Tu aviso queda activo 30 días. Te avisamos antes de que venza. |
| Encabezado de página de zona | Alquiler en Chacao |
| Bajada de página de zona | 12 propiedades activas en Chacao, Distrito Capital. Precios desde $275 hasta $890 mensuales. |
| Migas de pan | Inicio › Distrito Capital › Chacao |
| Invitación a colaborar | Rentas es gratis y sin comisión. Si te sirve, podés colaborar. |
| Aviso vencido | Esta publicación venció y ya no está disponible. |
| Encabezado de sugerencias | Estas sí están activas en Chacao |
| Sin resultados | No hay propiedades con esos filtros |
| Ayuda de sin resultados | En Tierra Negra hay 6 propiedades, desde $340. |
| Botón de sin resultados | Quitar el filtro de precio |

---

## 4 · Las seis pantallas

### Pantalla 1 · Resultados de búsqueda

Es la pantalla del producto. Define la densidad de todo lo demás.

**Móvil 360 — de arriba a abajo:**

1. Barra superior: marca a la izquierda, enlace "Publicar" a la derecha. Alto ~48px, borde inferior
2. Barra de filtros: cuatro chips en línea — `Distrito Capital` (activo), `Zona`, `Precio`, `Hab.`. Fondo apenas distinto, borde inferior
3. Conteo: `47 propiedades activas`, 12px, color suave
4. **Cinco filas de resultado**, avisos 1 al 5 de la tabla, en ese orden

**Requisito duro: las cinco filas tienen que entrar en 640px de alto de pantalla.** Si no entran, la fila es demasiado alta.

**Escritorio 1280:**

- Contenedor de 1100px centrado
- Barra superior a lo ancho, contenido alineado al contenedor
- **Dos columnas:** barra lateral de filtros de 240px a la izquierda (los cuatro filtros expandidos, no como chips), resultados a la derecha
- Los filtros quedan fijos al hacer scroll
- Las filas siguen siendo filas. Miniatura de 120×90. **No es una grilla**

---

### Pantalla 2 · Ficha del aviso

**Móvil 360:**

1. Barra superior: enlace `← Resultados` a la izquierda, badge del publicador a la derecha
2. Foto principal, ancho completo, 180px de alto
3. Precio `$450` a 28px, con ` / mes` a 13px en peso normal y color suave al lado
4. Título completo, sin cortar, 17px peso 600
5. Línea de ubicación: `Chacao · Distrito Capital`, 12px suave
6. **Fila de datos**, cuatro celdas divididas por bordes verticales: `2 Hab` · `2 Baños` · `78 m²` · `1 Puesto`. Número arriba en 15px, etiqueta abajo en 11px mayúsculas
7. Párrafo de descripción, texto de la biblioteca
8. **Bloque de contacto con llave:** recuadro con borde punteado, texto `El contacto se muestra a usuarios registrados`, y botón primario de ancho completo `Ver WhatsApp del dueño`
9. Enlace discreto al pie: `Reportar esta publicación`, 11px, color suave

**Escritorio 1280:**

- **Dos columnas.** Izquierda 640px: foto principal más una tira de tres miniaturas debajo. Derecha 420px: precio, título, ubicación, fila de datos, bloque de contacto — **fija al hacer scroll**
- La descripción va debajo de la foto, en la columna izquierda, a ancho de lectura

---

### Pantalla 3 · Formulario de publicación

**Móvil 360 — un campo debajo del otro, 16px entre campos:**

1. Barra superior: marca, y `Paso 1 de 2` a la derecha en 12px suave
2. Campo **tipo de publicador**: etiqueta `¿Publicás como dueño o inmobiliaria? *`, dos opciones seleccionables lado a lado (`Dueño` activo, `Inmobiliaria`), texto de ayuda debajo
3. Campo **título**: etiqueta `Título *`, valor `Apartamento 2 habitaciones en Chacao`
4. Campo **precio**: etiqueta `Precio mensual en dólares *`, valor `450`, ayuda debajo
5. **Ciudad y zona en la misma línea**, mitad y mitad: `Distrito Capital` y `Chacao`
6. Botón primario de ancho completo: `Continuar a las fotos`

**El asterisco de obligatorio no se distingue solo por color.**

**Escritorio 1280:** una sola columna de **600px centrada**. Ciudad y zona siguen lado a lado. Todo lo demás igual. **No se ensancha ni se pasa a dos columnas.**

---

### Pantalla 4 · Página de zona

Es el aterrizaje de Google. La diferencia con resultados es el encabezado con contenido único.

**Móvil 360:**

1. Barra superior igual que resultados
2. **Bloque de encabezado:** migas de pan en 11px suave, título `Alquiler en Chacao` en 20px peso 700, bajada con conteo y rango de precios en 12px
3. Dos filas de resultado: avisos 1 y 6 de la tabla, ambos de Chacao
4. **Invitación a colaborar** al final: recuadro tenue, texto de la biblioteca, botón de cerrar con `×`

**Escritorio 1280:** mismo esqueleto que resultados con barra lateral, y el bloque de encabezado arriba a **ancho de lectura, no a 1100px**. Un párrafo de 1100px de ancho no se lee.

---

### Pantalla 5 · Mis publicaciones

Cuatro filas, cada una en un estado distinto. Es la pantalla que demuestra el sistema de estados.

**Móvil 360:**

1. Barra superior
2. Encabezado `Mis publicaciones`, 20px
3. Cuatro filas:

| Aviso | Chip | Texto | Acción en la fila |
|---|---|---|---|
| $450 Chacao | `Activa` | vence en 22 días | ninguna |
| $320 metro | `Vence pronto` | en 3 días | botón `Renovar 30 días` |
| $680 La Castellana | `Vencida` | hace 6 días | botón secundario `Volver a publicar` |
| $275 Altamira | `Oculta` | por reportes | ninguna |

**La acción vive dentro de la fila que la necesita.** Sin menús de tres puntos, sin acciones escondidas.

**Escritorio 1280:** misma lista dentro del contenedor. Los botones se alinean a la derecha de la fila, en su propia columna, en vez de ir debajo del texto.

---

### Pantalla 6 · Importar cartera · vista previa

**La pantalla más compleja del producto, y donde el escritorio se gana el sueldo.**

**Escritorio 1280 — diseñá esta primero:**

1. Barra superior: enlace `← Cancelar`, nombre del archivo `cartera-agosto.csv` en el centro
2. **Resumen en dos celdas:** `38 Listas` y `2 Con error`. El número en grande, la etiqueta debajo. El `2` en color de error
3. Texto: `Revisá los errores. Si confirmás, se crean las 38 correctas.`
4. **Tabla completa, todas las columnas visibles, sin scroll horizontal.** Columnas: `Fila`, `Referencia`, `Precio`, `Zona`, `Habitaciones`, `Título`, `Problema`
5. **Las dos filas con error van primero**, marcadas con una barra vertical en color de error al costado y un fondo tenue:

| Fila | Referencia | Precio | Zona | Problema |
|---|---|---|---|---|
| 7 | AP-114 | 420 | El Rosal | «El Rosal» no existe en Maracaibo |
| 23 | AP-140 | — | Bella Vista | Falta el precio |

6. Debajo, cinco filas correctas: `AP-101` a `AP-105`, sin nada en la columna de problema
7. **Botón primario: `Crear las 38 propiedades`** — el botón dice el número, nunca «Confirmar»
8. Botón secundario: `Corregir el archivo y volver a subir`

**Móvil 360:** el resumen y los botones se mantienen. La tabla se convierte en **tarjetas apiladas**, una por fila con error, con el número de fila y el motivo bien visibles. Las filas correctas se colapsan en una sola línea: `38 filas listas para crear`. **No metas una tabla de siete columnas en 360px.**

---

## 5 · Checklist de entrega

Antes de dar por terminado, verificá:

- [ ] Las seis pantallas, cada una en 360px y en 1280px
- [ ] Cinco filas de resultado entran en los primeros 640px de alto en móvil
- [ ] El badge de dueño e inmobiliaria se distingue en escala de grises
- [ ] El precio se lee antes que el título en cada fila
- [ ] Ningún texto de párrafo supera los 70 caracteres de ancho en escritorio
- [ ] El formulario de publicación es una columna de 600px en escritorio, no dos
- [ ] La tabla de importación se ve completa en escritorio, sin scroll horizontal
- [ ] Ninguna pantalla scrollea de costado en móvil
- [ ] Todos los objetivos táctiles llegan a 44px en móvil
- [ ] Solo se usaron los seis tamaños de tipografía y los siete valores de espaciado
- [ ] Cero fuentes web, cero imágenes decorativas, cero animaciones
- [ ] Todos los textos salen de la biblioteca de contenido, sin inventar ni traducir
