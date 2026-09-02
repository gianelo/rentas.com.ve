import { NextRequest } from "next/server";
import NextAuth, { customFetch } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildEmailProvider } from "./email-provider";

/**
 * **¿Qué deja escrito Auth.js en `emailVerified`, puerta por puerta?**
 * (tasks.md 19.14, y es la premisa entera de la 19.10.)
 *
 * La 19.10 da por verificado el correo propio con **el instante que Auth.js
 * dejó al entrar**, y sin ese instante cierra en falso: no escribe fila, la
 * ficha no dibuja nada y nadie se entera. O sea que el producto depende de un
 * hecho que vive adentro de una dependencia — y hasta hoy ese hecho estaba
 * anotado en el plan («`@auth/core` 0.41.3, `handle-login.js:70`, `:76` y
 * `:260`») y **no lo medía nada**. Una nota al pie que envejece en la primera
 * actualización, que es exactamente lo que el arnés vecino
 * (`magic-link-ida-y-vuelta.test.ts`) ya se negó a hacer.
 *
 * Así que se conduce la librería de verdad, con el mismo arnés: `handlers` es
 * lo que corre en `app/api/auth/[...nextauth]`, el proveedor de correo es el
 * nuestro, y se finge sólo lo que no participa de la pregunta — la base y el
 * envío. Lo que se afirma es lo que el **adaptador recibe**, que es lo único
 * que después llega a `user.emailVerified` en Postgres.
 */

const ORIGIN = "https://rentas.test";
const CORREO = "maria.f@gmail.com";

/** Los `handlers` reciben `NextRequest`, que es lo que Next les entrega. */
const pedido = (u: string, init?: RequestInit) => new NextRequest(u, init as never);

interface Escrito {
  readonly creados: AdapterUser[];
  readonly actualizados: Partial<AdapterUser>[];
}

/**
 * La puerta del enlace por correo, con el adaptador anotando en vez de
 * escribir. `cuentaExistente` elige cuál de las dos ramas de Auth.js corre:
 * con `null` crea la cuenta, y con una cuenta la actualiza.
 */
function puertaDelCorreo(cuentaExistente: AdapterUser | null) {
  const tokens = new Map<string, unknown>();
  const escrito: Escrito = { creados: [], actualizados: [] };
  const enviado: { url?: string } = {};

  const adapter = {
    createVerificationToken: async (token) => {
      tokens.set(token.token, token);
      return token;
    },
    useVerificationToken: async ({ token }) => {
      const guardado = tokens.get(token) ?? null;
      tokens.delete(token);
      return guardado as never;
    },
    getUserByEmail: async () => cuentaExistente,
    getUserByAccount: async () => null,
    createUser: async (user) => {
      escrito.creados.push(user as AdapterUser);
      return { ...user, id: "usuario-nuevo" };
    },
    updateUser: async (user) => {
      escrito.actualizados.push(user as Partial<AdapterUser>);
      return { ...(cuentaExistente as AdapterUser), ...user };
    },
    linkAccount: async (account) => account,
    createSession: async (session) => session,
  } as Adapter;

  const { handlers } = NextAuth({
    secret: "un-secreto-cualquiera-para-esta-prueba",
    trustHost: true,
    basePath: "/api/auth",
    session: { strategy: "database" },
    adapter,
    providers: [
      buildEmailProvider({
        readConfig: () => ({ apiKey: "clave", from: "hola@rentas.test" }),
        createMailer: () => ({
          async send(message) {
            enviado.url = /https?:\/\/\S+/.exec(message.body)?.[0];
          },
        }),
      }),
    ],
  });

  /** Pedir el enlace y canjearlo, que es el viaje completo del inquilino. */
  async function entrar(): Promise<void> {
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
        body: new URLSearchParams({ csrfToken, email: CORREO, callbackUrl: ORIGIN }),
      }),
    );

    expect(enviado.url, "el correo salió sin enlace").toBeDefined();
    await handlers.GET(pedido(enviado.url as string));
  }

  return { entrar, escrito };
}

/**
 * La puerta de OAuth, con un proveedor de mentira. La sesión de base de datos
 * obliga a un adaptador completo (`assertConfig` de Auth.js lo exige antes de
 * atender), y todo lo que no participa de la pregunta contesta vacío.
 */
function puertaOAuth() {
  const escrito: Escrito = { creados: [], actualizados: [] };

  const adapter = {
    // **Los dos del enlace por correo, que este proveedor no usa.** `hasEmail`
    // es una variable de MÓDULO en `@auth/core` 0.41.3 (`lib/utils/assert.js`)
    // y nadie la reinicia entre configuraciones: basta con que otra puerta de
    // este mismo proceso haya llevado un proveedor de correo para que
    // `assertConfig` se los exija también a ésta. Sin ellos la prueba pasa
    // sola y falla acompañada, que es la clase de dependencia de orden que no
    // se debe descubrir en CI.
    createVerificationToken: async (token) => token,
    useVerificationToken: async () => null,
    getUser: async () => null,
    getUserByEmail: async () => null,
    getUserByAccount: async () => null,
    getSessionAndUser: async () => null,
    updateSession: async (session) => session,
    deleteSession: async () => undefined,
    createUser: async (user) => {
      escrito.creados.push(user as AdapterUser);
      return { ...user, id: "usuario-nuevo" };
    },
    updateUser: async (user) => {
      escrito.actualizados.push(user as Partial<AdapterUser>);
      return user as AdapterUser;
    },
    linkAccount: async (account) => account,
    createSession: async (session) => session,
  } as Adapter;

  const { handlers } = NextAuth({
    secret: "un-secreto-cualquiera-para-esta-prueba",
    trustHost: true,
    basePath: "/api/auth",
    session: { strategy: "database" },
    adapter,
    providers: [
      {
        id: "proveedor-falso",
        name: "Proveedor falso",
        type: "oauth",
        clientId: "un-cliente",
        clientSecret: "un-secreto",
        // Sin `state` ni PKCE: lo que se conduce es la vuelta del proveedor,
        // no la ida, y las cookies de la ida no participan de la pregunta.
        checks: ["none"],
        authorization: { url: "https://proveedor.test/autorizar", params: { scope: "email" } },
        token: "https://proveedor.test/token",
        userinfo: "https://proveedor.test/perfil",
        profile: (perfil: Record<string, string>) => ({
          id: perfil.sub,
          name: perfil.name,
          email: perfil.email,
          // Más de lo que `toMinimalGoogleProfile` intenta siquiera.
          emailVerified: new Date(),
        }),
        [customFetch]: async (entrada: RequestInfo | URL) => {
          const url =
            typeof entrada === "string"
              ? entrada
              : entrada instanceof URL
                ? entrada.href
                : (entrada as Request).url;

          return Response.json(
            url.includes("/token")
              ? { access_token: "un-token", token_type: "bearer", expires_in: 3600 }
              : { sub: "proveedor-123", email: CORREO, name: "María F." },
          );
        },
      } as never,
    ],
  });

  /** La vuelta del proveedor con el código, que es donde Auth.js decide. */
  async function volverDelProveedor(): Promise<void> {
    await handlers.GET(pedido(`${ORIGIN}/api/auth/callback/proveedor-falso?code=un-codigo`));
  }

  return { volverDelProveedor, escrito };
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

describe("el instante que Auth.js deja al entrar (19.14)", () => {
  /**
   * **La mitad de la que hoy depende la 19.10.** Quien entra por enlace
   * mágico y publica con ese mismo correo queda verificado, y el instante que
   * se registra es éste. El día que una actualización de `@auth/core` deje de
   * escribirlo, esta prueba se pone roja — en vez de que la verificación se
   * apague en silencio, que es lo que pasaría hoy: sin instante no hay fila,
   * sin fila no hay frase, y nada falla.
   */
  it("crea la cuenta con la fecha puesta cuando el correo llega por primera vez", async () => {
    const puerta = puertaDelCorreo(null);

    await puerta.entrar();

    expect(puerta.escrito.creados).toHaveLength(1);
    expect(puerta.escrito.creados[0]?.email).toBe(CORREO);
    expect(puerta.escrito.creados[0]?.emailVerified).toBeInstanceOf(Date);
  });

  /**
   * **La otra rama del mismo camino**, y hacía falta afirmarla aparte: quien
   * ya tenía cuenta no pasa por `createUser`. Auth.js escribe la fecha
   * igual, y sobre la cuenta que ya existía.
   */
  it("le pone la fecha a la cuenta que ya existía, sin crear una segunda", async () => {
    const yaExistia = {
      id: "usuario-viejo",
      email: CORREO,
      emailVerified: null,
    } as unknown as AdapterUser;
    const puerta = puertaDelCorreo(yaExistia);

    await puerta.entrar();

    expect(puerta.escrito.creados).toEqual([]);
    expect(puerta.escrito.actualizados).toHaveLength(1);
    expect(puerta.escrito.actualizados[0]?.id).toBe("usuario-viejo");
    expect(puerta.escrito.actualizados[0]?.emailVerified).toBeInstanceOf(Date);
  });

  /**
   * **La otra puerta, y la asimetría que la 19.14 nombra.** El `null` de
   * OAuth no depende de Google: lo escribe a mano la rama genérica de
   * cualquier proveedor OAuth, así que un proveedor de mentira lo muestra
   * igual y sin JWKS, sin `id_token` y sin red — se cambia el `fetch` del
   * proveedor y nada más.
   *
   * **La `profile()` de acá es la más optimista posible**: devuelve el
   * instante ya puesto, que es más de lo que `toMinimalGoogleProfile` llega a
   * intentar. Si aun así llega `null` al adaptador, queda probado que **no
   * hay `profile()` que pueda ganarle**, que es exactamente la razón por la
   * que la 19.10 cierra en falso para quien entra por Google.
   */
  it("por OAuth la cuenta se crea con `null` aunque la `profile()` mande la fecha", async () => {
    const puerta = puertaOAuth();

    await puerta.volverDelProveedor();

    expect(puerta.escrito.creados).toHaveLength(1);
    // La pareja positiva: el correo del proveedor SÍ llega, así que lo que se
    // pierde por el camino es el instante y nada más.
    expect(puerta.escrito.creados[0]?.email).toBe(CORREO);
    expect(puerta.escrito.creados[0]?.emailVerified).toBeNull();
  });
});
