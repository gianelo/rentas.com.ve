# Brief de diseño — Rentas

Documento portable. Pegalo en la herramienta que quieras probar (claude.ai, v0, Lovable, Figma AI) para explorar direcciones visuales.

**Cómo usarlo:** copiá desde "Prompt corto" si querés algo rápido, o pegá el documento completo si la herramienta acepta contexto largo. El documento completo da mejores resultados.

---

## Prompt corto

> Diseñá la interfaz de **Rentas**, un portal de alquiler residencial para Venezuela. Es gratis, sin comisión y sin intermediación: el inquilino busca, encuentra, y recibe el WhatsApp de quien publica para seguir por su cuenta.
>
> El usuario está en un celular de gama media, con datos móviles caros, en Caracas o Maracaibo. Cada kilobyte que mandás lo paga él. La página de resultados no puede pasar de 150 KB ni la ficha de 500 KB, y el camino de lectura no manda JavaScript.
>
> Diseñá para móvil primero, a 360px de ancho. El precio es lo que la gente escanea, no el título. Cada aviso debe mostrar siempre si lo publica un dueño o una inmobiliaria — es el reclamo de confianza central del producto, en un mercado donde la estafa con fotos robadas es rutina.
>
> Toda la interfaz en español de Venezuela, neutro y directo. Usá datos reales: zonas como Chacao, Altamira, Los Palos Grandes, El Rosal, Tierra Negra, Bella Vista. Precios de $250 a $900 mensuales. Nada de lorem ipsum.
>
> Empezá por tres pantallas: resultados de búsqueda, ficha del aviso, y formulario de publicación.

---

## El producto

Rentas es a las propiedades lo que un portal de empleo es a los trabajos. Publicar es gratis, buscar es gratis, y la plataforma **no participa en el trato**: no retiene pagos, no redacta contratos, no cobra comisión. Cuando alguien encuentra lo que busca, recibe el WhatsApp de quien publicó y sigue por su cuenta.

Existe porque hoy la oferta de alquiler vive en grupos de WhatsApp e Instagram: no se puede buscar y no se puede confiar. Los portales pagos dejan afuera al propietario individual, y el robo de fotos hace que la estafa sea rutina.

Solo alquiler residencial de larga estadía. Solo Distrito Capital y Maracaibo. Solo dólares.

## Quién lo usa y en qué

- **Inquilino** — celular de gama media, datos móviles caros, conexión inestable. Busca por zona y precio. Compara varias propiedades antes de escribirle a alguien.
- **Dueño particular** — publica una o dos propiedades. No es técnico. Llena el formulario parado, con una mano.
- **Corredor inmobiliario** — carga una cartera de 20 a 50 propiedades de una vez con un archivo.
- **Operador** (una sola persona) — modera reportes y habilita la carga masiva cuenta por cuenta.

## No negociable

Esto no es preferencia estética. Es el producto. Cualquier propuesta tiene que respetarlo.

| Restricción | Detalle |
|---|---|
| **Peso** | Resultados ≤ 150 KB · ficha ≤ 500 KB · miniatura ≤ 40 KB · LCP ≤ 2,5 s en 3G |
| **Sin JavaScript al leer** | Buscar, filtrar y navegar funcionan con JS apagado. Solo subir fotos e importar pueden usarlo |
| **Sin webfonts** | El stack tipográfico del sistema. Una fuente web son 30-80 KB antes de ver nada |
| **Móvil primero** | Se diseña a 360px. Sin scroll horizontal. Objetivos táctiles de 44px mínimo |
| **El precio domina** | Es lo primero que se escanea en un clasificado. Más grande y más pesado que el título |
| **Dueño / inmobiliaria siempre visible** | En todo lugar donde aparezca un aviso. Y distinguible **sin depender del color** — que funcione en blanco y negro |
| **Contacto con llave** | El WhatsApp solo se muestra a usuarios registrados. Se ve que existe, se explica qué falta para verlo |
| **Ciudad aislada** | Una búsqueda en Maracaibo jamás muestra algo de Distrito Capital. Ni siquiera en sugerencias |
| **Accesible** | Contraste WCAG AA, etiquetas reales en los formularios, foco de teclado visible, texto alternativo en fotos |
| **Indexable** | El contenido del aviso es público y renderizado en servidor. Solo el teléfono queda detrás del registro |

## Libre para explorar

Todo lo demás es tuyo:

- Paleta y temperatura del color
- Personalidad tipográfica dentro del stack del sistema — jerarquía, pesos, escala
- Densidad y ritmo de espaciado
- Forma de los componentes: bordes, radios, separación, profundidad
- Tono general: cálido y cercano, o sobrio e institucional, o cualquier otra cosa
- Cómo se resuelve la jerarquía sin gastar bytes

Una dirección austera y monocroma **es una salida válida, no la única**. Un producto nuevo, sin marca, en un mercado con miedo a la estafa, también necesita no verse abandonado.

## Pantallas

Empezá por las tres primeras. Si la herramienta da para más, seguí en orden.

1. **Resultados de búsqueda** — la pantalla del producto. Define densidad y la unidad de resultado
2. **Ficha del aviso** — define el peso, que es la restricción real
3. **Publicar** — la única pantalla compleja del lado de quien ofrece
4. Filtros
5. Sin resultados
6. Página de zona — el aterrizaje de Google, una por cada zona
7. Aviso vencido, con sugerencias activas de la misma zona
8. Mis publicaciones — con estados: activa, vence pronto, vencida, oculta
9. Importar cartera — vista previa con errores fila por fila
10. Correo de recordatorio de vencimiento

## Contenido real

Nada de texto de relleno. Un mockup con lorem ipsum miente sobre la densidad, y la densidad es lo que estás decidiendo.

**Zonas de Distrito Capital:** Chacao · Altamira · La Castellana · Los Palos Grandes · El Rosal · Las Mercedes
**Zonas de Maracaibo:** Tierra Negra · Bella Vista · La Lago · Indio Mara

**Precios:** de $250 a $900 mensuales

**Títulos como los escribe la gente:**
- Apartamento 2 habitaciones con puesto de estacionamiento
- Apto amoblado cerca del metro, edificio con vigilancia
- Estudio en Altamira, ideal para una persona
- Apartamento amplio en La Castellana, 3 habitaciones

**Detalles que importan en este mercado:** planta eléctrica · vigilancia 24 horas · agua regular · puesto de estacionamiento · línea blanca incluida · depósito de dos meses

Todo en español de Venezuela. Neutro y directo, sin regionalismos marcados.

## Referencias

### Craigslist — la referencia principal

Es el punto de partida declarado del producto, pero hay que ser preciso sobre **qué** se toma de ahí. Craigslist sigue siendo el clasificado más usado del mundo después de treinta años, y no es por casualidad.

**Lo que hay que tomar:**

- **El aviso es la interfaz.** No hay cromo compitiendo con el contenido: ni encabezado gigante, ni banner de bienvenida, ni sección de "cómo funciona". Entrás y ya estás viendo avisos.
- **Densidad como respeto.** Muestra muchos resultados por pantalla porque asume que sabés leer y que viniste a comparar, no a que te entretengan.
- **Velocidad como funcionalidad.** Carga instantáneo en cualquier conexión. Eso no es una consecuencia del diseño feo: es la decisión de diseño.
- **Jerarquía por texto, no por imagen.** El texto del aviso hace el trabajo. Las fotos son apoyo.
- **Cero fricción para publicar.** Publicar es un formulario, no un embudo de cinco pasos.
- **Confianza por transparencia, no por marca.** No intenta parecer una empresa grande. Parece una herramienta, y eso genera su propio tipo de confianza.

**Lo que NO hay que tomar:**

- **La estética de 1996.** Se ve así porque nunca cambió, no porque lo feo cause velocidad. Se puede ser igual de rápido y liviano con espaciado, escala tipográfica y contraste de este siglo.
- **La ausencia de diseño móvil.** Craigslist en celular es incómodo. Nuestro usuario **es** móvil, no de escritorio.
- **Los enlaces azules subrayados por todos lados** como único recurso visual.
- **Que no haya miniaturas en la lista.** Acá sí van: una propiedad sin foto no se alquila. La diferencia es que va una miniatura chica por fila, no una foto grande.
- **La sensación de abandono.** Craigslist puede permitírselo porque tiene treinta años de reputación. Un producto nuevo en un mercado con miedo a la estafa, no.

**La síntesis:** la jerarquía de información de Craigslist, con la disciplina tipográfica y de espaciado de un producto actual.

### Otras referencias que vale la pena mirar

| Sitio | Qué mirar | Qué no copiar |
|---|---|---|
| **GOV.UK** | La mejor respuesta que existe a "sobrio sin verse abandonado". Accesible, rapidísimo, y se ve cuidado. Muy cerca de lo que necesita este producto | El tono institucional de gobierno |
| **Hacker News** | Densidad extrema que funciona. Cero imágenes, cero JavaScript, y la gente lo usa horas | Sin fotos no sirve para propiedades |
| **Idealista** | Alquiler bien resuelto en móvil: la tarjeta, los filtros, cómo muestran precio y zona | Pesa mucho; es un portal pago con otro presupuesto |
| **OLX / Mercado Libre** | El lenguaje de clasificados que la región ya entiende | Cargados de publicidad y de módulos que compiten entre sí |
| **Airbnb / Zillow** | Cómo se ve un producto inmobiliario caro | Foto primero es exactamente lo contrario de nuestro presupuesto |

Al mirar cualquiera de estos, la pregunta útil no es "¿me gusta?" sino **"¿cuántas propiedades veo en la primera pantalla del celular, y cuánto pesó eso?"**.

## Qué evitar

- Fotos gigantes tipo Airbnb. Cada foto grande es presupuesto que se gasta y un inquilino que no puede pagar
- Carruseles, animaciones de entrada, efectos al hacer scroll
- Grilla de tarjetas en móvil. Muestra una propiedad y media por pantalla — con catálogo chico, parecés vacío
- Encabezado gigante que empuje los resultados abajo del pliegue
- El clisé de diseño generado: crema con serif y terracota, o degradado violeta a azul, o Inter con todo redondeado y sombras suaves
- Estética retro de 1996. Sobrio no es lo mismo que abandonado

## Cómo evaluarlo

Cuando vuelvas con una propuesta, se mide contra esto:

1. ¿Cuántas propiedades se ven en la primera pantalla a 360px?
2. ¿Se distingue dueño de inmobiliaria en blanco y negro?
3. ¿El precio se lee antes que el título?
4. ¿Entra en el presupuesto de bytes, o hay que recortar fotos?
5. ¿Funciona sin JavaScript?
6. ¿Se ve cuidado sin verse caro?

---

*Contexto completo del producto: `docs/propuesta-de-producto.md`. Decisiones técnicas y presupuesto: `openspec/changes/mvp-rental-listings/design.md`, D11 a D15.*
