# Base territorial de Venezuela

Base de datos territorial para **rentas.com.ve**. Cubre el **Distrito Capital**, los
municipios metropolitanos del **estado Bolivariano de Miranda**, el **estado La Guaira**
y cuatro municipios del **estado Zulia**.

## Archivos

| Archivo | Contenido |
|---|---|
| [`distrito-capital.md`](./distrito-capital.md) | Distrito Capital → Municipio Bolivariano Libertador → 22 parroquias |
| [`miranda.md`](./miranda.md) | Estado Bolivariano de Miranda → municipios Baruta, Chacao, El Hatillo y Sucre → 10 parroquias |
| [`la-guaira.md`](./la-guaira.md) | Estado La Guaira → Municipio Vargas → 11 parroquias |
| [`zulia/`](./zulia/) | Estado Zulia → municipios Maracaibo, San Francisco, Santa Rita y Cabimas → 38 parroquias *(un archivo por municipio)* |

---

## Jerarquía territorial

```
Venezuela
├── Distrito Capital                        (entidad federal)
│   └── Municipio Bolivariano Libertador
│       └── 22 parroquias
│           └── Barrio / Sector / Urbanización / Conjunto residencial /
│               Parcelamiento / Otros
│
├── Estado Bolivariano de Miranda           (entidad federal — 21 municipios, 55 parroquias)
│   ├── Municipio Baruta
│   │   ├── Parroquia Nuestra Señora del Rosario de Baruta
│   │   ├── Parroquia El Cafetal
│   │   └── Parroquia Las Minas de Baruta
│   ├── Municipio Chacao
│   │   └── Parroquia Chacao
│   ├── Municipio El Hatillo
│   │   └── Parroquia El Hatillo
│   └── Municipio Sucre
│       ├── Parroquia Petare              ← Petare vive AQUÍ
│       ├── Parroquia Caucagüita
│       ├── Parroquia Fila de Mariche
│       ├── Parroquia La Dolorita
│       └── Parroquia Leoncio Martínez
│
├── Estado La Guaira                        (entidad federal — antes «estado Vargas»)
│   └── Municipio Vargas
│       └── 11 parroquias
│           ├── Caraballeda      ├── La Guaira
│           ├── Carayaca         ├── Macuto
│           ├── Caruao           ├── Maiquetía
│           ├── Catia La Mar     ├── Naiguatá
│           ├── El Junko         ├── Urimare
│           └── Carlos Soublette
│
└── Estado Zulia                            (entidad federal — 21 municipios, 110 parroquias)
    ├── Municipio Maracaibo      → 18 parroquias   → zulia/maracaibo.md
    ├── Municipio San Francisco  →  7 parroquias   → zulia/san-francisco.md
    ├── Municipio Santa Rita     →  4 parroquias   → zulia/santa-rita.md
    ├── Municipio Cabimas        →  9 parroquias   → zulia/cabimas.md
    └── (17 municipios más, fuera de este alcance)
```

El modelo de datos es siempre el mismo:

```
Estado (entidad federal)
  └── Municipio
        └── Parroquia
              └── Barrio | Sector | Urbanización | Conjunto residencial |
                  Parcelamiento | Caserío | Pueblo | Comunidad | Localidad | Otro
```

---

## Lo que hay que tener claro

### Distrito Capital ≠ Caracas metropolitana

**Distrito Capital** es una **entidad federal**: un solo municipio (Bolivariano
Libertador) y 22 parroquias. **Caracas metropolitana** es una **conurbación de
hecho** que atraviesa dos entidades federales. No son lo mismo y nunca deben
mezclarse en la base de datos.

La *Ley Especial sobre el Régimen del Distrito Metropolitano de Caracas*
(Gaceta Oficial N° 36.906 del 08/03/2000) agrupaba cinco municipios:

| Municipio | Entidad federal |
|---|---|
| Bolivariano Libertador | **Distrito Capital** |
| Baruta | **Miranda** |
| Chacao | **Miranda** |
| El Hatillo | **Miranda** |
| Sucre | **Miranda** |

Cuatro de los cinco **no son Distrito Capital**. Ese Distrito Metropolitano fue
suprimido por decreto de la Asamblea Nacional Constituyente del 20/12/2017
(Gaceta Oficial N° 41.308 del 27/12/2017).

### Petare ≠ Distrito Capital

**Petare = Estado Bolivariano de Miranda → Municipio Sucre → Parroquia Petare.**
Es además la **capital del Municipio Sucre**.

### La parroquia Sucre del Distrito Capital ≠ el Municipio Sucre de Miranda

Se llaman igual y están en entidades distintas.

| | Parroquia Sucre | Municipio Sucre |
|---|---|---|
| Entidad | Distrito Capital | Estado Bolivariano de Miranda |
| Nivel | Parroquia | Municipio |
| Se conoce como | **Catia** | **Petare** |
| UBIGEO | `010121` | `1519xx` |

### La Guaira ≠ Distrito Capital

**La Guaira** es una entidad federal propia. Estar a 30 km de Caracas no la hace
parte de Caracas. Además, dentro de esa entidad conviven tres cosas con nombres
parecidos que **no** son lo mismo:

- **Estado La Guaira** — la entidad federal (antes *estado Vargas*).
- **Municipio Vargas** — el único municipio; **conservó el nombre Vargas**.
- **Parroquia La Guaira** — una de las 11 parroquias, y capital del estado.

### Zulia ≠ Caracas, y Maracaibo ≠ Zulia

El **estado Zulia** está a ~700 km de Caracas y no tiene ninguna relación
administrativa con ella. Dentro de Zulia:

- **Maracaibo** es un municipio, no el estado. Zulia tiene 21 municipios.
- **San Francisco** está conurbado con Maracaibo pero es un **municipio propio**,
  separado en 1995.
- **Santa Rita** y **Cabimas** están en la **orilla oriental** del Lago de Maracaibo.
  No están conurbados con Maracaibo.

Detalle completo en [`zulia/README.md`](./zulia/README.md).

### Miranda ≠ Distrito Capital

Miranda tiene **21 municipios** y **55 parroquias**, y su capital es **Los Teques**.
Solo cuatro de sus municipios integran el área metropolitana de Caracas. Este
proyecto documenta esos cuatro; el resto queda listado en `miranda.md` sin detalle
sub-parroquial.

---

## Resumen cuantitativo

| Categoría | Distrito Capital | Miranda (metro) | La Guaira | Zulia | Total |
|---|---:|---:|---:|---:|---:|
| Municipios | 1 | 4 | 1 | 4 | **10** |
| Parroquias | 22 | 10 | 11 | 38 | **81** |
| | | | | | |
| Barrios | 843 | 195 | 14 | 648 | **1700** |
| Sectores | 277 | 154 | 372 | 419 | **1222** |
| Urbanizaciones | 297 | 209 | 18 | 250 | **774** |
| Conjuntos residenciales | 44 | 55 | 9 | 160 | **268** |
| Parcelamientos | 2 | 12 | 0 | 57 | **71** |
| Caseríos | 0 | 1 | 0 | 1 | **2** |
| Comunidades | 0 | 0 | 4 | 0 | **4** |
| Localidades | 15 | 10 | 89 | 13 | **127** |
| Otros / sin categoría confirmada | 447 | 357 | 261 | 186 | **1251** |
| Edificaciones identificadas individualmente | 74 | 191 | 12 | 9 | **286** |
| **Total sub-parroquial** | **1999** | **1184** | **779** | **1743** | **5705** |

> **Otros / sin categoría confirmada** agrupa nombres reales, documentados por una
> fuente, **cuya categoría la fuente no declara**. No se les asignó categoría por
> inferencia; cada uno lleva anotada la etiqueta original de la fuente.
>
> **Edificaciones identificadas individualmente** son nombres que OpenStreetMap mapea
> como `landuse=residential` pero que designan una edificación concreta («Edificio
> Mara», «Residencias Canaima»), no una división territorial. Se separaron para que no
> contaminen el catálogo de zonas. **No se eliminaron.**

---

## Índice de topónimos — cómo buscar una zona

Cada archivo termina con un **Índice de topónimos** antes de la sección *Fuentes*. Es la
entrada correcta para buscar por nombre de mercado.

Existe porque el nombre que publica la fuente y el nombre por el que la gente busca no
siempre coinciden:

| La fuente publica | La gente busca |
|---|---|
| `Oficina Postal Telegráfica Bella Vista` | Bella Vista |
| `Barrio Tierra Negra del Sector Bella Vista` | Tierra Negra · Bella Vista |
| `Casco Central de Catia` | Catia |

El índice extrae el topónimo quitando **solo la palabra de categoría** (`Barrio`,
`Sector`, `Urbanización`, `Conjunto Residencial`, `Parcelamiento`, `Caserío`,
`Casco Central de`, `Centro de`, `Zona Industrial`, `Oficina Postal Telegráfica`) e
indexa también el topónimo enterrado en los nombres compuestos `X del Sector Y`.

**El índice no crea zonas.** Cada topónimo sale de un nombre que la fuente ya publica, y
la fila muestra en qué parroquia y bajo qué entrada aparece.

### Advertencia: la misma zona puede estar en otra parroquia de la que suponés

Es el error más fácil de cometer con estos archivos.

| Topónimo | Dónde lo buscan | Dónde está de verdad |
|---|---|---|
| **Bella Vista** | Coquivacoa (solo la oficina postal) | **Olegario Villalobos** — `Sector Bella Vista` |
| **La Limpia** | Maracaibo | **San Francisco** — parroquias Domitila Flores y San Francisco |
| **Coromoto** | Maracaibo | **San Francisco** — `Urbanización Coromoto` |

Usá el índice de topónimos antes de concluir que una zona falta.

### Lo que sí falta, y por qué no se agregó

Topónimos de mercado que **ninguna fuente oficial registra** — nombres coloquiales,
viales o de referencia. Verificados como ausentes en IPOSTEL para todo el estado Zulia:

- `Grano de Oro` · `Curva de Molina` · `Circunvalación`

Agregarlos exigiría inventarlos. **No se hizo.** Si aparece una fuente que los
documente, entran.

---

## Metodología

### Fuentes, en orden de autoridad

1. **INE — División Político Territorial con fines Estadísticos (DPT)**
   <https://ine.gob.ve/wp-content/uploads/2024/08/DIVISION-POLITICO-TERRITORIAL.pdf>
   Define entidades, municipios, parroquias, capitales y códigos UBIGEO.
   **Es la fuente normativa de la jerarquía.**
2. **IPOSTEL — *Zonas Postales*** (PDF oficial de 920 páginas)
   <https://www.ipostel.gob.ve/> · extracto oficial:
   <https://www.ipostel.gob.ve/wp-content/uploads/2023/07/Codigos.pdf>
   Aporta los nombres sub-parroquiales **con la categoría y la parroquia que la
   propia fuente declara**, más el código postal.
3. **OpenStreetMap (API Overpass)** — <https://overpass-api.de/>
   Aporta nombres adicionales. La parroquia se determinó por **contención
   geométrica** del punto dentro del polígono oficial de cada parroquia.

### Reglas que se respetaron

- **No se inventó ningún nombre.** Todo elemento proviene de una de las fuentes citadas.
- **No se completó información faltante por conocimiento propio.**
- **No se dedujo ninguna categoría.** Si la fuente no dice si algo es barrio, sector o
  urbanización, va a *Otros* con la nota correspondiente.
- **No se infirió ninguna asociación parroquial.** IPOSTEL la declara; en OSM se
  calculó por geometría. Nunca por cercanía ni por parecido de nombre.
- **No se fusionaron duplicados.** «Los Pinos», «Los Pinos I» y «Los Pinos II» son
  entradas distintas. «Sector X» y «Barrio X» también.
- **Las discrepancias se conservan.** Cuando dos fuentes difieren, se guardan ambas
  variantes y la diferencia queda registrada en *Observaciones y discrepancias*.

### Cómo se etiqueta cada elemento

| Etiqueta | Significado |
|---|---|
| `[IPOSTEL]` | Solo en el listado oficial de zonas postales |
| `[OSM]` | Solo en OpenStreetMap |
| `[IPOSTEL + OSM]` | En ambas fuentes |
| `CP nnnn` | Código postal asignado por IPOSTEL |

### Categorías

Cada parroquia se subdivide en estas secciones, y **solo aparece la sección que tiene
contenido**:

`Barrios` · `Sectores` · `Urbanizaciones` · `Conjuntos residenciales` ·
`Parcelamientos` · `Caseríos` · `Pueblos` · `Comunidades` · `Localidades` ·
`Otros` · `Edificaciones identificadas individualmente`

---

## Validación

| # | Verificación | Resultado |
|---|---|---|
| 1 | Distrito Capital tiene exactamente 22 parroquias | ✅ 22 |
| 2 | Ninguna parroquia de Miranda quedó dentro del Distrito Capital | ✅ Las 22 provienen del listado UBIGEO `0101xx` del INE |
| 3 | Petare está en Miranda → Municipio Sucre → Parroquia Petare | ✅ UBIGEO `151901` |
| 4 | La Guaira está separada del Distrito Capital | ✅ Archivo y entidad independientes (UBIGEO `24`) |
| 5 | Municipio Vargas tiene 11 parroquias | ✅ 11, UBIGEO `240101`–`240111` |
| 6 | Nombres duplicados detectados | ✅ Listados por archivo, **sin fusionar** |
| 7 | Nombres presentes en varias parroquias | ✅ Sección propia en cada archivo |
| 8 | Repetidos no eliminados automáticamente | ✅ Se conservan todos |
| 9 | Información no confirmada identificada | ✅ Marcada en *Observaciones y discrepancias* |
| 10 | No se inventó información faltante | ✅ Los vacíos se declaran como vacíos |
| 11 | Maracaibo tiene 18 parroquias | ✅ INE `231301`–`231318` |
| 12 | San Francisco tiene 7 parroquias | ✅ INE `231701`–`231707` |
| 13 | Santa Rita tiene 4 parroquias | ✅ INE `231801`–`231804` |
| 14 | Cabimas tiene 9 parroquias | ✅ INE `230301`–`230309` |
| 15 | Zulia está separado de Caracas y de sus entidades | ✅ Directorio propio `zulia/` |

---

## Inconsistencias conocidas

Detalladas en la sección *Observaciones y discrepancias* de cada archivo. Las principales:

| Punto | Detalle |
|---|---|
| `Fila de Mariche` | Tres grafías: **Fila de Mariche** (INE) · **Fila de Mariches** (IPOSTEL) · **Filas de Mariche** (OSM) |
| `Caucagüita` | **Caucagüita** (INE) vs **Caucaguita** (IPOSTEL) |
| `La Candelaria` | **Candelaria** (INE, UBIGEO `010103`) vs **La Candelaria** (IPOSTEL y uso corriente) |
| `El Paraíso` | El INE lo escribe **«EL Paraíso»** (error tipográfico del documento) |
| Parroquia El Cafetal | No aparece en el listado de IPOSTEL para el municipio Baruta; su contenido proviene solo de OSM |
| Parroquia El Junko | IPOSTEL no registra ninguna zona postal en ella; su contenido proviene solo de OSM |
| `La Dolorita` | IPOSTEL registra un elemento bajo el municipio **El Hatillo**; el INE la ubica en el municipio **Sucre**. Ese registro **se excluyó** |
| `Cecilio Acosta` | IPOSTEL la ubica en el municipio **Carrizal**; el INE en **Bolivariano Guaicaipuro** |
| Ley del Distrito Capital | El DPT del INE cita la misma gaceta (N° 39.156) con dos fechas distintas: 2009 y 2013 |
| Ley DPT del estado Vargas | El INE cita «Gaceta Oficial del Estado Vargas N° 36.488», número con formato de Gaceta Oficial nacional |
| Distrito Metropolitano | Suprimido en 2017; existe una *Ley Especial que Restituye el Régimen del Distrito Metropolitano de Caracas* cuya vigencia efectiva **no pudo confirmarse** |
| `Luis Hurtado Higuera` (Zulia) | El INE la ubica en **Maracaibo**; IPOSTEL registra sus 42 zonas bajo **San Francisco**. Se siguió al INE. **Verificar antes de producción** |
| `José Domingo Rus` (Zulia) | Parroquia creada en 2006; IPOSTEL no la registra. Contenido solo de OSM |
| `Germán Ríos Linares` (Zulia) | OpenStreetMap no tiene su polígono; contenido solo de IPOSTEL |
| `José Cenovio/Cenobio Urribarri(í)` | Doble variante entre INE/IPOSTEL y OSM |

---

## Cobertura y límites

Lo que **no** está en estos archivos, y por qué:

- **Los 17 municipios restantes de Miranda.** Están listados en `miranda.md` con su
  capital y su número de parroquias, pero sin detalle sub-parroquial: quedan fuera del
  alcance metropolitano pedido.
- **Elementos que ninguna fuente documenta.** Si IPOSTEL no lo registra y OSM no lo
  mapea, no aparece. Este documento **no completa vacíos por inferencia**.
- **Elementos cuya categoría ninguna fuente declara.** Están presentes, bajo *Otros*,
  con su etiqueta original.

El **Otros** de OSM contiene sobre todo `place=neighbourhood`, `place=suburb` y
`landuse=residential`: son lugares reales y bien ubicados, pero OSM no distingue entre
barrio, sector y urbanización. Reclasificarlos requiere una fuente que sí lo declare.

- **Los 17 municipios restantes de Zulia.** Fuera del alcance pedido.

### OpenStreetMap cubre Zulia mucho peor que Caracas

| Área | Elementos nombrados en OSM |
|---|---:|
| Área metropolitana de Caracas | 2.635 |
| Maracaibo + San Francisco + Santa Rita + Cabimas | **431** |

En los archivos de Zulia **casi todo el contenido proviene de IPOSTEL**, así que el
contraste entre dos fuentes independientes es más débil. Ese vacío **no se compensó con
conocimiento propio**.

---

*Generado el 2026-08-22. Fuentes consultadas el 2026-08-22.*
