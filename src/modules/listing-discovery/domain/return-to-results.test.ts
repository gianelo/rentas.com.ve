import { describe, expect, it } from "vitest";
import {
  RETURN_PARAM,
  resultsLink,
  safeResultsOrigin,
  withResultsOrigin,
} from "./return-to-results";

const PLACE = { cityName: "Distrito Capital", zoneName: "Chacao" };
const FICHA = "/alquiler/distrito-capital/chacao/apartamento-2-habitaciones-84512";

/** Lo que el navegador le entrega a la ficha: el valor ya decodificado. */
function readBack(listingHref: string): string | undefined {
  return new URL(listingHref, "https://rentas.com.ve").searchParams.get(RETURN_PARAM) ?? undefined;
}

describe("safeResultsOrigin", () => {
  /**
   * **Es entrada de quien envía, no un dato del servidor.** Este valor llega en
   * la query de la ficha, así que sin esta regla el «← Resultados» es un
   * redirector abierto: un enlace de rentas.com.ve que deja a quien lo toca en
   * cualquier parte. Ya pasó una vez en este proyecto, en la acción de revelar
   * el contacto, y lo caro no fue el salto — fue que el enlace se veía nuestro.
   */
  it("rechaza un destino que trae su propio origen", () => {
    expect(safeResultsOrigin("https://evil.test/alquiler/x/y")).toBeNull();
  });

  it("rechaza el destino sin esquema, que es el mismo ataque escrito más corto", () => {
    // `//evil.test/…` hereda el esquema de la página y sale igual del sitio.
    expect(safeResultsOrigin("//evil.test/alquiler/x/y")).toBeNull();
  });

  it("rechaza la barra invertida, que algunos navegadores normalizan a otro origen", () => {
    expect(safeResultsOrigin("/\\evil.test/alquiler")).toBeNull();
  });

  it("rechaza un esquema que no navega a ninguna parte", () => {
    expect(safeResultsOrigin("javascript:alert(1)")).toBeNull();
  });

  it("rechaza basura que ni siquiera parsea", () => {
    // Lanzar acá le daría una pantalla rota a alguien que sólo quería volver.
    expect(safeResultsOrigin("http://[")).toBeNull();
  });

  /**
   * **La lista blanca es de pantallas de resultados, no de rutas nuestras.**
   * Una ruta interna cualquiera pasa la comprobación de origen y sigue siendo
   * el destino equivocado: «← Resultados» tiene que llevar a resultados.
   */
  it("rechaza una ruta nuestra que no es una pantalla de resultados", () => {
    expect(safeResultsOrigin("/publicar")).toBeNull();
    expect(safeResultsOrigin("/signin?callbackUrl=/alquiler/x/y")).toBeNull();
    // `/alquilerX` empieza igual y no es lo mismo: la barra es parte del prefijo.
    expect(safeResultsOrigin("/alquilerx/y")).toBeNull();
  });

  it("acepta el inicio, que también dibuja avisos", () => {
    expect(safeResultsOrigin("/")).toBe("/");
  });

  it("acepta una zona y le conserva los filtros enteros", () => {
    // La razón de existir de la 16.9: volver a la zona pelada es perder la
    // búsqueda que alguien acababa de armar.
    expect(safeResultsOrigin("/alquiler/distrito-capital/chacao?min=200&max=400&hab=2")).toBe(
      "/alquiler/distrito-capital/chacao?min=200&max=400&hab=2",
    );
  });

  it("descarta el fragmento, que no es estado de búsqueda", () => {
    expect(safeResultsOrigin("/alquiler/distrito-capital/chacao?min=200#tarjeta-3")).toBe(
      "/alquiler/distrito-capital/chacao?min=200",
    );
  });

  it("cae en nulo cuando no hay parámetro o llega vacío", () => {
    expect(safeResultsOrigin(undefined)).toBeNull();
    expect(safeResultsOrigin("")).toBeNull();
    expect(safeResultsOrigin("   ")).toBeNull();
  });

  /**
   * El mismo parámetro puede llegar dos veces — lo arma quien envía, no
   * nosotros — y cuál gana es una decisión, no un detalle de la plantilla.
   * Gana el primero: es el que el enlace de ida escribió.
   */
  it("se queda con el primero cuando el parámetro llega repetido", () => {
    expect(safeResultsOrigin(["/alquiler/a/b", "https://evil.test"])).toBe("/alquiler/a/b");
    expect(safeResultsOrigin(["https://evil.test", "/alquiler/a/b"])).toBeNull();
    expect(safeResultsOrigin([])).toBeNull();
  });
});

describe("withResultsOrigin", () => {
  it("cuelga el origen de la ficha en el parámetro que la ficha lee", () => {
    const href = withResultsOrigin(FICHA, "/alquiler/distrito-capital/chacao?min=200");

    expect(readBack(href)).toBe("/alquiler/distrito-capital/chacao?min=200");
  });

  it("codifica el origen para que su query no se derrame en la de la ficha", () => {
    const href = withResultsOrigin(FICHA, "/alquiler/distrito-capital/chacao?min=200&max=400");

    // Sin codificar, `&max=400` sería un segundo parámetro de la ficha y el
    // destino llegaría cortado a la mitad.
    expect(href).toBe(
      `${FICHA}?${RETURN_PARAM}=%2Falquiler%2Fdistrito-capital%2Fchacao%3Fmin%3D200%26max%3D400`,
    );
  });

  it("devuelve la ruta intacta cuando no hay origen que llevar", () => {
    expect(withResultsOrigin(FICHA, undefined)).toBe(FICHA);
  });

  /**
   * **La invariante que ata al que emite con el que lee**, y existe porque ese
   * desacuerdo no rompe nada visible: la ficha se dibujaría igual, con el
   * enlace de vuelta apuntando al respaldo, y nadie vería un error.
   */
  it("nunca emite un origen que el lector vaya a rechazar", () => {
    const origenes = [
      "/",
      "/alquiler/distrito-capital/chacao",
      "/alquiler/distrito-capital/chacao?min=200&max=400&hab=2&pag=3",
      "/alquiler/distrito-capital/chacao?zona=altamira,los-palos-grandes",
    ];

    for (const origen of origenes) {
      expect(safeResultsOrigin(readBack(withResultsOrigin(FICHA, origen)))).toBe(origen);
    }
  });

  it("no cuelga un origen que el lector rechazaría", () => {
    // La ficha nunca publica un enlace que ella misma va a descartar.
    expect(withResultsOrigin(FICHA, "https://evil.test/alquiler/x")).toBe(FICHA);
  });
});

describe("resultsLink", () => {
  it("vuelve al origen con los filtros intactos, y lo dice", () => {
    const link = resultsLink("/alquiler/distrito-capital/chacao?min=200&hab=2", PLACE);

    expect(link).toEqual({
      href: "/alquiler/distrito-capital/chacao?min=200&hab=2",
      label: "← Resultados",
    });
  });

  /**
   * **El respaldo, que es la mitad del defecto que el fundador encontró.**
   * Quien entra desde el inicio o desde Google nunca estuvo en una pantalla de
   * resultados, y una flecha «← Resultados» le promete volver a un lugar donde
   * no estuvo. El destino honesto es la zona del propio aviso — existe, y es
   * donde sigue buscando quien llegó buscando acá —, y el texto no puede decir
   * «volver».
   */
  it("sin origen ofrece la zona del aviso y no promete una vuelta", () => {
    const link = resultsLink(undefined, PLACE);

    expect(link.href).toBe("/alquiler/distrito-capital/chacao");
    expect(link.label).toBe("Ver avisos en Chacao");
    expect(link.label).not.toContain("←");
  });

  it("el respaldo se escribe con la misma slugify que arma la ruta del aviso", () => {
    // Si esta ruta se armara a mano, un acento o una mayúscula la mandaría a un
    // 404 — y sería el enlace de salida de la pantalla más visitada del sitio.
    expect(
      resultsLink(undefined, { cityName: "Distrito Capital", zoneName: "Los Palos Grandes" }),
    ).toMatchObject({ href: "/alquiler/distrito-capital/los-palos-grandes" });
  });

  it("un destino inseguro cae en el respaldo, nunca en el destino", () => {
    expect(resultsLink("https://evil.test/alquiler/x/y", PLACE).href).toBe(
      "/alquiler/distrito-capital/chacao",
    );
  });
});
