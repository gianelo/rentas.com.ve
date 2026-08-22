# Rentas — Flujos y funcionalidades

Qué hace el sistema y en qué orden. Sustituye a `Rentas - UX movil.md`, que solo cubría la búsqueda.

Archivos de referencia visual:
- `Rentas - Lista y Filtros - Mobile.dc.html` · `Rentas - Lista y Filtros - Desktop.dc.html`
- `Rentas - Entrar - Mobile.dc.html` · `Rentas - Entrar - Desktop.dc.html`
- `Rentas - Ficha - Mobile.dc.html` · `Rentas - Ficha - Desktop.dc.html`

---

## 1. El producto en una línea

Clasificados de alquiler residencial de larga estadía para Distrito Capital y Maracaibo. Publicar y buscar son gratis. La plataforma no participa en el trato: no retiene pagos, no redacta contratos, no cobra comisión. Cuando un inquilino encuentra algo, entra con su cuenta y recibe el WhatsApp de quien publicó.

## 2. Mapa de pantallas

```
                        ┌─────────────┐
                        │   INICIO    │  tiras por ciudad, precio y recientes
                        └──┬───────┬──┘
              tocar barra  │       │  tocar aviso / "Ver los N"
                        ┌──▼──┐    │
                        │BUSCAR│───┘
                        └──┬──┘  4 pasos, conteo en vivo
                           │ "Ver 9 avisos"
                     ┌─────▼──────┐
                     │ RESULTADOS │  cuadrícula 2 col · barra resumen
                     └─────┬──────┘
                           │ tocar aviso
                     ┌─────▼──────┐
                     │   FICHA    │  tira de 6 fotos · datos · contacto
                     └──┬──────┬──┘
                        │      │ tocar una foto
                        │   ┌──▼──────┐
                        │   │  VISOR  │  1 foto = 1 URL · ‹ ›
                        │   └─────────┘
                           │ "Ver WhatsApp"
                     ┌─────▼──────┐
                     │   ENTRAR   │  Google · o enlace por correo
                     └─────┬──────┘
                           │
                    ┌──────▼───────┐
                    │ VUELVE A LA  │  con el número visible
                    │    FICHA     │
                    └──────────────┘

INICIO ──"Publicar"──► ENTRAR ──► PUBLICAR 1 datos ──► 2 fotos ──► verificar teléfono ──► MIS PUBLICACIONES
```

---

## 3. Flujo A · El inquilino busca y contacta

| # | Acción del usuario | Qué hace el sistema |
|---|---|---|
| 1 | Entra al sitio | Muestra cuatro tiras: recientes (70), Maracaibo (23), Distrito Capital (47), hasta $400 (18). Cada una con su total real |
| 2 | Toca la barra de búsqueda | Abre el acordeón en el paso 1, ciudad |
| 3 | Elige ciudad | Filtra zonas a esa ciudad. Si cambió de ciudad, **descarta las zonas ya elegidas** y avisa |
| 4 | Elige zonas | Combina con OR. El conteo del botón baja: 47 → 21 |
| 5 | Fija precio | Muestra el histograma de la oferta en esas zonas antes de que elija. Conteo: 21 → 16 |
| 6 | Elige habitaciones y atributos | Cada opción muestra cuántos resultados la cumplen. Conteo: 16 → 9 |
| 7 | Confirma "Ver 9 avisos" | Navega a resultados. Todo el estado queda en la URL |
| 8 | Recorre la cuadrícula | 4 avisos completos sobre el pliegue en móvil, 6 en escritorio |
| 9 | Llega al final | Si están todos: "Son los 9 avisos que coinciden" + propuesta de ampliar. Si hay más: "Ver 20 más" |
| 10 | Toca un aviso | Abre la ficha. El teléfono aparece parcialmente oculto, con el motivo explicado |
| 10b | Desliza las fotos | Tira horizontal de hasta 6, con ajuste al centro y puntos de posición. Solo la primera se carga con la página |
| 10c | Toca una foto | Abre el visor a pantalla completa en esa foto, con su propia URL |
| 11 | Toca "Ver el WhatsApp" | Abre entrar. En móvil como hoja sobre el aviso; en escritorio como diálogo |
| 12 | Entra con Google | Vuelve **a la misma ficha**, con el número completo |
| 12b | O pide enlace por correo | Muestra "Revisá tu correo". Al abrir el enlace, vuelve a la misma ficha |
| 13 | Escribe por WhatsApp | Fuera del sistema. Rentas no participa |

**Punto de fuga principal:** el paso 11. Es el único momento en que se le pide algo al inquilino. Por eso la hoja no tapa el aviso y siempre ofrece "Seguir mirando sin entrar".

## 4. Flujo B · El dueño publica

| # | Acción del usuario | Qué hace el sistema |
|---|---|---|
| 1 | Toca "Publicar gratis" | Si no tiene sesión, abre entrar como **página propia** (no hoja: hace falta una URL de vuelta) |
| 2 | Entra con Google o correo | Crea la cuenta y sigue al formulario |
| 3 | Llena datos | Zona, precio en dólares, habitaciones, baños, atributos, descripción de 120 caracteres mínimo. Declara si es dueño o inmobiliaria |
| 4 | Sube fotos | Las comprime **en el dispositivo** antes de subirlas. Muestra el tamaño antes y después |
| 5 | Verifica el teléfono | Envía un código por WhatsApp al número del aviso. **Es un paso distinto de entrar** |
| 6 | Publica | El aviso queda activo 30 días |
| 7 | Recibe aviso de vencimiento | Correo antes de que venza, con un enlace para renovar |

**Regla:** dueño o inmobiliaria se declara una vez y **no se puede cambiar después**. Declararlo mal es motivo de baja.

## 5. Flujo C · Entrar

Dos puertas, mismo mecanismo, distinta presentación.

| Entrada | Presentación móvil | Presentación escritorio | Por qué |
|---|---|---|---|
| Publicar | Página propia con URL | Página propia, columna de 420 px | Necesita ser destino de vuelta desde Google y desde un correo |
| Ver WhatsApp | Hoja que sube desde abajo | Diálogo de 460 px sobre el aviso | No se puede sacar al inquilino del aviso que está mirando |

### Funcionalidades de entrar

**F16 · Entrar con Google.** Un solo toque. Va primero y arriba, porque un toque siempre gana a escribir una dirección en un teclado de teléfono.

**F17 · Entrar con enlace por correo.** El usuario escribe su correo y recibe un enlace que lo deja entrar. Sin contraseña.
- El enlace sirve **una sola vez**.
- Vence en **15 minutos**.
- Debe abrirse en el mismo dispositivo. Si se abre en otro, se pide el correo de nuevo.

**F18 · Pantalla de espera.** El enlace por correo obliga a una pantalla intermedia: el usuario sale del sitio y vuelve, y sin explicación parece que se rompió. Muestra:
- el correo escrito en pantalla, para detectar un error de tipeo sin volver atrás;
- por qué puede no llegar (demora, correo no deseado, vencimiento);
- reenviar **con cuenta regresiva**, no un botón muerto;
- salida a Google, para que nadie quede atrapado esperando.

**F19 · Volver donde estaba.** Después de entrar, el usuario vuelve exactamente a la pantalla y al aviso desde donde salió. Nunca al inicio.

**F20 · Salir sin entrar.** Todas las puertas tienen salida visible. Entrar no es un muro: el contenido del aviso es público y solo el teléfono está detrás de la cuenta.

**F21 · Verificar el teléfono ≠ entrar.** Google o el correo confirman **quién sos**. El código por WhatsApp confirma que **el número del aviso funciona**. Son dos pasos, en dos momentos, y no se mezclan en la misma pantalla.

**Decisión pendiente:** en escritorio el correo se lee habitualmente en el teléfono, así que el enlace se abrirá en otro dispositivo. La pantalla dice hoy que la pestaña de la computadora "avisa cuando pase", lo que implica que escuche el cambio de sesión. Si no se va a implementar, hay que cambiar esa frase.

---

## 6. Funcionalidades de búsqueda

**F1 · Ver la oferta sin buscar.** Cuatro colecciones de 5 avisos con su total real: recientes, cada ciudad, y hasta $400. Una colección vacía no se renderiza; una con menos de 5 muestra los que haya sin la placa "Ver todos". Nunca entran avisos vencidos, ocultos o pendientes de moderación.

**F2 · Aislamiento de ciudad.** Con una ciudad seleccionada, **ninguna** superficie —listas, tiras, sugerencias, autocompletado, "ampliar búsqueda"— devuelve un aviso de otra ciudad.

**F3 · Filtrar por ciudad.** Selección única, con conteo por ciudad. Cambiarla borra las zonas elegidas.

**F4 · Filtrar por zona.** Selección múltiple con OR, solo zonas de la ciudad activa, cada una con su conteo. El buscador **solo autocompleta zonas conocidas**: no acepta texto libre ni busca en títulos.

**F5 · Filtrar por precio.** Mínimo y máximo opcionales, en dólares. Histograma de la oferta antes de elegir. Si el mínimo supera al máximo, se intercambian en vez de dar error.

**F6 · Habitaciones y atributos.** Habitaciones con selección única (4+ es "al menos 4"). Atributos con AND. Cada atributo muestra cuántos resultados lo cumplen; con cero queda deshabilitado.

**F7 · Conteo en vivo.** El botón dice cuántos resultados va a devolver, nunca "Aplicar". Con 0 resultados ofrece soltar el filtro más restrictivo. Con 1 resultado va directo a la ficha.

**F8 · Limpiar filtros.** Vuelve todo al valor por defecto **excepto la ciudad**, que es el contexto de la búsqueda, no un filtro.

**F9 · Leer los resultados.** Cada tarjeta muestra foto de portada, **quién publica**, precio, título, zona, habitaciones y metros. El publicador se distingue **sin depender del color** (relleno vs borde), para que funcione en escala de grises. El precio pesa más que el título. Un aviso sin foto no se muestra.

**F10 · Recorrer y ampliar.** Enlace real "Ver 20 más" con barra de progreso; con JavaScript, el scroll lo dispara solo. Al final de la lista, el sistema evalúa qué filtro suelta más resultados y propone **un solo cambio** con su número.

**F11 · Cero resultados.** Explica qué filtro causa el vacío y ofrece hasta tres salidas con su conteo. Nunca muestra resultados de otra ciudad como consuelo.

**F12 · Compartir la búsqueda.** Todo el estado en la URL:
`/alquiler/distrito-capital?zona=chacao,altamira&min=250&max=700&hab=2&tipo=dueno&pag=1`
Se manda por WhatsApp y el otro ve lo mismo; el botón de volver deshace el último filtro; Google la indexa; recargar no pierde nada.

**F13 · Contacto con llave.** El bloque de contacto siempre se ve, con el número parcialmente oculto y el motivo explicado. Todo el aviso es público e indexable: **solo el teléfono** queda detrás de la cuenta.

**F14 · Funcionar sin JavaScript.** Buscar, filtrar, paginar y navegar funcionan con JavaScript apagado: los filtros son formularios `GET` y el acordeón usa `<details>` nativo. Único lugar donde es obligatorio: comprimir fotos al publicar e importar cartera.

**F15 · Presupuesto de peso.** Inicio ≈ 80 KB (20 fotos de 158×118). Resultados ≤ 150 KB con 20 avisos (hoy ≈ 128 KB). Ficha ≤ 500 KB. Miniatura ≤ 40 KB. LCP en 3G ≤ 2,5 s. Sin webfonts.

---

## 6bis. Funcionalidades de la ficha

**F22 · Ver el aviso completo.** Barra con "← Resultados" que vuelve **con los filtros intactos**, y el badge de publicador. Debajo: tira de fotos, precio, título, tipo y ubicación, tira de cuatro datos, atributos, descripción, bloque de contacto y reporte.

**F23 · Jerarquía de la ficha.** El precio pesa más que el título (regla transversal 2). El tipo de propiedad va junto a la ubicación —"Apartamento · Chacao · Distrito Capital"— y **no** dentro de la tira de cifras, porque es una categoría y no un número.

**F24 · Tira de datos.** Cuatro celdas con separadores: habitaciones, baños, m², puestos. **Las cuatro se dibujan siempre.** Un cero se muestra como "0", no se oculta la celda.

**F25 · Atributos declarados.** Se listan solo los que la propiedad tiene: planta eléctrica, agua regular, amoblado, vigilancia 24 h, línea blanca. **No se muestra la ausencia.** Que el dueño no haya marcado "amoblado" no significa que no lo esté, significa que no lo declaró; afirmarlo sería decir algo que el sistema no sabe. Debajo, una línea aclara qué quedó fuera: "Solo se lista lo declarado. No amoblado."

**F26 · Galería en la ficha.** Hasta 6 fotos en tira horizontal con `scroll-snap`, rótulo por foto y puntos de posición. Es scroll nativo: funciona sin JavaScript.
- La **primera foto** se carga con la página: ~40 KB.
- Las **otras cinco** se cargan al deslizar. Hasta ~240 KB si se recorren todas.
- La ficha entra en el presupuesto de 500 KB en cualquier caso.

**F27 · Visor de fotos.** Cada foto tiene su propia dirección: `/alquiler/distrito-capital/chacao/apartamento-2-habitaciones-con-puesto-84512/foto/2`.
- Anterior y siguiente son **enlaces reales**, no estado en cliente.
- Funciona con JavaScript apagado; con JavaScript se agregan el deslizar y el precargar la siguiente.
- Se puede compartir una foto concreta por WhatsApp.
- El botón de volver del navegador retrocede **una foto**, no sale del aviso.
- Google puede indexar cada foto.
- Fondo gris muy oscuro y neutro, sin tinte: cualquier color le cambia la temperatura a la foto.
- Zonas de toque de 88 px a cada lado, más la flecha visible.
- El precio queda a la vista: se sigue decidiendo mientras se mira.

**F28 · Texto alternativo.** Se compone al renderizar, no existe columna en la base. Orden: **posición primero**, luego título y zona — "Foto 2 de 6 — Apartamento 2 habitaciones, Chacao". Quien navega con lector de pantalla necesita saber dónde está antes que qué mira.

**F29 · Estados del bloque de contacto.** Es lo único de la ficha que cambia según quién mira. El número **siempre se ve que existe**; lo que cambia es si está completo.

| Estado | Qué muestra |
|---|---|
| Sin cuenta | `+58 4•• ••• ••••`, el motivo del registro, botón "Ver el WhatsApp" |
| Con cuenta | número completo, desde cuándo está verificado, "Escribir por WhatsApp" y "Copiar el número" |
| Aviso vencido | sin contacto, explicación de que venció y no se renovó, salida a los avisos activos de la zona |

**F30 · Advertencia de negociación.** Acompaña al contacto, no al pie: "Rentas no participa en la negociación. Visitá la propiedad y verificá quién es el dueño antes de entregar dinero."

**F31 · Reportar.** Enlace discreto al pie, junto al ID del aviso y su fecha de vencimiento. Un reporte aceptado pasa el aviso al estado **oculta**.

### Campos que la ficha necesita y todavía no existen

| Campo | Estado | Consecuencia si no se agrega |
|---|---|---|
| Tipo de propiedad | ◆ no existe | La ficha no puede decir si es apartamento, casa, quinta, anexo o habitación. Conviene lista cerrada de 5 valores, y que sea también filtro, o queda huérfano |
| Planta eléctrica | ◆ no existe | |
| Agua regular | ◆ no existe | Sin estos cinco booleanos, la sección "La propiedad tiene" desaparece |
| Amoblado | ◆ no existe | y la ficha pierde justamente lo que distingue una propiedad de otra en este mercado |
| Vigilancia 24 h | ◆ no existe | |
| Línea blanca | ◆ no existe | |
| Puesto de estacionamiento | ✓ existe | |

---

## 7. Qué cambia entre móvil y escritorio

| | Móvil 360 | Escritorio 1280 (contenedor 1100) |
|---|---|---|
| Tiras del inicio | scroll horizontal, 5 + placa "Ver todos" | filas fijas de 5, total y flecha en el encabezado |
| Filtros | acordeón de 4 pasos secuenciales | panel de 3 columnas, todo a la vez |
| Filtros en resultados | barra resumen (pastilla) + engranaje | barra lateral pegada de 240 px, siempre visible |
| Cuadrícula | 2 columnas de 158 px | 3 columnas de 254 px |
| Entrar / WhatsApp | hoja que sube desde abajo | diálogo centrado de 460 px |
| Ancho de formulario | todo el ancho menos márgenes | columna de 420 px |
| Galería de la ficha | tira horizontal de 6 con ajuste al centro | foto 640×360 + 3 miniaturas de 120×90 |
| Datos y contacto de la ficha | en flujo, uno debajo del otro | columna derecha pegada, siempre a la vista |
| Altura mínima de control | 44 px | 36–44 px |

El acordeón secuencial existe **porque en 360 px no cabe nada más**, no porque sea mejor. En escritorio desaparece.

---

## 7bis. Rejilla y puntos de quiebre

Vale para **todas** las pantallas del proyecto. Está repetido al pie de cada archivo de diseño para que nadie tenga que deducirlo.

### Anchos de referencia

| Tramo | Comportamiento |
|---|---|
| < 768 | Versión móvil, fluida con márgenes de 16 px. Dibujada a 360, que es el piso del mercado |
| 768 – 1099 | Contenedor fluido con márgenes de 24 px. **Sin diseñar todavía** |
| 1100 y más | Contenedor fijo en 1100 px, centrado. Dibujado a 1280 |
| 1440 · 1920 · 4K | Idéntico a 1280. Solo crece el aire lateral |

### La regla

**El contenedor de 1100 no se estira nunca.** En una pantalla de 1920 el contenido mide 1100 y queda centrado con 410 px de aire a cada lado. El aire sobrante es aire.

**Lo que escala con el ancho es el número de columnas, no el tamaño de las piezas.** La tarjeta de resultados mide 254 px en cualquier pantalla. Si algún día se decide aprovechar 1440, se hace pasando de 3 a 4 columnas, no ensanchando la tarjeta.

### Por qué

1. Una línea de texto de 1900 px es ilegible: el ojo pierde el renglón al volver.
2. Una cuadrícula estirada agranda las tarjetas y muestra **menos** avisos por pantalla, que es lo contrario de lo que busca el producto.
3. Un campo de correo de 1100 px no ayuda a nadie. Por eso los formularios viven en columnas de 420 y 520 px dentro del contenedor.

### Anchos fijos que no dependen del viewport

| Pieza | Ancho |
|---|---|
| Contenedor | 1100 |
| Tarjeta de resultados | 254 (escritorio) · 158 (móvil) |
| Columna de formulario | 420 |
| Columna de mensaje centrado | 520 |
| Diálogo modal | 460 |
| Barra lateral de filtros | 240 |
| Foto grande de la ficha | 640 × 360 |
| Miniatura de la ficha | 120 × 90 |

### 4K y pantallas de alta densidad

No se sirven fotos al doble de densidad. Una foto `@2x` cuadruplica los bytes y choca de frente con el presupuesto: la lista de resultados tiene 150 KB para 20 avisos. En una pantalla de alta densidad las fotos se ven algo más blandas, y es una decisión, no un olvido.

### Lo que falta

La franja de **768 a 1099** no está diseñada en ningún archivo. Es una tableta en vertical o una ventana de navegador angosta. Hoy un desarrollador tendría que decidirlo por su cuenta, y ahí es donde se rompe la cuadrícula.

---

## 7ter. URLs

Esquema único para todo el sitio. Vale para lo ya diseñado y para lo que falta.

| Pantalla | Ruta |
|---|---|
| Inicio | `/` |
| Ciudad | `/alquiler/<ciudad>` |
| Zona | `/alquiler/<ciudad>/<zona>` |
| Ficha | `/alquiler/<ciudad>/<zona>/<slug>-<id>` |
| Foto | `/alquiler/<ciudad>/<zona>/<slug>-<id>/foto/<n>` |
| Búsqueda filtrada | `/alquiler/<ciudad>?zona=…&min=…&max=…&hab=…&tipo=…&pag=…` |
| Entrar | `/entrar` |
| Publicar | `/publicar` |
| Mis publicaciones | `/mis-avisos` |

### Reglas

1. **El `<id>` es lo único canónico.** El slug es decorativo: si cambia el título, la URL vieja **redirige 301**.
2. **Ciudad y zona en minúsculas, sin tildes, con guiones**: `distrito-capital`, `los-palos-grandes`, `tierra-negra`.
3. **Si la ciudad o la zona de la URL no coinciden con las del aviso, se redirige 301** a la correcta. Nunca dos URLs vivas para el mismo aviso.
4. **La jerarquía es navegable por partes.** Recortar la URL de una ficha da la página de zona, y recortarla otra vez da la de ciudad. Las tres existen.
5. **Los filtros van como `GET` sobre la ruta de ciudad**, no como segmentos. La ciudad es contexto y vive en la ruta; el resto es filtro y vive en la query.
6. **La ciudad nunca desaparece de la ruta.** Es lo que garantiza el aislamiento entre Maracaibo y Distrito Capital.

Esto reemplaza los ejemplos anteriores del documento (`/buscar?ciudad=…` y `/aviso/84512`).

---

## 8. Reglas transversales

1. **El publicador siempre visible**, en toda superficie donde aparezca un aviso, distinguible en escala de grises.
2. **El precio antes del título**, en orden de lectura y en peso visual.
3. **Todo conteo es real.** Si una etiqueta dice 9, hay 9.
4. **Ninguna opción lleva a un vacío**: cada filtro muestra su conteo antes de elegirlo.
5. **Ninguna pantalla termina sin salida**: siempre hay una acción que propone algo.
6. **Contraste WCAG AA** en todo texto, sin usar `opacity` para atenuar.
7. **Áreas táctiles de 44 px** en móvil, incluidos los enlaces de volver.
8. **Sin webfonts, sin mapas, sin autocompletado de direcciones.**
9. **El contenedor de 1100 px no se estira** en ninguna pantalla, por grande que sea.
10. **Toda URL sigue `/alquiler/<ciudad>/<zona>/…`**, con la ciudad siempre presente en la ruta.

## 9. Fuera de alcance, y por qué

| Descartado | Motivo |
|---|---|
| Mapa de resultados | tiles y librería externa; con seis zonas conocidas la lista cumple la función |
| Autocompletado de direcciones | servicio externo con costo por consulta; se busca por zona, no por dirección |
| Búsqueda de texto libre | con 47 avisos devuelve vacío casi siempre y el sitio parece vacío. Se reabre con varios cientos |
| Contraseñas | nadie las recuerda, y un dueño publica una vez cada dos años |
| Foto grande de una por fila | 1 aviso por pantalla y ~25 KB por foto |
| Ordenar por relevancia | sin señal de comportamiento para calcularla; por fecha es honesto |

## 10. Falta diseñar

En orden de prioridad:

1. **Publicar paso 1** — datos de la propiedad, con validaciones.
2. **Publicar paso 2** — fotos, con compresión en el dispositivo.
3. **Verificar teléfono** — código por WhatsApp.
4. **Mis publicaciones** — activa, vence pronto, vencida, oculta; renovar.
5. **Cero resultados** — hoy solo existe el cierre de lista.
6. **Página de zona** — aterrizaje de Google, una por zona.
7. **Importar cartera** — habilitación por cuenta, errores fila por fila.
8. **Correo de vencimiento.**
9. **Moderación de reportes.**
10. **Visor de fotos en escritorio** — modal con teclado: flechas y Escape.

## 11. Criterios de aceptación

1. Se ven 4 avisos completos en la primera pantalla a 360 px, 6 a 1280.
2. Dueño e inmobiliaria se distinguen en escala de grises.
3. El precio se lee antes que el título.
4. La lista de resultados pesa menos de 150 KB con 20 avisos.
5. Buscar, filtrar y paginar funcionan con JavaScript apagado.
6. Toda opción de filtro muestra su conteo antes de elegirla.
7. La URL de una búsqueda filtrada se comparte y reproduce el mismo resultado.
8. Una búsqueda en Maracaibo nunca muestra ni sugiere algo de Distrito Capital.
9. Ninguna pantalla termina en un vacío sin salida.
10. El botón de confirmar filtros siempre dice cuántos resultados va a dar.
11. Después de entrar, el usuario vuelve a la pantalla exacta desde donde salió.
12. Entrar tiene siempre una salida visible sin entrar.
13. Ningún texto usa `opacity` para atenuarse, y todo pasa AA.
14. Todo control táctil en móvil mide 44 px o más.
15. Cada foto del visor tiene su propia URL y se puede compartir.
16. El botón de volver del navegador, dentro del visor, retrocede una foto.
17. La ficha nunca afirma que una propiedad **no** tiene un atributo: solo lista lo declarado.
18. Las cuatro celdas de la tira de datos se dibujan siempre, incluso en cero.
19. En 1440, 1920 y 4K el contenido mide 1100 px y queda centrado, sin estirarse.
20. Ninguna tarjeta, campo ni columna cambia de tamaño al crecer la ventana.
