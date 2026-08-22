# Rentas — Publicar

Especificación para implementar. Flujo, pantallas, UI, colores y reglas.

Archivos de diseño: `Rentas - Publicar - Mobile.dc.html` · `Rentas - Publicar - Desktop.dc.html`
Contexto general: `Rentas - Flujos y funcionalidades.md`

---

## 1. Decisión de estructura

El brief original decía *"es un formulario, no un embudo de cinco pasos"*. Se descartó a favor de **nueve pasos, una pregunta por pantalla**.

El motivo: son 14 campos obligatorios y uno de ellos exige 120 caracteres escritos con el pulgar. Quien llena esto es un dueño de pie, con una mano, en un teléfono barato, y publica una vez cada dos años. Un formulario largo lo pierde antes que nueve pantallas simples.

**El costo de la decisión son nueve momentos de abandono.** Tres cosas lo compensan, y ninguna es opcional:

1. **Progreso siempre visible** — barra en móvil, riel de nueve pasos en escritorio.
2. **Volver atrás sin perder nada** — ni lo anterior ni lo posterior.
3. **Una pantalla de revisión antes de publicar** — nadie recuerda qué escribió nueve pasos atrás.

---

## 2. Flujo completo

```
"Publicar gratis"
      │
      ▼
  ¿hay sesión?
      │ no ──► ENTRAR (página propia, con URL de vuelta)
      │ sí
      ▼
  1 Tipo ─► 2 Zona ─► 3 Precio ─► 4 Tamaño ─► 5 Qué tiene
      │
      └──► 6 Título ─► 7 Descripción ─► 8 Fotos ─► 9 Quién publica
                                                         │
                                                         ▼
                                                    REVISAR ◄──┐
                                                         │     │ "Cambiar"
                                                         │     │ vuelve al paso
                                                         └─────┘
                                                         │
                                                    "Publicar aviso"
                                                         │
                                                         ▼
                                            el aviso se GUARDA (pendiente)
                                                         │
                                                         ▼
                                              VERIFICAR TELÉFONO
                                                         │
                                                         ▼
                                                      LISTO
                                                  activo 30 días
                                                         │
                                                         ▼
                                              MIS PUBLICACIONES ◆
```

### El orden y su razón

**La propiedad primero (1 a 8), la persona al final (9).** Quien entra a publicar quiere hablar de su apartamento, no de sí mismo. Pedirle dueño/inmobiliaria y teléfono en el paso 1 se lee como un registro, y un registro al principio es una puerta que la mayoría no cruza.

**Verificar el teléfono va después de guardar el aviso, no antes.** Consecuencias:
- el que abandona en el código **no pierde nada**;
- el aviso queda en Mis publicaciones como *pendiente de verificar*;
- resuelve el caso borde de cerrar el navegador a mitad de camino.

Pedir un código antes de que el aviso exista es pedir esfuerzo sin nada a cambio.

---

## 3. Los nueve pasos

| # | Pregunta | Control | Regla |
|---|---|---|---|
| 1 | ¿Qué vas a alquilar? | 5 pastillas ◆ | Lista cerrada: apartamento · casa · quinta · anexo · habitación. Obligatorio, sin valor por defecto |
| 2 | ¿En qué zona queda? | buscador + lista | **La ciudad la determina la zona.** Sin elegir ciudad |
| 3 | ¿Cuánto pedís al mes? | número grande + histograma | Entero, solo dólares, sin centavos |
| 4 | ¿Cómo es de grande? | 3 steppers + 1 campo | Hab, baños, puestos, m². Puestos permite 0 |
| 5 | ¿Qué tiene? | 5 casillas ◆ | Todas opcionales. Salida explícita: "No tiene ninguna" |
| 6 | Ponele un título | campo + tarjeta en vivo | Máximo 90 caracteres |
| 7 | Contá lo que no se ve | área de texto + barra | Entre 120 y 1.200 caracteres |
| 8 | Subí las fotos | lista / cuadrícula | Entre 1 y 6. Compresión en el dispositivo |
| 9 | ¿Quién publica? | 2 opciones + contacto | Irreversible. Método + valor |

◆ = campo que no existe todavía en la base.

### Paso 2 · Zona, en detalle

Es el paso que más cambió respecto del planteo original, y conviene entender por qué.

**Se evaluó Google Places y se descartó.** Dos razones:

1. **Costo por consulta**, en un producto gratis y sin comisión.
2. **Aunque se usara, seguiría haciendo falta la lista cerrada de zonas.** Google devuelve una dirección formateada, no la taxonomía del producto. Y la zona es la unidad sobre la que se apoyan cuatro cosas ya construidas: el filtro de búsqueda, los conteos por zona, la URL `/alquiler/<ciudad>/<zona>/…` y las páginas de zona para SEO. Si la zona pasa a ser texto libre, el filtro se vuelve infinito, los conteos desaparecen y no hay página de zona que indexar.

**La solución son dos campos separados:**

| Campo | Naturaleza | Uso |
|---|---|---|
| **Zona** | lista cerrada, ~40 en Distrito Capital y ~12 en Maracaibo | filtrable, contable, indexable, va en la URL |
| **Referencia** | texto libre, opcional | solo se muestra en la ficha. No filtrable, no indexable |

**Autocompletado propio, sobre la lista cerrada.** Escribir "alta" filtra en el cliente: Altamira, Alta Florida, Altavista, Altos de Sucre. Son ~2 KB de datos, menos que una foto, cero costo por consulta, cero librería externa. **El mismo componente sirve en la búsqueda del inquilino.**

**Cada resultado muestra municipio y ciudad.** Es lo que desambigua: "Alta Florida" y "Altavista" se confunden hasta que se ve que una es Libertador y otra no.

**Salida obligatoria:** "¿No está la tuya? Avisanos". No es decorativa — con lista cerrada, una zona faltante deja al dueño trabado. Necesita alguien que responda, y de paso indica dónde hay demanda.

**Criterio para curar la lista:** zonas de mercado inmobiliario, no parroquias administrativas. Nadie busca "Parroquia El Recreo"; buscan "Sabana Grande".

### Paso 8 · Fotos, en detalle

- Entre **1 y 6**. Sin fotos no hay aviso.
- JPEG, PNG, WebP. Máximo 10 MB por archivo antes de comprimir.
- **Compresión en el dispositivo**: borde mayor a 1.600 px, calidad 0,82, salida WebP.
- Se muestra el tamaño antes y después: "3,8 MB → 168 KB".
- Pedir más de 6 **se rechaza con mensaje, nunca se recorta en silencio**.
- Huella perceptual de 64 bits contra duplicados, **con exención por publicador**: republicar tus propias fotos es legítimo.

**Este es el único lugar del producto donde JavaScript es obligatorio**, y es a favor del usuario: comprimir en el teléfono es la diferencia entre subir 30 MB y subir 1.

**Reordenar cambia según el dispositivo, y es deliberado:**

| | Móvil | Escritorio |
|---|---|---|
| Cambiar orden | menú `⋯` → Mover arriba / Mover abajo | arrastrar |
| Portada | menú `⋯` → Hacer portada | menú `⋯` |
| Quitar | menú `⋯` → Quitar del aviso | menú `⋯` |

Arrastrar con el pulgar en un teléfono lento no es confiable. Con mouse sí. Por eso en móvil son acciones nombradas y no un agarre.

**Dos textos que no son decorativos:**
- *"Quitar del aviso — no borra la foto de tu teléfono."* Sin eso, un dueño duda antes de tocar.
- *"Hacer portada — se ve en la lista y arriba del aviso."* La palabra portada no significa nada sola.

### Paso 9 · Quién publica, en detalle

**Dueño o inmobiliaria. Obligatorio, sin valor por defecto.** Un default convertiría "el que se olvidó" en "todos son dueños", y esa distinción es la garantía de confianza central del producto, no una preferencia de pantalla.

**No se puede cambiar después de publicar**, y el formulario lo advierte **antes**. Declararlo mal es motivo de baja.

**Contacto: método más valor.** Tres métodos: whatsapp · teléfono · email.
- Teléfono: 10 a 13 dígitos, ignorando espacios, paréntesis, signos y guiones.
- Correo: validación deliberadamente laxa. Toda expresión estricta termina rechazando la dirección real de alguien.
- **El botón de la ficha toma su texto del método.** Decir "Ver WhatsApp" sobre una dirección de correo es una promesa que el producto no cumple.
- **El contacto se copia al aviso al publicar, no se referencia.** Quien escribió a un número necesita que ese aviso siga diciendo ese número.

---

## 4. Volver atrás

Es la funcionalidad que sostiene toda la estructura, y la más fácil de implementar mal.

### Reglas

1. **Volver no borra lo que sigue.** Corregir el paso 4 desde revisar deja los pasos 5 a 9 intactos, con su ✓ y su valor.
2. **Hacia atrás sí, hacia adelante no.** Los pasos ya hechos son enlaces. Los que faltan, no: no se salta a algo sin contestar.
3. **El botón cambia de contexto.** Al volver desde revisar dice **"Guardar y volver a revisar"**, no "Seguir". Quien entró desde revisar quiere volver ahí.
4. **Se dice qué cambió**: "Cambiaste habitaciones de 2 a 3. El resto del aviso quedó como estaba." Sin eso nadie sabe si se guardó.
5. **Salida siempre visible.** En escritorio, "Volver a revisar" fijo al pie del riel. En móvil, el botón contextual.

### Cómo se vuelve, según dispositivo

| | Móvil | Escritorio |
|---|---|---|
| Un paso atrás | flecha ← de la barra | enlace "Atrás" |
| Salto a un paso hecho | desde revisar, "Cambiar" | clic en el riel |
| Volver a revisar | botón contextual | "Volver a revisar" al pie del riel |

---

## 5. Borrador y persistencia

**El borrador de cookie de 10 minutos del planteo original no alcanza para nueve pasos.**

Razones: elegir fotos de la galería en un teléfono lento se come varios minutos; y una cookie de ~4 KB no aguanta nueve pasos de datos más el estado de las fotos.

**Recomendación:** guardar del lado del servidor por paso, con la sesión como llave.
- El indicador "Guardado" en la barra superior lo comunica.
- Si no se hace del lado del servidor, el mínimo es **30 minutos** de vencimiento, y el tope de 1.200 caracteres en la descripción pasa a ser una restricción técnica que hay que respetar sí o sí.

**El borrador no lleva el id del publicador.** Ese sale de la sesión, y es lo que hace que la verificación de propiedad de las fotos signifique algo.

---

## 6. Validación

**La validación completa corre en el formulario y otra vez al publicar.** La repetición es deliberada: la importación de cartera en lote pasa por la misma función, y una regla implementada solo en un formulario es una regla que el importador no tiene.

| Campo | Regla | Mensaje |
|---|---|---|
| Descripción | 120 a 1.200 caracteres | "✱ Mínimo 120 caracteres. Vas 24." |
| Precio | entero positivo, solo dólares | "Solo el número, en dólares y sin centavos. Por ejemplo: 520." |
| Ciudad | donde el producto opera | "Por ahora publicamos en Distrito Capital y Maracaibo." |
| Zona | de la ciudad elegida | "Esa zona no pertenece a la ciudad elegida. Elegí una de la lista." |
| Habitaciones | entero positivo | "Un número entero de habitaciones. Un estudio cuenta como 1." |
| Metros² | entero positivo | "Los metros cuadrados, en números enteros. Por ejemplo: 78." |
| Contacto | según método | "Revisá el dato: un correo lleva @, y un teléfono solo números." |

**Baños es obligatorio y puestos permite cero.** No es una inconsistencia: una celda vacía al lado de tres números se lee como rota, y nadie debería tener que escribir un cero para publicar un anexo sin estacionamiento.

**Los errores de fotos no se muestran en pasos que no tienen fotos.** Un error que apunta a un campo que no existe en la pantalla es un callejón sin salida.

---

## 7. Móvil y escritorio

| | Móvil 360 | Escritorio 1280 (contenedor 1100) |
|---|---|---|
| Progreso | barra de 3 px arriba | riel de 9 pasos a la izquierda, 240 px, pegado |
| Pasos hechos | no se ven | muestran **su valor**: "Altamira", "$450 al mes" |
| Ancho del formulario | todo menos márgenes de 20 | columna de 520 px |
| Campo de precio | 72 px de alto, ancho completo | 68 px de alto, 280 px de ancho |
| Titular | 24 px / 700 | 28 px / 700 |
| Controles | 52 a 64 px | 46 a 52 px |
| Paso 6 | tarjeta debajo del campo | tercera columna de 260 px, pegada |
| Paso 8 | lista vertical | cuadrícula de 3 |
| Revisar | lista con "Cambiar" | dos columnas: datos + aviso terminado |
| Botón principal | pegado abajo, ancho completo | en flujo, ancho del contenido |

**El riel no es la barra de progreso agrandada.** En un teléfono no hay lugar y hay que confiar en un porcentaje; en 1280 se ve el mapa entero y se puede saltar. Es la diferencia entre saber cuánto falta y poder hacer algo al respecto.

---

## 8. Colores

Paleta Menta, idéntica al resto del producto.

```css
--surface:  #FFFFFF;   /* fondo */
--bg:       #F0F5F9;   /* bloques agrupados, histograma, avisos */
--line:     #e1e4e6;   /* separadores, botón inactivo */
--rule:     #788189;   /* borde de control */
--ink:      #1E2022;   /* texto principal */
--soft:     #52616B;   /* texto secundario */
--accent:   #272343;   /* acción, selección, progreso */
--acc-ink:  #FFFFFF;   /* texto sobre acento */
--tint:     #E3F6F5;   /* fondo de casilla marcada, paso hecho */
--warn:     #8a5a00;   /* obligatorio, contador en falta, campo ◆ */
--r:        12px;
--rs:       999px;
```

### Tipografía

```css
--sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--mono: ui-monospace, SFMono-Regular, Menlo, monospace;
```

`--mono` para precio, cifras, contadores, metadatos y rótulos en mayúsculas. Sin webfonts.

### Jerarquía de botones

| Nivel | Estilo | Dónde |
|---|---|---|
| Acción | relleno `--accent` | Seguir · Publicar aviso · Verificar |
| Selección | fondo `--tint`, borde y texto `--accent` | pastillas, casillas, método de contacto |
| Neutro | borde `--rule`, sin relleno | Atrás · Publicar otra · Descartar |
| Inactivo | fondo `--line`, texto `--soft` | Seguir con validación sin cumplir |

**Nunca `opacity` para atenuar.** Todo pasa AA.

---

## 9. Reglas transversales

1. **Obligatorio se marca con `✱` y la palabra "obligatorio"**, nunca solo con color.
2. **Campo en error:** borde de 2 px y mensaje propio debajo. El mensaje dice qué hacer, no qué pasó.
3. **Si el control ya lo dice, el texto sobra.** El campo dice "Buscá tu zona": no hace falta un subtítulo que repita "escribí las primeras letras".
4. **Un mínimo se muestra como progreso, no como castigo.** La descripción usa barra y "te faltan 14 caracteres".
5. **Áreas táctiles de 44 px en móvil**, 40 px en escritorio. Incluidas las flechas de volver.
6. **El paso 5 tiene salida explícita** ("No tiene ninguna"): sin ella, quien no marca nada duda si el botón funciona.

---

## 10. Campos que faltan en la base

| Campo | Consecuencia si no se agrega |
|---|---|
| Tipo de propiedad | El paso 1 no existe, y la ficha no puede decir qué es la propiedad. Lista cerrada de 5 valores. **Debería ser también filtro, o queda huérfano** |
| Planta eléctrica | |
| Agua regular | Sin estos cinco booleanos el paso 5 desaparece, |
| Amoblado | y con él lo que distingue una propiedad de otra en este mercado |
| Vigilancia 24 h | |
| Línea blanca | |
| Referencia (texto libre) | El paso 2 pierde el campo que reemplaza a Google Places |
| Puesto de estacionamiento | ya existe |

---

## 11. Casos borde

| Caso | Resolución |
|---|---|
| Sesión vencida entre pasos | El borrador sobrevive. Hay que volver a entrar sin perder lo escrito |
| Borrador vencido | Se avisa qué pasó y se ofrece empezar de nuevo, no un formulario vacío sin explicación |
| Ciudad cambiada después de la zona | No aplica: la ciudad se deriva de la zona |
| Una foto falla y las otras no | Se publica con las que subieron y se avisa cuál faltó |
| Navegador cerrado antes de verificar | **Resuelto:** el aviso ya está guardado como pendiente de verificar |
| Zona inexistente en la lista | "Avisanos" — requiere alguien que responda |
| Publicar sin sesión | La acción del servidor se corta antes de leer nada |

---

## 12. Falta diseñar

1. **Mis publicaciones** — activa · vence pronto · vencida · oculta, con renovar.
2. **Correo de vencimiento.**
3. **Estado de volver atrás en móvil** — el equivalente al riel de escritorio.
4. **Importar cartera** — habilitación por cuenta, errores fila por fila.
5. **Errores de validación dibujados** — hoy están especificados pero no diseñados.
6. **Editar un aviso publicado** — mismo formulario, sin el paso 9.

---

## 13. Criterios de aceptación

1. Un aviso no se publica sin tipo de propiedad.
2. Dueño o inmobiliaria no se puede cambiar después de publicar, y se advierte antes.
3. Un atributo sin marcar nunca se muestra como ausencia en ninguna pantalla.
4. La descripción exige 120 caracteres, con contador visible mientras se escribe.
5. Las fotos se comprimen en el dispositivo y se muestra el tamaño antes y después.
6. Pedir más de 6 fotos se rechaza con mensaje, nunca se recorta en silencio.
7. La ciudad nunca se pregunta: se deriva de la zona elegida.
8. El buscador de zona solo devuelve zonas de la lista cerrada, sin servicio externo.
9. Volver a un paso anterior no borra ningún paso posterior.
10. Los pasos por delante del actual no son navegables.
11. Al volver desde revisar, el botón dice "Guardar y volver a revisar".
12. El aviso se guarda **antes** de pedir el código de verificación.
13. Cerrar el navegador antes de verificar deja el aviso en Mis publicaciones como pendiente.
14. La misma validación corre en el formulario y al publicar.
15. Verificar el teléfono y entrar nunca ocurren en la misma pantalla.
16. Todo control táctil en móvil mide 44 px o más.
17. Ningún texto usa `opacity` para atenuarse y todo pasa AA.
18. El contenedor de 1100 px no se estira en 1440, 1920 ni 4K.
