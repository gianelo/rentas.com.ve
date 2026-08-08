# Rentaya — Propuesta de producto

**rentaya.com.ve** · v1 · Agosto 2026

> Publicar una propiedad en alquiler debería ser gratis. Y contactar a quien la publica, directo.

| | |
|---|---|
| **Mercado** | Venezuela |
| **Ciudades de lanzamiento** | Distrito Capital · Maracaibo |
| **Tipo de alquiler** | Residencial, larga estadía |
| **Costo para publicar** | Gratis |

---

## El problema

**La oferta de alquiler existe, pero está donde nadie puede buscarla.**

En Venezuela, quien alquila su propiedad la publica en grupos de WhatsApp y en historias de Instagram. Quien busca vivienda tiene que recorrer esos grupos a mano.

No hay buscador. No hay filtros. No hay forma de comparar. Y los portales que sí ofrecen esas herramientas cobran por publicar, lo que deja fuera justamente al propietario particular que tiene uno o dos inmuebles.

A eso se suma un problema de confianza: sin ninguna señal que verifique quién publica, las estafas son frecuentes. La más común no consiste en inventar una propiedad, sino en **robar las fotos de una publicación real**.

---

## La propuesta

**Un tablón de anuncios, no una inmobiliaria.**

Rentaya es a las propiedades lo que un portal de empleo es a los trabajos: un lugar donde se publica gratis, se busca con filtros reales, y el contacto ocurre directamente entre las partes.

La plataforma **no intermedia la operación y no cobra comisión**. No participa en el trato, no retiene pagos, no redacta contratos. Cuando un interesado encuentra una propiedad, recibe el contacto de WhatsApp de quien la publicó y sigue por su cuenta.

> **Por qué el modelo es gratuito al inicio.** Sin oferta publicada no hay nadie que busque, y sin gente buscando nadie publica. Cobrar desde el día uno impide resolver ese arranque. La monetización posterior prevista es una tarifa baja por publicar o por destacar una propiedad — nunca una comisión sobre el alquiler.

---

## Para quién

**Propietarios particulares.** Personas con uno o dos inmuebles que quieren alquilar sin pagarle a un portal y sin ceder el control del trato. Son el usuario que el producto busca construir a largo plazo.

**Corredores inmobiliarios.** Profesionales con carteras de varias propiedades. Son la semilla del catálogo: un grupo inicial publica su cartera completa a cambio de publicación gratuita permanente.

**Personas buscando vivienda.** Quien necesita alquilar en Distrito Capital o Maracaibo. Busca y filtra sin registrarse; se registra únicamente cuando quiere el contacto de una propiedad concreta.

---

## Alcance de la primera versión

El equipo es una sola persona a tiempo parcial. Esa es la restricción que define el alcance: cada funcionalidad adicional es tiempo que no se dedica a las cuatro que sostienen el producto.

### Incluye

1. **Publicar** una propiedad en alquiler de larga estadía, gratis, con precio en dólares.
2. **Buscar y filtrar** por ciudad, zona, precio y características.
3. **Revelar el contacto** de WhatsApp del publicador una vez que el interesado se registra.
4. **Vencimiento y renovación**: la publicación caduca a los 30 días, con aviso automático previo y renovación en un clic.

### No incluye — fase 2

- Alquiler turístico o de corta estadía
- Locales comerciales y oficinas
- Agenda de visitas y chat interno
- Favoritos y panel de estadísticas
- Pagos, contratos y cualquier comisión
- Carga masiva de carteras
- Ciudades más allá de las dos de lanzamiento

---

## Cuatro reglas que no se negocian

**Se ve quién publica.** Cada propiedad indica de forma visible si la publica el propietario o un corredor. La promesa del producto es que la plataforma no intermedia; si el interesado cree que habla con el dueño y en realidad habla con un corredor, esa promesa se rompe.

**Precios en dólares, únicamente.** Un solo campo de precio, sin conversión ni tasa de cambio. Los filtros por rango funcionan y los precios no quedan desactualizados.

**Las ciudades no se mezclan.** Una búsqueda en Maracaibo nunca devuelve una propiedad de Distrito Capital, bajo ninguna combinación de filtros. La restricción está garantizada en la base de datos, no confiada a que cada consulta esté bien escrita.

**El contacto siempre queda entre las partes.** La plataforma revela el WhatsApp y se aparta. No hay retención de pagos ni participación en el acuerdo.

---

## Antifraude sin costo por usuario

La verificación por SMS se descartó: cobra por mensaje y compite contra una propuesta gratuita. Las tres medidas elegidas cuestan desarrollo, no dinero recurrente.

**Ingreso con Google.** Sin contraseñas. Aporta un correo ya verificado y encarece la creación de cuentas descartables.

**Detección de fotos repetidas.** Cada imagen recibe una huella visual al subirse. Si una foto ya pertenece a la publicación de otra cuenta, la nueva se rechaza. Ataca directamente la estafa más frecuente, que es el robo de fotos ajenas.

**Reporte con ocultado automático.** Una publicación reportada por tres cuentas distintas se oculta de la búsqueda automáticamente, y puede restituirse si el reporte fue injusto.

> **Verificación telefónica: preparada, no activada.** El sistema incluye el punto de conexión para verificar el número de quien publica, pero apagado en la primera versión. El mecanismo previsto evita el costo de mensajería: el usuario envía un código a la plataforma en lugar de recibirlo. Se activará cuando se confirmen los costos vigentes.

---

## Cómo se mide el éxito

> ### Métrica principal — primeros 6 meses
> **Contactos únicos entre interesado y propiedad.**
>
> Cuántas personas registradas piden el contacto de una propiedad, contando una sola vez cada par de interesado y propiedad. Se registra además cada solicitud individual, pero el número que decide continuar o cambiar de rumbo es el de contactos únicos.

Se descartaron dos alternativas. La **cantidad de propiedades publicadas** mide el tamaño del catálogo, no su utilidad: es posible tener cientos de publicaciones sin un solo interesado. Los **alquileres cerrados** serían el resultado ideal, pero como el trato ocurre fuera de la plataforma, no hay forma confiable de medirlos.

El crecimiento de esta métrica es además la base del modelo de negocio futuro: un corredor que recibe contactos de forma sostenida tiene una razón concreta para pagar una tarifa baja.

---

## Riesgos

| Riesgo | Nivel | Cómo se aborda |
|---|---|---|
| Catálogo vacío al lanzar | Alto | Una ciudad no se abre al público hasta que las carteras de los corredores iniciales estén cargadas |
| Alcance que se expande | Alto | Cuatro funcionalidades son un tope firme; todo lo demás está declarado fuera de alcance por escrito |
| El aviso de vencimiento falla en silencio | Alto | Es el único proceso automático del sistema; registra cada ejecución, cuántos avisos envió y qué falló |
| Dependencia de los corredores iniciales | Medio | El compromiso de gratuidad permanente se acota al grupo semilla, mientras crece la oferta de particulares |
| Un portal establecido copia el modelo | Medio | Aceptado. La defensa es velocidad de ejecución y señales de confianza, no exclusividad |
| Responsabilidad legal sobre lo publicado | Medio | Términos que asignan la responsabilidad al publicador, vía de retiro de contenido y datos mínimos |

---

## Cómo se construye

Todo el sistema corre sobre servicios con capa gratuita, en un único lenguaje de punta a punta. El criterio no fue elegir lo mejor en abstracto, sino lo que una sola persona puede sostener sin gasto fijo.

| | |
|---|---|
| Aplicación | Next.js sobre React |
| Base de datos | Postgres administrado |
| Fotos | Almacenamiento de objetos |
| Identidad | Ingreso con Google |
| Avisos | Correo transaccional |
| Proceso diario | Tarea programada |

El aviso de vencimiento se diseñó para no depender de ningún proveedor en particular: la tarea programada solo dispara un llamado y toda la lógica vive en la aplicación, de modo que cambiar de proveedor no implica reescribir nada.

El detalle completo está en el [resumen técnico](resumen-tecnico.md).

---

## Estado del proyecto

| | |
|---|---|
| Definición de producto | Cerrada |
| Propuesta de cambio | Escrita |
| Especificación funcional — 6 capacidades | Escrita |
| Diseño técnico y elección de tecnología | Cerrado |
| Desglose de tareas | Cerrado — 71 tareas en 9 entregas |
| Implementación | Pendiente |

Aún no se ha escrito código de la aplicación. La especificación completa, con requisitos y escenarios verificables por capacidad, está en [`openspec/`](../openspec/).

---

*Documento interno de trabajo. Las cifras de alcance y las decisiones técnicas pueden ajustarse durante la implementación.*
