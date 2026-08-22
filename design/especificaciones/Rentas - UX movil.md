# Rentas — Funcionalidades del flujo de búsqueda (móvil)

Qué hace el sistema, no cómo se ve. Cada funcionalidad tiene disparador, comportamiento y casos borde.
Alcance: inicio, búsqueda y resultados. Referencia visual: `Rentas - Filtros.dc.html`.

---

## F1 · Ver la oferta sin buscar

**Disparador:** el usuario entra al sitio por primera vez, sin parámetros en la URL.

**Comportamiento**
- El sistema arma cuatro colecciones y muestra 5 avisos de cada una:
  - **Recién publicados** — los 5 más recientes de ambas ciudades, ordenados por fecha de publicación descendente.
  - **Maracaibo** — 5 avisos activos de esa ciudad.
  - **Distrito Capital** — 5 avisos activos de esa ciudad.
  - **Hasta $400 al mes** — 5 avisos activos con precio ≤ 400, de ambas ciudades.
- Cada colección declara su total real ("Ver los 23").
- La sexta pieza de cada tira lleva a resultados con ese filtro ya aplicado.

**Casos borde**
- Una colección con menos de 5 avisos muestra los que haya y no muestra la placa "Ver todos".
- Una colección vacía no se renderiza: la tira desaparece, no queda un hueco.
- Sin ningún aviso activo en el sistema, el inicio muestra la barra de búsqueda y una invitación a publicar.

**Reglas**
- Ningún aviso vencido, oculto o pendiente de moderación entra en estas colecciones.
- La misma propiedad puede aparecer en dos tiras distintas (por ejemplo reciente y barata).

---

## F2 · Cambiar de ciudad desde el inicio

**Disparador:** el usuario toca la ficha "Maracaibo" o "Distrito Capital".

**Comportamiento**
- Las colecciones se recalculan solo con avisos de esa ciudad.
- La tira de la otra ciudad desaparece.
- La URL pasa a `/?ciudad=maracaibo`.

**Regla no negociable**
- **Aislamiento de ciudad.** Con una ciudad seleccionada, ninguna superficie —listas, tiras, sugerencias, autocompletado, "ampliar búsqueda"— puede devolver un aviso de otra ciudad.

---

## F3 · Filtrar por ciudad

**Disparador:** paso 1 del acordeón de búsqueda.

**Comportamiento**
- Selección **única**. No es multi-selección.
- Cada ciudad muestra su cantidad de avisos activos.
- El campo de texto filtra la lista de ciudades por coincidencia parcial del nombre.
- Al elegir una ciudad distinta a la actual, **el sistema borra las zonas seleccionadas** y lo avisa antes.

**Casos borde**
- Si el usuario venía con zonas de Distrito Capital y elige Maracaibo, las zonas se descartan y el conteo vuelve al total de Maracaibo.
- Una ciudad sin avisos activos aparece con conteo 0 y no es seleccionable.

---

## F4 · Filtrar por zona

**Disparador:** paso 2 del acordeón.

**Comportamiento**
- Selección **múltiple**. Varias zonas se combinan con OR.
- Solo se listan zonas de la ciudad seleccionada.
- Cada zona muestra su cantidad de avisos activos, recalculada con los demás filtros ya puestos.
- El campo de búsqueda **solo autocompleta zonas conocidas** de la base. No acepta texto libre ni busca en títulos ni descripciones.
- El rótulo muestra cuántas zonas hay elegidas.

**Casos borde**
- Sin ninguna zona elegida, se buscan todas las zonas de la ciudad.
- Escribir algo que no coincide con ninguna zona muestra "No hay ninguna zona con ese nombre" y deja la lista completa accesible.
- Una zona con 0 avisos bajo los filtros actuales se muestra atenuada con su conteo en cero.

---

## F5 · Filtrar por precio

**Disparador:** paso 3 del acordeón.

**Comportamiento**
- Dos valores: mínimo y máximo, en dólares. Ambos opcionales.
- El sistema calcula un **histograma de distribución de precios** sobre las zonas ya elegidas y lo muestra antes de que el usuario elija.
- Muestra el rango donde se concentra la oferta: "En Chacao y Altamira, la mayoría está entre $380 y $620."
- El histograma marca qué barras quedan dentro del rango elegido y cuáles fuera.

**Validaciones**
- Solo números enteros. El símbolo `$` es decoración, no se escribe.
- Si el mínimo es mayor que el máximo, el sistema los intercambia en vez de dar error.
- Valores fuera del rango existente se ajustan al extremo real y se avisa.

---

## F6 · Filtrar por habitaciones y atributos

**Disparador:** paso 4 del acordeón.

**Comportamiento**
- **Habitaciones:** 1 / 2 / 3 / 4+. Selección única. Se interpreta como "al menos N" para 4+, exacto para el resto.
- **Solo de dueños:** interruptor. Excluye todo aviso publicado por inmobiliaria o corredor.
- **Atributos:** interruptores por característica (planta eléctrica, agua regular, amoblado, puesto de estacionamiento, vigilancia 24 h, línea blanca).
- Cada atributo muestra **cuántos de los resultados actuales lo tienen** ("9 de los 16 la tienen").

**Casos borde**
- Un atributo que ningún resultado actual tiene aparece deshabilitado con conteo 0.
- Combinar atributos usa AND: piden todos, no cualquiera.

---

## F7 · Contar resultados en vivo

**Disparador:** cualquier cambio en cualquier filtro.

**Comportamiento**
- El botón de confirmación muestra **la cantidad exacta de resultados** que va a devolver: "Ver 47 avisos" → "Ver 21 avisos" → "Ver 16 avisos" → "Ver 9 avisos".
- El conteo se recalcula en cada paso, antes de confirmar.
- Nunca dice "Aplicar" ni "Buscar" a secas.

**Casos borde**
- Con 0 resultados, el botón no se deshabilita: dice "Ningún aviso coincide" y ofrece el filtro más restrictivo para soltar.
- Con 1 resultado, el botón lleva directo a la ficha en vez de a una lista de uno.

---

## F8 · Limpiar filtros

**Disparador:** "Limpiar todo".

**Comportamiento**
- Vuelve todos los filtros a su valor por defecto, **excepto la ciudad**, que se conserva.
- El conteo vuelve al total de la ciudad.

**Justificación:** la ciudad no es un filtro, es el contexto de la búsqueda. Borrarla dejaría al usuario sin ubicación.

---

## F9 · Ver y entender los resultados

**Disparador:** confirmar la búsqueda.

**Comportamiento**
- Cuadrícula de dos columnas, orden por fecha de publicación descendente por defecto.
- Cada tarjeta muestra: foto de portada, **quién publica** (dueño o inmobiliaria), precio mensual, título, zona, habitaciones y metros.
- La barra superior resume la búsqueda: zonas, conteo, rango de precio, habitaciones y tipo de publicador.
- El engranaje muestra cuántos filtros hay activos.

**Reglas no negociables**
- **El publicador siempre visible.** En toda superficie donde aparezca un aviso, se ve si lo publica un dueño o una inmobiliaria, y se distingue **sin depender del color** (relleno vs borde), de modo que funcione en escala de grises.
- **El precio pesa más que el título** en la jerarquía visual.
- Un aviso sin foto no se muestra en la cuadrícula: se le pide la foto al publicador antes de activarlo.

---

## F10 · Recorrer y ampliar los resultados

**Disparador:** el usuario llega al final de la lista.

**Comportamiento**
- **Si hay más resultados:** barra de progreso con "20 de 47" y un enlace real "Ver 20 más". Con JavaScript disponible, el scroll lo dispara solo; sin JavaScript, el enlace funciona igual.
- **Si están todos:** "Son los 9 avisos que coinciden" más un botón que **propone la relajación más efectiva** del filtro: "Ampliar a $900 y ver 14".

**Cómo se elige qué proponer**
- El sistema evalúa cada filtro activo y sugiere soltar el que más resultados agrega.
- Solo propone un cambio a la vez, con el número que va a conseguir.

**Regla:** ninguna pantalla termina en un vacío sin salida.

---

## F11 · Cero resultados

**Disparador:** la combinación de filtros no devuelve nada.

**Comportamiento**
- El sistema explica **qué filtro está causando el vacío**, no un mensaje genérico.
- Ofrece hasta tres salidas concretas, cada una con su conteo:
  - soltar el filtro más restrictivo
  - ampliar el rango de precio al siguiente escalón
  - agregar la zona vecina con más oferta
- Ofrece **avisarme cuando aparezca algo así**, que crea una búsqueda guardada.

**Regla:** nunca se muestran resultados de otra ciudad como consuelo.

---

## F12 · Compartir y volver a una búsqueda

**Comportamiento**
- Todo el estado de búsqueda vive en la URL:
  `/buscar?ciudad=distrito-capital&zona=chacao,altamira&min=250&max=700&hab=2&tipo=dueno&pag=1`
- Consecuencias funcionales:
  - la búsqueda se manda por WhatsApp y el otro ve exactamente lo mismo;
  - el botón de volver del navegador deshace el último filtro;
  - la página es indexable por Google;
  - recargar no pierde nada.

**Casos borde**
- Un parámetro inválido se ignora y se avisa, en vez de romper la página.
- Una zona que ya no existe se descarta y el resto de la búsqueda se respeta.
- Un aviso que ya venció, alcanzado por enlace directo, muestra la ficha marcada como vencida más avisos activos de la misma zona.

---

## F13 · Contacto con llave

**Disparador:** el usuario quiere el WhatsApp de un publicador.

**Comportamiento**
- El bloque de contacto **siempre se ve**, con el número parcialmente oculto.
- Se explica qué falta para verlo y que es gratis.
- Tras registrarse, el usuario vuelve a la misma ficha con el número completo.

**Reglas**
- Todo el contenido del aviso es público e indexable. **Solo el teléfono queda detrás del registro.**
- El registro existe para frenar avisos falsos, y eso se dice explícitamente.

---

## F14 · Funcionar sin JavaScript

**Comportamiento**
- Buscar, filtrar, paginar y navegar funcionan con JavaScript apagado: cada filtro es un formulario o un enlace `GET`, y el acordeón usa `<details>` nativo.
- Con JavaScript disponible se agregan encima, como mejora: carga automática al bajar, conteo en vivo sin recargar, y compresión de fotos al publicar.

**Único lugar donde JavaScript es obligatorio:** subir fotos (comprimir en el dispositivo) e importar cartera (vista previa del archivo).

---

## F15 · Presupuesto de peso

Requisitos medibles, no aspiraciones.

| Superficie | Límite |
|---|---|
| Inicio | 20 fotos de 158×118 ≈ 80 KB |
| Resultados | ≤ 150 KB con 20 avisos (hoy ≈ 128 KB) |
| Ficha | ≤ 500 KB |
| Miniatura | ≤ 40 KB |
| LCP en 3G | ≤ 2,5 s |
| Webfonts | ninguna |

---

## Fuera de alcance, y por qué

| Descartado | Motivo funcional |
|---|---|
| Mapa de resultados | tiles y librería externa; con seis zonas conocidas la lista cumple la misma función |
| Autocompletado de direcciones | servicio externo con costo por consulta; la búsqueda es por zona, no por dirección |
| Búsqueda de texto libre | con 47 avisos devuelve vacío casi siempre y el sitio parece vacío. Se reabre cuando el catálogo pase de varios cientos |
| Ordenar por relevancia | sin señal de comportamiento para calcularla; por fecha es honesto |
| Guardar favoritos sin cuenta | requiere estado en cliente; se resuelve con la cuenta que ya pide el contacto |

---

## Falta especificar

1. Ficha del aviso — galería, verificaciones del publicador, reporte.
2. Publicar — dos pasos, con compresión de fotos en el dispositivo.
3. Mis publicaciones — activa, vence pronto, vencida, oculta; renovación.
4. Registro y verificación de teléfono.
5. Búsquedas guardadas y avisos por correo (F11 las promete).
6. Importar cartera — habilitación por cuenta y errores fila por fila.
7. Moderación de reportes.
8. Escritorio, 1280px.

---

## Criterios de aceptación

1. Se ven 4 avisos completos en la primera pantalla a 360px.
2. Dueño e inmobiliaria se distinguen en escala de grises.
3. El precio se lee antes que el título.
4. La lista de resultados pesa menos de 150 KB con 20 avisos.
5. Buscar, filtrar y paginar funcionan con JavaScript apagado.
6. Toda opción de filtro muestra su conteo antes de elegirla.
7. La URL de una búsqueda filtrada se comparte y reproduce el mismo resultado.
8. Una búsqueda en Maracaibo nunca muestra ni sugiere algo de Distrito Capital.
9. Ninguna pantalla termina en un vacío sin salida.
10. El botón de confirmar filtros siempre dice cuántos resultados va a dar.
