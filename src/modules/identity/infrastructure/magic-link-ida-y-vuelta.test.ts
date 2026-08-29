import { NextRequest } from "next/server";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildEmailProvider } from "./email-provider";
import { signInRedirect } from "./redirect-callback";

/**
 * **¿El destino sobrevive el viaje por el correo?** (tasks.md 15.10, F19).
 *
 * Es la única pregunta de la F19 que no se contesta leyendo nuestro código. El
 * `callbackUrl` lo ponen las puertas en la primera petición; el enlace se abre
 * después **en otra pestaña y muchas veces en otro aparato** —en escritorio es
 * el caso normal y la lámina 9c lo dice con todas las letras—, así que lo que
 * hubiera guardado el destino en una cookie de aquel navegador ya no está.
 *
 * **Se conduce la librería de verdad.** `handlers.POST` es lo que corre en
 * `app/api/auth/[...nextauth]` y el proveedor es el nuestro; se finge sólo lo
 * que no participa de la pregunta —la base y el envío—. Afirmarlo leyendo el
 * fuente de `@auth/core` sería una nota al pie que envejece en la primera
 * actualización. Queda probado que **el destino viaja adentro del enlace**.
 */

const ORIGIN = "https://rentas.test";

/** Los `handlers` reciben `NextRequest`, que es lo que Next les entrega. */
const pedido = (u: string, init?: RequestInit) => new NextRequest(u, init as never);
const FICHA = "/alquiler/distrito-capital/chacao/apartamento-2h-abc123";

/** Sólo lo que este camino toca: pedir el enlace y después canjearlo. */
function verificationTokenStore(): Adapter {
  const tokens = new Map<string, unknown>();

  return {
    createVerificationToken: async (token) => {
      tokens.set(token.token, token);
      return token;
    },
    useVerificationToken: async ({ token }) => {
      const guardado = tokens.get(token) ?? null;
      tokens.delete(token);
      return guardado as never;
    },
    getUserByEmail: async () => null,
    getUserByAccount: async () => null,
    createUser: async (user) => ({ ...user, id: "usuario-de-prueba" }),
    linkAccount: async (account) => account,
    createSession: async (session) => session,
  } as Adapter;
}

/**
 * Un `NextAuth` armado acá y no el de `auth.ts`, porque aquél importa `db`, que
 * exige `DATABASE_URL`. Que `auth.ts` la instale lo afirma el archivo vecino.
 */
function puerta({ conLaRegla = true } = {}) {
  const enviado: { url?: string } = {};
  const { handlers } = NextAuth({
    // La regla del producto se puede apagar acá para poder afirmar, en el mismo
    // arnés, qué hace la librería sin ella. Producción siempre la lleva.
    callbacks: conLaRegla ? { redirect: signInRedirect } : {},
    secret: "un-secreto-cualquiera-para-esta-prueba",
    trustHost: true,
    basePath: "/api/auth",
    session: { strategy: "database" },
    adapter: verificationTokenStore(),
    providers: [
      buildEmailProvider({
        readConfig: () => ({ apiKey: "clave", from: "hola@rentas.test" }),
        createMailer: () => ({
          async send(message) {
            // Se lee del cuerpo redactado, no de un parámetro interceptado: si
            // el correo dejara de llevar el enlace, esto se queda sin nada.
            enviado.url = /https?:\/\/\S+/.exec(message.body)?.[0];
          },
        }),
      }),
    ],
  });

  /** Pide el enlace como lo pediría el formulario, y devuelve lo que se envió. */
  async function pedirEnlace(destino: string): Promise<string> {
    const csrf = await handlers.GET(pedido(`${ORIGIN}/api/auth/csrf`));
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };

    await handlers.POST(
      pedido(`${ORIGIN}/api/auth/signin/email`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: csrf.headers.getSetCookie().join("; "),
          origin: ORIGIN,
        },
        body: new URLSearchParams({ csrfToken, email: "maria.f@gmail.com", callbackUrl: destino }),
      }),
    );

    expect(enviado.url, "el correo salió sin enlace").toBeDefined();
    return enviado.url as string;
  }

  return { handlers, pedirEnlace };
}

let entorno: Record<string, string | undefined>;

beforeAll(() => {
  entorno = { AUTH_URL: process.env.AUTH_URL, NEXTAUTH_URL: process.env.NEXTAUTH_URL };
  // Sin esto `next-auth` reescribe la petición contra un `NextRequest`, que
  // acá no existe. El origen sale del propio pedido, que es lo que se quiere.
  delete process.env.AUTH_URL;
  delete process.env.NEXTAUTH_URL;
});

afterAll(() => {
  for (const [clave, valor] of Object.entries(entorno)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

describe("el enlace por correo lleva el destino adentro (F19)", () => {
  it("el enlace que se envía carga la ficha de la que salió", async () => {
    const enlace = await puerta().pedirEnlace(`${ORIGIN}${FICHA}`);

    // Sobre el destino y no sobre la forma del enlace: importa que la ficha
    // viaje adentro y no en una cookie.
    expect(new URL(enlace).searchParams.get("callbackUrl")).toBe(`${ORIGIN}${FICHA}`);
  });

  it("abierto en otro navegador, sin una sola cookie nuestra, vuelve a la ficha", async () => {
    // El mismo servidor —el enlace se canjea contra la misma fila que se
    // creó—, pero otro navegador: lo que no viaja son las cookies.
    const servidor = puerta();
    const enlace = await servidor.pedirEnlace(`${ORIGIN}${FICHA}`);

    // **Otro aparato.** Ni cookie de sesión, ni de CSRF, ni de callback: todo
    // lo que tiene el teléfono donde se leyó un correo pedido en la computadora.
    const vuelta = await servidor.handlers.GET(pedido(enlace));

    expect(vuelta.headers.get("location")).toBe(`${ORIGIN}${FICHA}`);
  });

  /**
   * **El par que demuestra por qué la regla del producto existe.** Auth.js
   * frena sola lo de otro origen; lo que no frena es un destino interno
   * cualquiera —el inicio, `/terminos`—, porque para ella todos valen igual.
   * Una mitad sola no afirma nada: la primera se leería como «la librería es
   * insegura», que es falso, y la segunda como «la regla no hace falta», que es
   * lo que la F19 desmiente.
   */
  it("sin la regla del producto, la librería conserva cualquier ruta interna", async () => {
    const enlace = await puerta({ conLaRegla: false }).pedirEnlace(`${ORIGIN}/terminos`);

    expect(new URL(enlace).searchParams.get("callbackUrl")).toBe(`${ORIGIN}/terminos`);
  });

  it("con la regla, esa misma ruta no llega al correo: no es una puerta", async () => {
    const enlace = await puerta().pedirEnlace(`${ORIGIN}/terminos`);

    expect(new URL(enlace).searchParams.get("callbackUrl")).toBe(ORIGIN);
  });
});
