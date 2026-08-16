# Rentas — Resumen técnico del MVP

**rentas.com.ve** · Agosto 2026

Portal de alquiler residencial de larga estadía, sin intermediación. Monolito TypeScript, estructura hexagonal por capacidad, y tres reglas de negocio garantizadas por estructura en lugar de por disciplina.

---

## Stack

El criterio no fue el mejor stack en abstracto, sino lo que una sola persona a tiempo parcial puede sostener sin gasto fijo. La familiaridad domina: un stack desconocido convierte cada bug en tres noches.

| Área | Elección | Razón |
|---|---|---|
| Framework | Next.js 15 · React 19 | Un solo lenguaje de punta a punta, sin separar SPA y API |
| Hosting | Vercel | Capa gratuita y despliegue sin configuración |
| Base de datos | Neon Postgres · Drizzle | Postgres administrado con capa gratuita y ORM tipado |
| Fotos | Cloudflare R2 | Egreso sin costo — decisivo para un catálogo con muchas imágenes |
| Identidad | Auth.js v5 · Google | Sin contraseñas, correo ya verificado |
| Correo | Resend | Capa gratuita suficiente para el recordatorio de vencimiento |
| Programado | Vercel Cron → ruta HTTP | El planificador solo dispara; la lógica vive en la aplicación |
| Pruebas | Vitest · Playwright | `pnpm test` — TDD estricto activo |

Descartados con razón registrada: Supabase como solución integral (su capa gratuita de ancho de banda limita a unas 2.500 vistas de detalle al mes con seis fotos por publicación), Vercel Postgres y Blob, Railway, Render, Fly, SQLite y Turso, y una arquitectura separada de SPA más API.

---

## Estructura

Hexagonal, un módulo por capacidad. El dominio no conoce infraestructura; los adaptadores se conectan desde afuera.

```
src/modules/
  account-identity/     · Google, sesión, puerto de verificación telefónica
  listing-publication/  · alta y edición, precio USD, tipo de publicador
  listing-search/       · búsqueda con aislamiento por ciudad
  contact-reveal/       · revelado de WhatsApp y evento de métrica
  listing-lifecycle/    · vencimiento a 30 días, recordatorio, renovación
  listing-trust/        · huella de fotos, reportes, ocultado automático

cada uno: domain/ · application/ · infrastructure/
```

---

## Tres garantías estructurales

Cada una de estas reglas podría escribirse como una comprobación en el código y confiarse a que nadie la olvide. Se resolvieron de forma que **no exista la posibilidad de olvidarlas**.

### Aislamiento entre ciudades

Una clave foránea compuesta `(zone_id, city_id) → zone(id, city_id)` hace que una propiedad con zona de otra ciudad sea imposible de guardar. Además, el puerto de búsqueda recibe `cityId` como parámetro obligatorio no nulo: no se puede consultar sin ciudad ni por accidente.

### Excepción de fotos del mismo publicador

El puerto de huellas expone únicamente `findMatchesFromOtherPublishers(hash, excludePublisherId, maxDistance)`. No existe una función que devuelva todas las coincidencias, así que la excepción no se puede saltear.

Sin ella, el propietario que republica su propiedad vencida quedaría bloqueado por sus propias fotos — justo el flujo que el vencimiento a 30 días fomenta.

### La métrica correcta es la fácil de calcular

El evento de revelado se guarda sin deduplicar en una única tabla. El número principal sale de una vista que devuelve exactamente una fila por par de interesado y propiedad, así que la consulta es un `COUNT(*)` simple. Nadie tiene que acordarse de deduplicar, y no hay una segunda copia que pueda desincronizarse.

---

## Huella perceptual de imágenes

Detecta fotos visualmente iguales, no archivos idénticos — el estafador que recorta o recomprime una imagen robada no evade la comprobación.

```
sharp → escala de grises 9×8 → dHash de 64 bits
almacenado como bit(64) en Postgres
comparación en el alta: bit_count(hash # $candidato) <= 8
```

Postgres 14 en adelante trae `bit_count` de forma nativa, así que no hace falta ninguna extensión.

El umbral de 8 es un punto de partida razonable, **no un valor calibrado**: hay que ajustarlo contra fotos reales antes del lanzamiento. Demasiado laxo rechaza a publicadores honestos; demasiado estricto deja pasar fotos robadas recomprimidas.

---

## El proceso programado

Es el único proceso en segundo plano del sistema, y falla en silencio. Por eso se diseñó defensivamente.

- **El planificador no ejecuta lógica.** Solo hace un `POST` autenticado a la ruta del trabajo. Cambiar de proveedor es configuración, no código.
- **Es idempotente.** Una restricción de unicidad sobre `(listing_id, expires_at)` impide enviar dos veces el mismo recordatorio.
- **Deja rastro.** Cada ejecución escribe una fila con cuántos candidatos encontró, cuántos avisos envió y qué falló.
- **El enlace de renovación se dibuja con `GET` y muta con `POST`.** Los filtros de seguridad de correo abren los enlaces por adelantado; si la renovación ocurriera en el `GET`, cada token se consumiría antes de que el usuario haga clic.

Limitación conocida: la capa gratuita de Vercel ejecuta el cron una vez al día con margen de hasta una hora. Inofensivo para un aviso con cinco días de anticipación, pero una ejecución fallida no tiene reintento el mismo día.

---

## Modelo de datos

```
user · account · session          (Auth.js)
city · zone                       (zonas curadas por ciudad)
listing · listing_photo · listing_photo_hash
contact_reveal_event              (append-only, sin deduplicar)
  ↳ vista contact_reveal_unique_pair
listing_report · moderation_action
listing_reminder · job_run
```

`listing.publisher_type` es `owner | broker`, no nulo y sin valor por defecto — es la afirmación de confianza central del producto y nunca se infiere. `listing.price_usd` es un solo `numeric(10,2)`: no hay columna de moneda ni conversión. `city_id` se copia al escribir el evento de revelado, para que la métrica sobreviva a que la propiedad se edite, venza o se elimine.

---

## Deuda registrada

### Plan de hosting sin licencia comercial

La capa gratuita de Vercel no permite uso comercial. Es legítima mientras el producto sea totalmente gratuito y no genere ingresos.

El paso al plan pago, de unos 20 dólares al mes, es **condición previa obligatoria** del primer cobro de cualquier tipo — tarifa por publicar, destacado o publicidad. No es un pendiente posterior. Nada en la arquitectura depende del comportamiento de la capa gratuita, así que la migración es un cambio de facturación, no de código.

---

## Preguntas abiertas

- **Umbral de similitud.** La distancia de 8 no está calibrada contra fotos reales.
- **Retención del registro de revelados.** La tabla crece sin límite y contiene datos personales. Además, ahora que la métrica sale de una vista, borrar historia reescribe los números históricos: no hay copia de respaldo.
- **Alerta de cron detenido.** El registro guarda los fallos, pero nada avisa si el disparador deja de ejecutarse por completo.
- **Tipo de la vista.** `DISTINCT ON` es específico de Postgres y queda fuera del constructor tipado de Drizzle, así que su tipo se declara a mano y puede desviarse del esquema sin que el compilador lo note.
- **Límites de las capas gratuitas.** Las cifras de este documento deben reverificarse al implementar; los proveedores las cambian con frecuencia.

---

## Plan de entrega

127 tareas ordenadas por dependencias, entre 5.100 y 7.400 líneas estimadas, repartidas en doce entregas encadenadas — cada una construida sobre la anterior y desplegable por separado.

| | Entrega | Contenido |
|---|---|---|
| PR0 | Arranque | Herramientas, esquema base, configuración |
| PR1 | Identidad | Google, sesión, puerto de verificación apagado |
| PR2 | Ciudades y zonas | Esquema, carga inicial, selector |
| PR3 | Publicación | Alta, edición, fotos, tipo de publicador |
| PR4 | Confianza: fotos | Huella perceptual y rechazo de duplicados |
| PR5 | Búsqueda | Filtros y aislamiento por ciudad |
| PR6 | Revelado de contacto | Evento y vista de pares únicos |
| PR7 | Ciclo de vida | Vencimiento, recordatorio automático, renovación |
| PR8 | Confianza: reportes | Ocultado automático y restitución |
| PR9 | Carga masiva de cartera | CSV validado, vista previa, borradores, idempotencia |
| PR10 | Colaboración voluntaria | Invitación descartable y destino externo |
| PR11 | Descubrimiento y SEO | Páginas por zona, URLs, mapa del sitio, página de vencido |

Publicación (PR3), ciclo de vida (PR7) y carga masiva (PR9) son las tres entregas más pesadas y probablemente haya que subdividirlas al implementarlas.

**La carga masiva no es una segunda vía de publicación.** Lee el archivo, valida, y crea borradores; después delega en los mismos casos de uso de publicación y en la misma tubería de confianza. No tiene escritura propia sobre la tabla de publicaciones, porque una regla que quien llama puede olvidar deja de ser una garantía. El tipo de publicador se deriva de la cuenta y **no se puede leer del archivo**: un corredor que escriba «propietario» en una columna no se convierte en propietario.

Las fotos nunca viajan dentro del CSV. Los borradores las reciben por la misma subida firmada a R2 que ya usa el alta individual, lo que reutiliza la verificación de duplicados sin tocarla y mantiene las imágenes fuera de la función serverless.

**Las variantes de imagen se generan al subir, no al servir.** `sharp` ya está en la tubería para calcular la huella perceptual, así que produce ahí mismo la miniatura de tarjeta y la imagen de ficha, y ambas se guardan en R2. El original se descarta después de hashearlo. La razón es un techo de producto: guardar los originales de seis fotos por publicación agota los 10 GB gratuitos de R2 alrededor de las **330 publicaciones**; guardando solo variantes, el mismo plan sostiene unas **7.000**.

**El camino de lectura no manda JavaScript.** Buscar y filtrar ocurre en el servidor con parámetros de URL, sin capa de filtrado en el cliente. Los componentes cliente quedan reservados para interacción real: subir fotos, revelar contacto, descartar la invitación, previsualizar una importación. Esa única decisión resuelve a la vez la sensación de tablón de clasificados, la velocidad en datos móviles caros, y que cada búsqueda sea una URL compartible por WhatsApp e indexable por Google.

---

*La especificación completa, con requisitos y escenarios verificables por capacidad, está versionada en [`openspec/`](../openspec/).*
