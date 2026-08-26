import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_CITY_PARAM } from "@/modules/listing-discovery/domain/home-collections";

/**
 * **Lo que el dominio decide y la página tiene que obedecer, atado.**
 *
 * Existe por la misma razón que `indexing-contract.test.ts` y atrapa un defecto
 * de la misma forma: no falla el render de ninguno de los dos lados, falla que
 * la página **use** lo que el dominio resolvió. `home-collections.test.ts`
 * prueba que con una ciudad elegida las tres colecciones quedan atadas a ella;
 * nada de eso vale si esta página nunca le pasa la ciudad.
 *
 * Ése es exactamente el hueco que el suelo de cobertura deja abierto: llega a
 * `domain/` y no llega a `app/`. Se comprueba leyendo el archivo y no
 * renderizando, a propósito — lo que hay que verificar es una relación entre
 * dos archivos, no el comportamiento de uno.
 */
const PAGE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

/**
 * El archivo sin sus comentarios.
 *
 * Los comentarios de esta página **nombran** las reglas que no viven en ella —
 * «acá no hay un `.filter()`» está escrito ahí — y una comprobación que mirara
 * el texto crudo se quejaría justamente de la frase que documenta la regla.
 */
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("el inicio y el dominio que lo decide", () => {
  it("la guarda: el archivo que se está midiendo es el inicio", () => {
    // Sin esto, un `page.tsx` movido de lugar dejaría a toda la suite midiendo
    // una cadena vacía y pasando por eso — la peor forma de verde.
    expect(PAGE).toContain("export default async function InicioPage");
  });

  /**
   * **El aislamiento de ciudad depende de esta línea.** Con `homeCollections`
   * llamada sin la ciudad elegida, las colecciones vuelven a cruzar el catálogo
   * y la portada de alguien que dijo Maracaibo muestra avisos de Distrito
   * Capital — con todas las pruebas del dominio en verde, porque el dominio
   * estaría haciendo bien lo que nadie le pidió.
   */
  it("le pasa la ciudad elegida a las colecciones", () => {
    expect(PAGE).toMatch(/homeCollections\(\s*cities\s*,\s*selectedCity/);
  });

  it("resuelve la ciudad con el dominio y no comparándola acá", () => {
    expect(PAGE).toContain("resolveHomeCity(cities,");
  });

  /**
   * El nombre del parámetro se lee del dominio. Escrito a mano acá serían dos
   * copias: la ficha compone `/?ciudad=…` con la constante y la página leería
   * otra cosa, y elegir una ciudad no haría nada visible.
   */
  it("lee el parámetro por su constante, no por su texto", () => {
    expect(PAGE).toContain("query[HOME_CITY_PARAM]");
    expect(PAGE).not.toMatch(/query\.ciudad|query\["ciudad"\]/);
    // Y la constante es la que la ficha usa para componer el enlace.
    expect(HOME_CITY_PARAM).toBe("ciudad");
  });

  /**
   * **La barra va SIEMPRE, y esto es la corrección de un error de lectura.** El
   * texto de la F1 sólo la menciona describiendo el inicio sin ningún aviso, y
   * de ahí salió una barra que aparecía únicamente en ese estado. La lámina la
   * dibuja arriba de todo, con las cuatro tiras debajo.
   */
  it("dibuja la barra antes de decidir si hay oferta que mostrar", () => {
    // El sujeto cambió de pieza —`SearchBar` pasó a ser la pastilla dentro del
    // `Nav` (14g)— y la regla no: la búsqueda va arriba de todo y no depende
    // de que haya avisos. Se actualiza a qué mira, nunca qué exige.
    const bar = PAGE.indexOf("<Nav");
    const invite = PAGE.indexOf("home.invitesToPublish");

    expect(bar).toBeGreaterThan(-1);
    expect(invite).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(invite);
  });

  /**
   * **El mecanismo de búsqueda no puede cambiar al cambiar la pieza que lo
   * dibuja, y ésta es la comprobación que lo ata.**
   *
   * El buscador del inicio es un `<form method="get">` que vuelve a `/` con
   * `?q=`, y el servidor traduce con `resolveSearchDestination` y redirige
   * (14.20). La pastilla es otro `<form method="get">` — el mecanismo
   * sobrevive **sólo si se alimenta del mismo `homeSearchForm`**. Una pastilla
   * con un `action` o un `name` escritos a mano acá se dibujaría igual y
   * dejaría el buscador del inicio muerto, sin poner roja ninguna prueba del
   * dominio.
   */
  it("arma la pastilla con el MISMO formulario que el servidor traduce", () => {
    expect(PAGE).toMatch(/homeSearchForm\(typed\)/);
    expect(PAGE).toMatch(/action:\s*searchForm\.action/);
    expect(PAGE).toMatch(/name:\s*searchForm\.name/);
    expect(PAGE).toMatch(/submitLabel:\s*searchForm\.submitLabel/);
    // Ni el destino ni el nombre del parámetro escritos a mano: son contrato
    // de la URL y viven en `search-destination.ts`.
    expect(CODE).not.toMatch(/action:\s*["'`]/);
    expect(CODE).not.toMatch(/name:\s*["'`]q["'`]/);
  });

  /**
   * **La rama de `choices` y la de «no entendí» son del buscador, no del nav**,
   * y este trabajo no las toca. Si desaparecieran, escribir algo ambiguo en el
   * inicio dejaría de contestar nada.
   */
  it("sigue dibujando las opciones y el «no entendí» del buscador", () => {
    expect(PAGE).toContain('searched.kind === "choices"');
    expect(PAGE).toContain("noMatchMessage(typed)");
  });

  /**
   * **El nav no decide nada acá.** Qué estado tiene la barra sale de
   * `resolveNavAccount`/`resolveNavPublish` (identity/domain), con el suelo de
   * cobertura del 90 % encima. Un `if` acá sería una regla que ninguna corrida
   * de tests puede poner en rojo.
   */
  it("resuelve el estado del nav en el dominio y no en la página", () => {
    expect(PAGE).toContain("resolveNavAccount(");
    expect(PAGE).toContain("resolveNavPublish(");
  });

  /**
   * **El visitante anónimo no paga una consulta de más, y es medible.**
   *
   * `/` es la dirección más pedida del sitio y casi todo su tráfico llega sin
   * sesión. Auth.js está en estrategia `database`, así que una lectura de
   * sesión CON cookie es un viaje a Postgres — pero sin cookie `auth()`
   * devuelve `null` sin tocar la base (`@auth/core/lib/actions/session.js`:
   * `if (!sessionToken) return response`). Lo que sí sería una consulta segura
   * es el adaptador de cartera que `/mis-avisos` usa para `canImportListings`:
   * acá no se llama, porque la barra no lo mira y el menú de cuenta todavía no
   * ofrece "Importar cartera".
   */
  it("no consulta la cartera del importador en el camino de lectura", () => {
    expect(PAGE).not.toContain("BulkImportAccounts");
    expect(PAGE).not.toContain("bulk-import");
  });

  it("dibuja las fichas de ciudad antes de las tiras", () => {
    expect(PAGE.indexOf("cityChips.map")).toBeLessThan(PAGE.indexOf("home.strips.map"));
  });

  it("pasa el subtítulo tal como llega, sin componerlo", () => {
    expect(PAGE).toContain("subtitle={strip.subtitle}");
  });

  /**
   * **Ni una regla de producto en la página, que es la regla permanente del
   * fundador.** Un `.filter()` acá sería un criterio de negocio fuera del
   * alcance del suelo de cobertura; el único aceptable es el que no existe.
   */
  it("no filtra y no escribe un umbral", () => {
    expect(CODE).not.toMatch(/\.filter\(/);
    // Un número distinto de cero en una comparación es un umbral en el frente.
    // Comparar contra cero no lo es: «esta lista vino vacía» no es un criterio
    // de producto, y es el mismo giro que la página de ciudad ya usa.
    expect(CODE).not.toMatch(/[<>]=?\s*[1-9]/);
  });
});
