# Estado Zulia — municipios documentados

Parte de la base territorial de **rentas.com.ve**. Este directorio cubre **cuatro de
los 21 municipios** del estado Zulia, cada uno en su propio archivo.

| Archivo | Municipio | Capital | Parroquias | Elementos |
|---|---|---|---:|---:|
| [`maracaibo.md`](./maracaibo.md) | Maracaibo | Maracaibo | 18 | 1272 |
| [`san-francisco.md`](./san-francisco.md) | San Francisco | San Francisco | 7 | 165 |
| [`santa-rita.md`](./santa-rita.md) | Santa Rita | Santa Rita | 4 | 154 |
| [`cabimas.md`](./cabimas.md) | Cabimas | Cabimas | 9 | 152 |

---

## Jerarquía territorial

```
Venezuela
└── Estado Zulia                              (21 municipios · 110 parroquias)
    ├── Municipio Maracaibo                   → maracaibo.md
    │   └── 18 parroquias
    ├── Municipio San Francisco               → san-francisco.md
    │   └── 7 parroquias
    ├── Municipio Santa Rita                  → santa-rita.md
    │   └── 4 parroquias
    ├── Municipio Cabimas                     → cabimas.md
    │   └── 9 parroquias
    └── (17 municipios más, fuera de este alcance)
```

El modelo de datos es el mismo del resto del proyecto:

```
Estado (entidad federal)
  └── Municipio
        └── Parroquia
              └── Barrio | Sector | Urbanización | Conjunto residencial |
                  Parcelamiento | Localidad | Otro
```

---

## Geografía: qué está conurbado y qué no

Esto importa para la búsqueda por zona, porque «cerca» no es «lo mismo».

| Municipio | Ubicación | Relación con Maracaibo |
|---|---|---|
| **Maracaibo** | Orilla **occidental** del Lago | — |
| **San Francisco** | Orilla occidental, al sur de Maracaibo | **Conurbado**: la ciudad es continua |
| **Santa Rita** | Orilla **oriental** del Lago | Separado por el lago; se llega por el Puente Rafael Urdaneta |
| **Cabimas** | Orilla **oriental** (Costa Oriental del Lago) | ~40 km por carretera desde Maracaibo |

### Lo que hay que tener claro

- **Maracaibo ≠ estado Zulia.** El estado tiene 21 municipios; acá hay 4.
- **San Francisco ≠ parroquia de Maracaibo.** Es un municipio propio, separado de
  Maracaibo en 1995. La conurbación no los une administrativamente.
- **Cabimas y Santa Rita no son Maracaibo.** Están del otro lado del lago.
- **Municipio ≠ parroquia homónima.** Existen la parroquia *San Francisco* dentro del
  municipio San Francisco, y la parroquia *Santa Rita* dentro del municipio Santa Rita.
  Son niveles distintos.

---

## Resumen cuantitativo

| Categoría | Maracaibo | San Francisco | Santa Rita | Cabimas | Total |
|---|---:|---:|---:|---:|---:|
| Parroquias | 18 | 7 | 4 | 9 | **38** |
| | | | | | |
| Barrios | 535 | 44 | 33 | 36 | **648** |
| Sectores | 250 | 61 | 66 | 42 | **419** |
| Urbanizaciones | 173 | 26 | 19 | 32 | **250** |
| Conjuntos residenciales | 139 | 17 | 0 | 4 | **160** |
| Parcelamientos | 39 | 3 | 15 | 0 | **57** |
| Caseríos | 0 | 1 | 0 | 0 | **1** |
| Localidades | 5 | 0 | 3 | 5 | **13** |
| Otros / sin categoría confirmada | 122 | 13 | 18 | 33 | **186** |
| Edificaciones identificadas individualmente | 9 | 0 | 0 | 0 | **9** |
| **Total sub-parroquial** | **1272** | **165** | **154** | **152** | **1743** |

---

## Metodología

Idéntica a la del resto del proyecto — ver
[`../README.md`](../README.md#metodología).

1. **INE — DPT** define municipios, parroquias, capitales y códigos UBIGEO.
2. **IPOSTEL — Zonas Postales** aporta los nombres sub-parroquiales con la categoría y
   la parroquia que la propia fuente declara, más el código postal.
3. **OpenStreetMap** aporta nombres adicionales, con la parroquia determinada por
   **contención geométrica** contra el polígono oficial.

### Reglas que se respetaron

- **No se inventó ningún nombre.**
- **No se dedujo ninguna categoría.**
- **No se infirió ninguna asociación parroquial.**
- **No se fusionaron duplicados.**
- **Las discrepancias se conservan y se documentan.**

---

## Validación

| # | Verificación | Resultado |
|---|---|---|
| 1 | Maracaibo tiene 18 parroquias (INE `231301`–`231318`) | ✅ 18 |
| 2 | San Francisco tiene 7 parroquias (INE `231701`–`231707`) | ✅ 7 |
| 3 | Santa Rita tiene 4 parroquias (INE `231801`–`231804`) | ✅ 4 |
| 4 | Cabimas tiene 9 parroquias (INE `230301`–`230309`) | ✅ 9 |
| 5 | Ninguna parroquia quedó sin elementos | ✅ Las 38 tienen contenido |
| 6 | Nombres duplicados detectados | ✅ Listados por archivo, **sin fusionar** |
| 7 | Información no confirmada identificada | ✅ Marcada en *Observaciones* |
| 8 | No se inventó información faltante | ✅ Los vacíos se declaran como vacíos |

---

## Inconsistencias conocidas

| Punto | Detalle | Dónde |
|---|---|---|
| **Luis Hurtado Higuera** | El INE la ubica en **Maracaibo** (`231312`); IPOSTEL registra sus 42 zonas bajo **San Francisco**. Se siguió al INE. **La inconsistencia más seria de este directorio — verificar antes de producción.** | `maracaibo.md` |
| **José Domingo Rus** | Parroquia creada en 2006; IPOSTEL no registra ninguna zona postal en ella. Contenido solo de OSM. | `san-francisco.md` |
| **Germán Ríos Linares** | OpenStreetMap no tiene su polígono; no se pudo hacer join espacial. Contenido solo de IPOSTEL. | `cabimas.md` |
| **José Cenovio / Cenobio Urribarri(í)** | Doble variante: *Cenovio* (INE, IPOSTEL) vs *Cenobio* (OSM); *Urribarri* vs *Urribarrí*. | `santa-rita.md` |
| **Pedro Lucas Urribarri(í)** | *Urribarri* (INE, IPOSTEL) vs *Urribarrí* (OSM). | `santa-rita.md` |
| **Relación OSM del municipio Cabimas** | La relación `3447561` no genera área consultable en Overpass. Las parroquias se resolvieron por caja delimitadora y se verificaron contra el INE. | `cabimas.md` |

---

## Límite importante de cobertura

**OpenStreetMap está mucho menos desarrollado en Zulia que en Caracas.**

| Área | Elementos nombrados en OSM |
|---|---:|
| Área metropolitana de Caracas | 2.635 |
| Maracaibo + San Francisco + Santa Rita + Cabimas | **431** |

Consecuencia práctica: en estos cuatro archivos **casi todo el contenido proviene de
IPOSTEL**, y el contraste entre dos fuentes independientes es más débil que en los
archivos de Caracas. Ese vacío **no se compensó con conocimiento propio**: si una
fuente no lo documenta, no está acá.

---

*Generado el 2026-08-22. Fuentes consultadas el 2026-08-22.*
