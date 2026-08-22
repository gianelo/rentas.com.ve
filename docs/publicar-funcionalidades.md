# Rentas — Publicar

Funcionalidades del módulo de publicación. Qué hace el sistema, no cómo se ve.

Contexto: `Rentas - Flujos y funcionalidades.md` (flujo B) · `docs/resumen-tecnico.md`

**Cómo leer este documento.** Todo lo marcado ✓ está implementado y probado hoy: las reglas salen del código, no de una propuesta. Lo marcado ◆ no existe todavía. Se separan porque rediseñar algo construido cuesta distinto que construirlo.

---

## 1. Qué es este módulo

El lado de la oferta. Es la única pantalla compleja del producto, y quien la llena es un dueño de pie, con una mano, en un teléfono barato. Cada campo que se agrega se paga en avisos que nadie termina de publicar.

Publicar es gratis y no hay comisión. El aviso queda activo **30 días**.

---

## 2. Estado actual

| Pieza | Estado |
|---|---|
| Paso 1 — formulario de datos | ✓ construido |
| Paso 2 — fotos con compresión en el dispositivo | ✓ construido |
| Borrador entre pasos | ✓ construido |
| Validación completa, con textos en español | ✓ construido |
| Detección de fotos duplicadas | ✓ construido |
| Pantalla de listo | ✓ construido |
| Tipo de propiedad | ◆ falta |
| Los cinco atributos | ◆ falta |
| Verificación de teléfono | ◆ falta — hoy es un stub que lanza error |
| Mis publicaciones | ◆ falta |
| Correo de vencimiento | ◆ falta |

**Lo que estás diseñando es un rediseño con campos nuevos, no una pantalla desde cero.**

---

## 3. Flujo

```
"Publicar gratis"
      │
      ▼
  ¿hay sesión?
      │ no ──► ENTRAR (página propia, con URL de vuelta)
      │ sí
      ▼
  PASO 1 · datos ──────► borrador (10 min) ──────► PASO 2 · fotos
      ▲                                                  │
      └──── errores por campo ◄──────────────────────────┤
                                                         ▼
                                            VERIFICAR TELÉFONO ◆
                                                         │
                                                         ▼
                                                   PUBLICADO
                                                   activo 30 días
                                                         │
                                                         ▼
                                              MIS PUBLICACIONES ◆
```

**Por qué entrar es una página y no una hoja:** hace falta una URL de vuelta, porque el usuario sale hacia Google o hacia su correo y tiene que volver acá.

---

## 4. Funcionalidades

### P1 · Declarar quién publica ✓

Dueño o inmobiliaria. Selección única, **obligatoria, sin valor por defecto**.

- **No se puede cambiar después de publicar.** El texto de ayuda tiene que decirlo antes, no después.
- Declararlo mal es motivo de baja.
- Se muestra en toda superficie donde aparezca el aviso, distinguible en escala de grises: dueño con relleno, inmobiliaria con borde.

**Por qué no hay valor por defecto:** un default convertiría "el que se olvidó" en "todos son dueños", y esa distinción es una garantía de confianza, no una preferencia de pantalla.

### P2 · Describir la propiedad ✓

| Campo | Regla exacta | Mensaje de error implementado |
|---|---|---|
| Título | Obligatorio, no vacío | — |
| Descripción | Entre **120 y 1.200** caracteres, con contador en vivo | "✱ Mínimo 120 caracteres. Vas 24." |
| Precio | Entero positivo, **solo dólares**, sin centavos ni selector de moneda | "Solo el número, en dólares y sin centavos. Por ejemplo: 520." |
| Ciudad | Obligatoria, y sólo donde el producto opera | "Por ahora publicamos en Distrito Capital y Maracaibo." |
| Zona | Obligatoria, **de la ciudad elegida** | "Esa zona no pertenece a la ciudad elegida. Elegí una de la lista." |
| Habitaciones | Entero positivo. **Un estudio cuenta como 1** | "Un número entero de habitaciones. Un estudio cuenta como 1." |
| Metros² | Entero positivo | "Los metros cuadrados, en números enteros. Por ejemplo: 78." |
| Baños | Entero positivo, **obligatorio** | — |
| Puestos | Entero, **cero permitido**, por defecto 0 | — |

**Baños obligatorio y puestos con cero por defecto no es una inconsistencia, es una decisión:** una celda vacía al lado de tres números se lee como rota, y nadie debería tener que escribir un cero para publicar un anexo sin estacionamiento.

**El tope de 1.200 caracteres tiene una razón técnica:** el borrador viaja en una cookie de ~4 KB entre los dos pasos. Sin ese tope, un aviso largo falla en producción a un tamaño impredecible.

### P3 · Elegir el tipo de propiedad ◆

Lista cerrada de cinco: **apartamento · casa · quinta · anexo · habitación**.

- Selección única, obligatoria, sin valor por defecto.
- Una fila de pastillas: un toque, sin escribir.
- Se muestra en la ficha junto a la ubicación —"Apartamento · Chacao · Distrito Capital"— **nunca dentro de la tira de cifras**, porque es una categoría y no un número.

**Local comercial se evaluó y se descartó.** El producto es residencial: si entrara, habitaciones dejaría de tener sentido para ese tipo y la tira de cuatro celdas de la ficha se rompería.

### P4 · Declarar los atributos ◆

Cinco interruptores: **planta eléctrica · agua regular · amoblado · vigilancia 24 h · línea blanca**. Puesto de estacionamiento ya existe como número.

Todos opcionales.

**La regla que cambia cómo se diseñan:** no marcar algo significa **"no lo declaró"**, no "no lo tiene". La ficha lista sólo lo declarado y nunca afirma una ausencia. El formulario tiene que dejar eso claro, porque un interruptor apagado se lee como "no" y acá no lo es.

**Por qué importan:** en este mercado son lo que distingue una propiedad de otra. Sin ellos, dos apartamentos de $400 en la misma zona son indistinguibles.

### P5 · Elegir cómo lo contactan ✓

Método más valor. Tres métodos: **whatsapp · teléfono · email**.

- Teléfono: entre 10 y 13 dígitos, ignorando espacios, paréntesis, signos y guiones.
- Correo: validación deliberadamente laxa — toda expresión estricta termina rechazando la dirección real de alguien.
- Error: "Revisá el dato: un correo lleva @, y un teléfono solo números."

**Es método más valor y no un teléfono, porque el que publica decide qué mostrar.** Una columna llamada "whatsapp" habría obligado a mentir a todo el que prefiere correo. Y el botón de la ficha toma su texto del método: decir "Ver WhatsApp" sobre una dirección de correo es una promesa que el producto no cumple.

**El contacto se copia al aviso al publicar, no se referencia.** Editar el dato de la cuenta después no reescribe avisos que alguien ya vio: quien escribió a un número necesita que ese aviso siga diciendo ese número.

### P6 · Guardar el borrador entre pasos ✓

Los datos del paso 1 viajan al paso 2 y de vuelta, en una cookie que **vence a los 10 minutos**.

- `httpOnly` y `sameSite=lax`.
- No lleva el id del publicador: ese sale de la sesión, y es lo que hace que la verificación de propiedad de las fotos signifique algo.

**Diez minutos:** suficiente para elegir fotos de la galería en un mal día, poco para que un teléfono prestado le entregue al siguiente una publicación a medio escribir.

### P7 · Subir fotos ✓

Entre **1 y 6** fotos. Sin fotos no hay aviso.

- Formatos: JPEG, PNG, WebP. Máximo 10 MB por archivo antes de comprimir.
- **Se comprimen en el dispositivo antes de subir**: borde mayor a 1.600 px, calidad 0,82, salida WebP.
- Se muestra el tamaño antes y después.
- El orden lo elige quien publica y tiene que sobrevivir a una recarga: la primera es la portada.
- Si se piden más de 6, **se rechaza — nunca se recorta en silencio**. Subir las primeras seis de diez publicaría un aviso al que le faltan fotos que el dueño cree haber puesto.

**Este es el único lugar donde JavaScript es obligatorio en todo el producto**, y es a favor del usuario: comprimir en el teléfono es la diferencia entre subir 30 MB y subir 1.

### P8 · Rechazar fotos duplicadas ✓

Se calcula una huella perceptual de 64 bits por foto y se compara contra las existentes.

- **Con exención por publicador:** volver a publicar tus propias fotos es legítimo. Acusar de duplicado a alguien que republica lo suyo es la peor falla que tiene esta función.

### P9 · Verificar el teléfono ◆

Código por WhatsApp al número del aviso.

**Es un paso distinto de entrar, y no se mezclan en la misma pantalla.** Google o el correo confirman **quién sos**. El código confirma que **el número del aviso funciona**. Son dos preguntas distintas en dos momentos distintos.

La ficha muestra desde cuándo está verificado: "verificado por WhatsApp el 19 ago".

### P10 · Publicar ◆✓

El aviso queda **activo 30 días**. Copia de cierre: "Tu aviso queda activo 30 días. Te avisamos antes de que venza."

**La validación completa vuelve a correr al publicar**, no sólo en el formulario. Esa repetición es deliberada: la importación de cartera en lote pasa por la misma función, y una regla implementada en un formulario es una regla que el importador no tiene.

### P11 · Avisar antes del vencimiento ◆

Correo antes de que venza, con enlace para renovar.

### P12 · Mis publicaciones ◆

Cuatro estados: **activa · vence pronto · vencida · oculta**.

| Estado | Acción en la fila |
|---|---|
| Activa | ninguna, muestra "vence en 22 días" |
| Vence pronto | **Renovar 30 días** |
| Vencida | **Volver a publicar** |
| Oculta | por reporte aceptado |

---

## 5. Reglas transversales

1. **Obligatorio se marca con `✱` y la palabra "obligatorio"**, nunca sólo con color.
2. **Campo en error:** borde de 2 px, mensaje propio debajo, además del texto de ayuda neutro. El mensaje dice qué hacer, no qué pasó.
3. **Los errores de fotos no se muestran en el paso 1.** No hay control de fotos en esa pantalla y un error que apunta a un campo que no existe es un callejón sin salida.
4. **Ningún texto se atenúa con `opacity`.** Todo pasa AA.
5. **Áreas táctiles de 44 px** en móvil.
6. **Es un formulario, no un embudo de cinco pasos.**

---

## 6. Casos borde

- **Sesión vencida entre el paso 1 y el 2** — el borrador sigue en la cookie; hay que volver a entrar y no perder lo escrito.
- **El borrador vence a los 10 minutos** mientras se eligen fotos: qué se le dice a alguien que vuelve a un formulario vacío.
- **Ciudad cambiada después de elegir zona** — la zona se descarta, igual que en la búsqueda.
- **Una foto falla al subir** y las otras cinco no: se publica con cinco o se frena todo.
- **Se cierra el navegador después del paso 2 y antes de verificar el teléfono** — el aviso queda a medio publicar y hay que decidir su estado.
- **Se publica sin sesión** — la acción del servidor es un endpoint público como cualquier otro y se corta antes de leer nada.

---

## 7. Pantallas que hay que diseñar

En orden:

1. **Paso 1** — datos, con los campos nuevos: tipo de propiedad y los cinco atributos.
2. **Paso 2** — fotos, con tamaño antes y después, orden y portada.
3. **Verificar teléfono** — código por WhatsApp, reenvío con cuenta regresiva.
4. **Listo** — qué ve alguien que acaba de publicar.
5. **Mis publicaciones** — los cuatro estados y sus acciones.
6. **Correo de vencimiento.**

---

## 8. Criterios de aceptación

1. Un aviso no se publica sin tipo de propiedad.
2. Dueño o inmobiliaria no se puede cambiar después de publicar, y el formulario lo advierte antes.
3. Un atributo sin marcar nunca se muestra como ausencia en ninguna pantalla.
4. La descripción exige 120 caracteres y el contador es visible mientras se escribe.
5. Las fotos se comprimen en el dispositivo y se muestra el tamaño antes y después.
6. Pedir más de 6 fotos se rechaza con un mensaje, nunca se recorta en silencio.
7. Cada error apunta a su campo y dice qué hacer.
8. Obligatorio se distingue sin depender del color.
9. La misma validación corre en el formulario y al publicar.
10. Verificar el teléfono y entrar nunca ocurren en la misma pantalla.
11. Todo control táctil en móvil mide 44 px o más.
12. Ningún texto usa `opacity` para atenuarse y todo pasa AA.
