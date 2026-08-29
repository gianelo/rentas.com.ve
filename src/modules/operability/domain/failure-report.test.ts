import { describe, expect, it } from "vitest";
import {
  ERROR_SCREEN_EXIT,
  failureLogLine,
  failureReference,
  NOT_FOUND_SCREEN,
  resolveErrorScreen,
} from "./failure-report";

/**
 * **Las dos mitades de un mismo fallo: la que ve el visitante y la que
 * buscamos nosotros** (tareas 11b.2 y 11b.4).
 *
 * Están en un archivo porque son una sola decisión de producto con una
 * consecuencia de privacidad: qué puede aparecer en una pantalla y qué puede
 * aparecer en un registro. Y el **digest las une** — es lo único que el
 * visitante puede citarnos y lo único con lo que encontramos su línea.
 */
describe("failureReference", () => {
  it("devuelve el digest que Next generó, tal cual", () => {
    expect(failureReference("3f5d1a9c2b")).toBe("3f5d1a9c2b");
  });

  it("devuelve null cuando no hay digest", () => {
    expect(failureReference(undefined)).toBeNull();
  });

  /**
   * **La guarda que importa, y no es cosmética.** `error.digest` es una cadena
   * que llega del servidor, y esta función es lo único entre ella y el
   * documento HTML. Un digest de Next es hexadecimal; cualquier otra cosa es
   * algo que alguien puso ahí — el mensaje del error, una ruta, un token — y
   * dibujarlo sería filtrar por la puerta que abrimos para ayudar.
   */
  it("rechaza cualquier cosa que no sea un digest de Next", () => {
    expect(failureReference("Error: connect ECONNREFUSED 10.0.0.4:5432")).toBeNull();
    expect(failureReference("sk_live_9c2b3f5d1a")).toBeNull();
    expect(failureReference("")).toBeNull();
  });
});

describe("failureLogLine", () => {
  const base = { boundary: "render", route: "/alquiler/[ciudad]/[zona]" } as const;

  it("escribe UNA sola línea de JSON, sin saltos", () => {
    const line = failureLogLine({ ...base, digest: "3f5d1a9c", cause: new Error("boom") });

    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toStrictEqual({
      level: "error",
      event: "failure",
      boundary: "render",
      route: "/alquiler/[ciudad]/[zona]",
      digest: "3f5d1a9c",
      cause: "Error: boom",
    });
  });

  /**
   * **El digest es la juntura, y se prueba como tal.** Un visitante que nos
   * cita un código tiene que llevarnos a UNA línea. Si la pantalla y el
   * registro decidieran por separado qué código es válido, el día que una de
   * las dos cambie el visitante citaría algo que no existe en ningún log.
   */
  it("lleva EXACTAMENTE el mismo código que la pantalla le mostró al visitante", () => {
    const digest = "9c2b3f5d1a";
    const line = JSON.parse(failureLogLine({ ...base, digest, cause: new Error("boom") }));

    expect(line.digest).toBe(resolveErrorScreen(digest).reference);
    expect(line.digest).not.toBeNull();
  });

  it("escribe digest: null cuando no hubo digest, en vez de omitir la clave", () => {
    const line = JSON.parse(failureLogLine({ ...base, cause: new Error("boom") }));

    expect(line).toHaveProperty("digest", null);
  });

  it("anota como desconocida una frontera que no es de las cuatro de Next", () => {
    const line = JSON.parse(
      failureLogLine({ ...base, boundary: "server-island", cause: new Error("boom") }),
    );

    expect(line.boundary).toBe("desconocido");
  });

  it("guarda la ruta sin su cadena de consulta ni su ancla", () => {
    const line = JSON.parse(
      failureLogLine({
        ...base,
        route: "/alquiler/maracaibo?q=casa+de+ana&tel=04141234567#foto",
        cause: new Error("boom"),
      }),
    );

    expect(line.route).toBe("/alquiler/maracaibo");
  });

  /**
   * **La pila no se escribe, y no es por tamaño.** Una traza lleva rutas de
   * archivo, argumentos y, en este producto, el valor de contacto que el caso
   * de uso acababa de leer. El mensaje alcanza para buscar y alertar.
   */
  it("no escribe la pila del error", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at revealContact (/var/task/secreto.js:1:1)";

    expect(failureLogLine({ ...base, cause: error })).not.toContain("secreto.js");
  });

  it("tapa el correo y el teléfono que un mensaje de error haya arrastrado", () => {
    const line = JSON.parse(
      failureLogLine({
        ...base,
        cause: new Error("no pude escribirle a ana@correo.com ni al 04141234567"),
      }),
    );

    expect(line.cause).toBe("Error: no pude escribirle a [oculto] ni al [oculto]");
  });

  /**
   * **Falla cerrado**: lo que se lanzó no siempre es un `Error`. Un
   * `throw { token }` serializado entero pondría el token en el registro, así
   * que de un valor que no es `Error` sólo se anota QUÉ era.
   */
  it("de un valor lanzado que no es Error anota su tipo y nunca su contenido", () => {
    const line = JSON.parse(
      failureLogLine({ ...base, cause: { token: "sk_live_9c2b", phone: "04141234567" } }),
    );

    expect(line.cause).toBe("valor lanzado que no es Error (object)");
  });

  /**
   * La forma es cerrada a propósito: quien llame con un objeto más ancho —una
   * cabecera, un cuerpo de petición— no consigue que llegue al registro.
   */
  it("no deja pasar ninguna clave que no sea de las seis", () => {
    const line = JSON.parse(
      failureLogLine({
        ...base,
        cause: new Error("boom"),
        ...({ cookie: "session=abc", body: { whatsapp: "04141234567" } } as object),
      }),
    );

    expect(Object.keys(line)).toStrictEqual([
      "level",
      "event",
      "boundary",
      "route",
      "digest",
      "cause",
    ]);
  });

  it("corta un mensaje largo en vez de escupir un párrafo por línea", () => {
    const line = JSON.parse(failureLogLine({ ...base, cause: new Error("x".repeat(500)) }));

    expect(line.cause).toHaveLength(200);
    expect(line.cause.endsWith("…")).toBe(true);
  });
});

describe("las pantallas del fallo", () => {
  /**
   * **El criterio permanente del fundador: ninguna pantalla termina en un
   * vacío sin salida.** Se prueba sobre las dos a la vez para que la tercera
   * que alguien agregue tenga que entrar acá.
   */
  it.each([
    ["error", resolveErrorScreen("3f5d1a9c")],
    ["no encontrado", NOT_FOUND_SCREEN],
  ])("la pantalla de %s ofrece una salida con destino y etiqueta", (_name, screen) => {
    expect(screen.exit.href).toBe("/");
    expect(screen.exit.label.trim()).not.toBe("");
    expect(screen.heading.trim()).not.toBe("");
    expect(screen.body.trim()).not.toBe("");
  });

  it("la pantalla de error muestra el código para que el visitante pueda citarlo", () => {
    expect(resolveErrorScreen("3f5d1a9c").reference).toBe("3f5d1a9c");
  });

  it("sin digest la pantalla de error no promete un código que nadie podría buscar", () => {
    expect(resolveErrorScreen(undefined).reference).toBeNull();
  });

  /**
   * **No se dice si el aviso venció, si lo ocultaron o si nunca existió**
   * (tarea 16.20): las tres respuestas son la misma, porque distinguirlas le
   * entrega a quien sondea direcciones el dato exacto que le falta.
   */
  it("la pantalla de no encontrado no distingue vencido, oculto ni inexistente", () => {
    const dicho = `${NOT_FOUND_SCREEN.heading} ${NOT_FOUND_SCREEN.body}`.toLowerCase();

    expect(dicho).not.toContain("vencid");
    expect(dicho).not.toContain("oculto");
    expect(dicho).not.toContain("eliminad");
    expect(NOT_FOUND_SCREEN.reference).toBeNull();
  });

  it("la salida es la misma constante en las dos, y no dos literales que pueden discrepar", () => {
    expect(resolveErrorScreen(undefined).exit).toBe(ERROR_SCREEN_EXIT);
    expect(NOT_FOUND_SCREEN.exit).toBe(ERROR_SCREEN_EXIT);
  });
});
