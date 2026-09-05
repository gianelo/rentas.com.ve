import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **Quién filtra el catálogo por la fecha de vencimiento, declarado (21.7).**
 *
 * La 21.7 dejó anotado que el predicado está escrito varias veces y que se
 * dejaba así a propósito: extraerlo a un ayudante compartido cruzaría el
 * límite entre capacidades que la arquitectura mantiene, y el predicado es de
 * una línea. Lo que faltaba no era la unificación —el fundador la descartó el
 * 2026-09-01 con el mismo criterio con el que dejó la excepción de la 21.4—,
 * era que **no había nada que se pusiera rojo** cuando apareciera uno más.
 *
 * Esta prueba es eso y nada más: no unifica, declara.
 *
 * **Por qué una prueba y no un comentario.** Los cinco archivos ya llevan el
 * suyo, y un comentario sólo lo lee quien abre ese archivo — el sexto lector
 * se escribe en un archivo nuevo, donde no hay comentario que leer. Es la
 * misma forma que `verified-contact.port.ts` eligió para la 19.11: el
 * comentario pasó de instrucción a advertencia porque la instrucción mandaba
 * la regla al lugar equivocado. Acá el problema es un escalón más arriba: no
 * hay dónde escribirla.
 *
 * **Y por qué una prueba que lee el código y no una de comportamiento.** Las
 * pruebas de integración de la 21.1 cubren los cinco lectores que EXISTEN;
 * ninguna puede ponerse roja por uno que todavía no se escribió. Peor:
 * `infrastructure/` no tiene piso de cobertura (`vitest.config.ts`), así que
 * un sexto adaptador se entrega sin una sola prueba y el informe no cambia de
 * color. Es el mismo hueco que la 19.11 nombró en su puerto.
 *
 * **Se afirma sobre el ÁRBOL y no sobre una lista de rutas**, por la razón que
 * `app/api/jobs/cron-wiring.test.ts` escribió el 2026-09-01: una lista hay que
 * acordarse de actualizarla, y acordarse es justo lo que falla. Acá la lista
 * escrita a mano está del lado ESPERADO, que es otra cosa: no es una segunda
 * fuente sobre el código —el código lo cuenta el recorrido—, es la decisión
 * del fundador puesta por escrito. Que las dos discrepen es exactamente el
 * evento que reabre la decisión, y por eso el desacuerdo tiene que doler.
 */

/** `src/` entero: un sexto lector no tiene por qué caer bajo `modules/`. */
const SRC = fileURLToPath(new URL(".", import.meta.url));

/** Cada fuente bajo `src/`, recorriendo el árbol. Las pruebas no cuentan. */
function sources(dir = ""): readonly string[] {
  return readdirSync(`${SRC}${dir}`, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) return sources(`${path}/`);
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

/**
 * El archivo sin sus comentarios, como en `app/inicio-contract.test.ts`.
 *
 * **No es cosmético: sin esto la cuenta da seis.** `drizzle-lifecycle.ts`
 * lleva escrito `expires_at > now()` dentro de su comentario, y lo lleva para
 * explicar por qué NO lo usa —es la excepción que la 21.4 confirmó: sumarlo
 * dejaría a `markExpired` sin una sola fila que actualizar—. Un barrido sobre
 * el texto crudo se quejaría justamente de la frase que documenta la regla.
 */
function code(path: string): string {
  return readFileSync(`${SRC}${path}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Las DOS formas en que se escribe «todavía vigente» contra la columna, y que
 * sean dos es la mitad del valor de esta prueba.
 *
 * Escrita con la primera sola, esta prueba decía CUATRO habiendo cinco: se
 * corrió así y salió roja señalando `drizzle-home-collections.ts`, que escribe
 * el predicado en SQL crudo adentro de una plantilla. Ningún renombre de
 * `expiresAt` lo toca y ninguna búsqueda del ayudante de Drizzle lo encuentra
 * — habría sido exactamente el verde que no mide nada.
 *
 * `expiresAt` y `expires_at` son la misma columna dicha en los dos idiomas que
 * este repositorio usa: el de `schema.ts` y el de Postgres.
 */
const DRIZZLE = /gt\(\s*listings\.expiresAt\s*,\s*sql`now\(\)`\s*\)/;
const SQL_CRUDO = /expires_at\s*>\s*now\(\)/;
const FORMAS: readonly RegExp[] = [DRIZZLE, SQL_CRUDO];

/** Los archivos que hoy filtran el catálogo por el reloj, contados del árbol. */
function lectores(): readonly string[] {
  return sources()
    .filter((path) => FORMAS.some((forma) => forma.test(code(path))))
    .sort();
}

/**
 * **La decisión del fundador, 2026-09-01: éstos y no más.**
 *
 * Cinco copias de una línea valen menos que el límite entre capacidades, que
 * es el mismo criterio con el que se dejó cerrada la zona. El día que esta
 * lista tenga que crecer, la decisión se reabre — no se agrega un renglón.
 *
 * **SEXTO LECTOR, 2026-09-02 (14.52), y esta prueba hizo exactamente lo que
 * existe para hacer: se puso roja sola.** `drizzle-active-zones.ts` es el
 * vocabulario acotado del inicio, y filtra por el reloj porque **su destino es
 * una búsqueda**: la sugerencia dice «9» y lleva a `/alquiler/<ciudad>/<zona>`,
 * que cuenta con ese mismo predicado. Sin el reloj, la portada ofrecería una
 * zona cuyos únicos avisos caducaron esta madrugada — la regla transversal 3
 * rota desde el único lugar donde nadie la mira.
 *
 * **No se unificó, y el criterio es el que el fundador ya fijó**: el ayudante
 * compartido cruzaría el límite entre capacidades —`listing-discovery` no
 * depende de `listing-search`, ni al revés— y el predicado sigue siendo de una
 * línea. Lo que cambia respecto de la anotación de arriba es sólo el número, y
 * queda dicho acá para que el séptimo vuelva a doler igual. **La decisión de si
 * seis ya son demasiadas es del fundador y este renglón no la toma**: la
 * reporta.
 *
 * **SÉPTIMO LECTOR, 2026-09-04 (17.5/17.7), y la misma razón que el sexto.**
 * `drizzle-search-vocabulary.ts` es la caja de búsqueda de zonas: con 5.796
 * zonas en el taxonomía, ofrecer una sin avisos manda a una pantalla sin
 * salida (regla transversal 4), y el orden por oferta (17.5) necesita el
 * mismo número. Filtra por el reloj por la misma razón que el sexto lector ya
 * dejó escrita — su destino es también una búsqueda, y esa búsqueda cuenta con
 * este mismo predicado — así que un reloj distinto acá sería la regla
 * transversal 3 rota desde la caja en vez de desde la portada.
 */
const DECLARADOS: readonly string[] = [
  "modules/contact-reveal/infrastructure/drizzle-contact-reveal.ts",
  "modules/listing-catalogue/infrastructure/drizzle-search-vocabulary.ts",
  "modules/listing-discovery/infrastructure/drizzle-active-zones.ts",
  "modules/listing-discovery/infrastructure/drizzle-home-collections.ts",
  "modules/listing-discovery/infrastructure/drizzle-sitemap.ts",
  "modules/listing-search/infrastructure/drizzle-faceted-search.ts",
  "modules/listing-search/infrastructure/drizzle-listing-search.ts",
];

/** El archivo que la 21.4 dejó afuera a propósito. */
const CICLO_DE_VIDA = "modules/listing-lifecycle/infrastructure/drizzle-lifecycle.ts";

describe("quién filtra el catálogo por la fecha de vencimiento (21.7)", () => {
  /**
   * El control de que lo de abajo mide algo. Si el recorrido se leyera vacío
   * —un `readdirSync` que cambia de forma, `src/` que se mueve— la afirmación
   * del inventario compararía dos listas vacías y pasaría por eso.
   */
  it("la guarda: el recorrido encuentra el árbol de src", () => {
    expect(sources().length).toBeGreaterThan(100);
    expect(sources()).toContain(CICLO_DE_VIDA);
  });

  /**
   * La contraparte obligatoria de la guarda de abajo: un despojador de
   * comentarios que se comiera el archivo entero dejaría el inventario vacío y
   * las dos afirmaciones siguientes pasarían sin haber leído una línea de
   * código.
   */
  it("la guarda: quitar los comentarios no se lleva el código", () => {
    const sitemap = code("modules/listing-discovery/infrastructure/drizzle-sitemap.ts");
    const inicio = code("modules/listing-discovery/infrastructure/drizzle-home-collections.ts");

    expect(DRIZZLE.test(sitemap)).toBe(true);
    expect(SQL_CRUDO.test(inicio)).toBe(true);
  });

  /**
   * **La excepción de la 21.4, y por qué queda afuera.** `markExpired` existe
   * para encontrar las filas cuyo rótulo quedó viejo; su comparación es al
   * revés (`lt`) y las otras tres de ese archivo acotan una ventana contra
   * fechas calculadas, no contra el reloj. Lo único que lo haría aparecer acá
   * es el `expires_at > now()` que su comentario escribe para explicar por qué
   * no lo usa — así que este archivo no entra POR el despojo de comentarios, y
   * eso se afirma en vez de suponerse.
   */
  it("el ciclo de vida no entra, y entra sólo si se leen los comentarios", () => {
    const crudo = readFileSync(`${SRC}${CICLO_DE_VIDA}`, "utf8");

    expect(SQL_CRUDO.test(crudo)).toBe(true);
    expect(FORMAS.some((forma) => forma.test(code(CICLO_DE_VIDA)))).toBe(false);
  });

  /**
   * **Las dos formas tienen lector vivo.** Un patrón que no acierta sobre
   * ningún byte real es un patrón que nadie sabe si todavía funciona: si esta
   * afirmación se pone roja porque el inicio pasó su SQL crudo a Drizzle, lo
   * que hay que decidir es si el patrón de SQL crudo se conserva, no borrarlo
   * de apuro — es la puerta por la que el sexto lector volvería a ser
   * invisible.
   */
  it("las dos formas del predicado están ejercidas por código vivo", () => {
    const porDrizzle = DECLARADOS.filter((path) => DRIZZLE.test(code(path)));
    const porSqlCrudo = DECLARADOS.filter((path) => SQL_CRUDO.test(code(path)));

    expect(porDrizzle.length).toBeGreaterThan(0);
    expect(porSqlCrudo).toEqual([
      "modules/listing-discovery/infrastructure/drizzle-home-collections.ts",
    ]);
  });

  it("son exactamente los declarados: un lector más reabre la decisión", () => {
    expect(lectores()).toEqual(DECLARADOS);
  });
});
