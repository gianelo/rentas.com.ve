import { expect, test } from "@playwright/test";

/**
 * El enlace de renovación en un navegador de verdad (tasks.md 7.12).
 *
 * **Lo que esta capa agrega, y lo que deliberadamente NO cubre.**
 *
 * La tarea pedía el encadenado entero: trabajo de recordatorios → enlace →
 * renovación. Correr el trabajo acá significaría, desde que entró el adaptador
 * de Resend (7.11), **mandar correos reales en cada corrida de CI** a las
 * direcciones que haya sembradas. Eso no es una prueba, es un emisor
 * programado. La mitad de trabajo→correo queda donde se puede probar de forma
 * determinista y sin red: `send-lifecycle-notices.test.ts` y
 * `tests/integration/lifecycle.test.ts`.
 *
 * Lo que sólo un navegador puede afirmar es esto: que un enlace firmado que
 * llega por correo, abierto como lo abre una persona, **no renueva nada por el
 * hecho de abrirse** y no se indexa.
 *
 * **Corre en todas partes, sin base de datos y sin `test.skip`.** Un token
 * inválido se rechaza por la firma antes de leer el aviso
 * (`renew-listing.test.ts`: "un token inválido no llega ni a leer el aviso"),
 * así que el camino entero se recorre contra el build local que apunta a una
 * base irrutable — que es justamente el modo en que corre CI cuando no hay
 * secreto de bypass.
 */

/** Ni firmado ni con forma de token. Es lo que manda quien prueba suerte. */
const GARBAGE = "no-es-un-token";

/**
 * Con forma de token y firma inventada: tres segmentos plausibles. Separa
 * "no parsea" de "parsea y la firma no cierra", que son dos caminos distintos
 * del dominio y las dos tienen que terminar igual acá.
 */
const FORGED = `${Buffer.from('{"listingId":"listing-1","cycle":1}').toString("base64url")}.v1.firma-inventada`;

/**
 * La confirmación es el ÚNICO lugar del que sale una renovación: un
 * `<form method="post">`. Si aparece con un token que no sirve, el enlace
 * está ofreciendo renovar algo que no puede verificar.
 */
function offersRenewal(html: string): boolean {
  return /<form[^>]*method=["']?post/i.test(html);
}

for (const [nombre, token] of [
  ["un token que ni siquiera parsea", GARBAGE],
  ["un token con forma correcta y firma inventada", FORGED],
] as const) {
  test(`${nombre} nunca ofrece renovar`, async ({ page }) => {
    const response = await page.goto(`/renovar/${token}`);
    const html = await page.content();

    // La afirmación que vale en cualquier configuración: no hay 200 y no hay
    // formulario. Vale incluso si al despliegue le falta el secreto y contesta
    // 500 — lo que no puede pasar NUNCA es que ofrezca renovar.
    expect(response?.status()).not.toBe(200);
    expect(offersRenewal(html)).toBe(false);

    // Un 500 es "a este despliegue le falta RENEWAL_TOKEN_SECRET", no un
    // defecto del enlace. Se dice en vez de afirmar de menos en silencio.
    test.skip(
      response?.status() === 500,
      "el despliegue no tiene secreto de renovación: sólo se pudo probar que falla cerrado",
    );

    expect(response?.status()).toBe(400);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Enlace no válido");
  });
}

/**
 * **La URL lleva un token firmado adentro.** Indexada, el enlace de
 * renovación de alguien queda en un buscador — y con él la capacidad de
 * renovar su aviso. La etiqueta se dibuja en las tres respuestas, no sólo en
 * la buena, porque la que más circula es la del error.
 */
test("el enlace no se indexa", async ({ page }) => {
  await page.goto(`/renovar/${GARBAGE}`);

  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
  await expect(robots).toHaveAttribute("content", /nofollow/);
});

/**
 * **Abrir no es renovar, y esto es lo que la separación existe para impedir.**
 *
 * Un enlace de correo lo abre el antivirus del proveedor, el previsualizador
 * de WhatsApp y el prefetch del navegador — todos con `GET` y sin que nadie
 * haya hecho clic. Se comprueba con un pedido crudo, sin navegador, porque así
 * es exactamente como llegan esos tres.
 */
test("un GET no renueva ni quema el token", async ({ request }) => {
  const first = await request.get(`/renovar/${FORGED}`);
  const second = await request.get(`/renovar/${FORGED}`);

  // Dos aperturas seguidas dan lo mismo: si la primera hubiera consumido algo,
  // la segunda contestaría distinto — "ya se usó" en vez del mismo rechazo.
  expect(second.status()).toBe(first.status());
  expect(offersRenewal(await second.text())).toBe(false);
});

/* ------------------------------------------------------------------ *
 * El camino feliz (7.12), que hasta la 11.22 no se podía recorrer.
 * ------------------------------------------------------------------ */

/**
 * **Por qué esta mitad estaba abierta y por qué ya no.**
 *
 * Renovar de verdad exige tres cosas que este archivo no tenía: un aviso que
 * exista en una base alcanzable, el `expires_at` exacto que ese aviso lleva
 * hoy —porque es la cerradura del compare-and-swap— y el mismo
 * `RENEWAL_TOKEN_SECRET` con el que firma el servidor. La 11.22 puso las dos
 * primeras (`neonConfig.fetchEndpoint` contra `scripts/neon-http-proxy.mjs` y
 * un Postgres sembrado) y el trabajo de CI ya define la tercera desde la 7.11.
 *
 * **La fila la siembra y la borra esta prueba, no `seed-e2e.ts`.** Renovar
 * MUTA: mueve `expires_at` y sube `expired` a `active`. Colgarse del catálogo
 * compartido dejaría una suite que pasa según quién corrió antes —y peor, un
 * segundo proyecto (`crawlability`) corriendo en paralelo encontraría el token
 * ya quemado y leería «ya se usó» donde esperaba «renovado». Cada proyecto
 * siembra **su propia** fila, con su propio id, y la borra al terminar: sale
 * igual con un reintento, con los dos proyectos a la vez y corriendo dos veces
 * seguidas.
 *
 * **Ninguna fecha es literal.** Todas se derivan del reloj del momento: una
 * fixture con una fecha escrita cambia de sujeto sola cuando el calendario la
 * pasa.
 */
const conArnesDeRenovacion =
  !process.env.PLAYWRIGHT_BASE_URL &&
  Boolean(process.env.TEST_DATABASE_URL) &&
  Boolean(process.env.RENEWAL_TOKEN_SECRET);

const DIA_MS = 24 * 60 * 60 * 1000;

/** Un id por proyecto: `chromium` y `crawlability` corren a la vez. */
function idDePrueba(proyecto: string): string {
  const sufijo = proyecto === "crawlability" ? "2" : "1";
  return `7e120000-0000-4000-8000-00000000000${sufijo}`;
}

test.describe("el camino feliz de la renovación (7.12)", () => {
  test.beforeAll(() => {
    if (!conArnesDeRenovacion && process.env.CI) {
      throw new Error(
        "El camino feliz de la 7.12 no corrió y esto es CI. Hacen falta TEST_DATABASE_URL, " +
          "RENEWAL_TOKEN_SECRET y NINGUNA PLAYWRIGHT_BASE_URL: contra una vista previa la " +
          "aplicación firma con el secreto de ese despliegue, que esta prueba no tiene, así que " +
          "no podría construir un token que el servidor acepte. Saltarlo en silencio sería " +
          "reportar en verde la única mitad que un navegador puede probar.",
      );
    }
  });

  test.skip(
    !conArnesDeRenovacion,
    "Necesita el arnés de la 11.22 más RENEWAL_TOKEN_SECRET: " +
      "`pnpm db:test:up && pnpm db:test:migrate && pnpm db:test:seed:e2e`.",
  );

  test("un enlace firmado renueva 30 días, y el mismo enlace no renueva dos veces", async ({
    request,
  }, testInfo) => {
    const { Client } = await import("pg");
    const { mintRenewalToken } = await import(
      "../../src/modules/listing-lifecycle/domain/renewal-token"
    );
    const { DISTRITO, ZONE_ROWS } = await import("../../scripts/seed-e2e");

    const listingId = idDePrueba(testInfo.project.name);
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    try {
      // Vencido hace cinco días: dentro de los quince de gracia, así que el
      // `notAfter` firmado (vencimiento + 15) todavía no pasó y el enlace
      // sirve. Es el estado en el que llega el segundo correo del ciclo.
      const ahora = new Date();
      const vencimiento = new Date(ahora.getTime() - 5 * DIA_MS);
      await client.query("delete from listing where id = $1", [listingId]);
      await client.query(
        `insert into listing (id, publisher_id, publisher_type, property_type, city_id, zone_id,
           title, description, price_usd, rooms, area_m2, bathrooms, parking_spots,
           contact_method, contact_value, status, published_at, expires_at)
         values ($1, 'e2e-publicante', 'owner', 'apartamento', $2, $3,
           'Aviso vencido que se va a renovar', $4, 400, 2, 70, 1, 1,
           'whatsapp', 'sin-contacto', 'expired', $5, $6)`,
        [
          listingId,
          DISTRITO.id,
          ZONE_ROWS[0].id,
          "Sembrado por la prueba del camino feliz de la renovación y borrado al terminar. " +
            "Necesita ciento veinte caracteres para parecerse a un aviso de verdad.",
          new Date(ahora.getTime() - 40 * DIA_MS),
          vencimiento,
        ],
      );

      const token = mintRenewalToken(
        { listingId, expiresAt: vencimiento },
        process.env.RENEWAL_TOKEN_SECRET as string,
      );

      // 1. El `GET` MUESTRA. Es la mitad que el token inválido nunca alcanza:
      //    acá el aviso se leyó de verdad y su título llegó a la pantalla.
      const vista = await request.get(`/renovar/${token}`);
      expect(vista.status()).toBe(200);
      const htmlDeLaVista = await vista.text();
      expect(offersRenewal(htmlDeLaVista)).toBe(true);
      expect(htmlDeLaVista).toContain("Aviso vencido que se va a renovar");

      // 2. Y NO renueva. La otra prueba ya afirma que dos `GET` contestan
      //    igual; ésta afirma lo que aquélla no podía: que la FILA no se
      //    movió, que es de dónde salía la garantía.
      expect(await vencimientoDe(client, listingId)).toBe(vencimiento.getTime());

      // 3. El `POST` renueva: +30 días contados desde AHORA, no desde el
      //    vencimiento viejo, y el aviso vuelve de `expired` a `active`.
      const renovado = await request.post(`/renovar/${token}`);
      expect(renovado.status()).toBe(200);
      expect(await renovado.text()).toContain("Listo, tu aviso está activo");

      const nuevoVencimiento = await vencimientoDe(client, listingId);
      const esperado = Date.now() + 30 * DIA_MS;
      // Cota de un minuto: el reloj del servidor no es el de esta prueba.
      expect(Math.abs(nuevoVencimiento - esperado)).toBeLessThan(60_000);
      expect(await estadoDe(client, listingId)).toBe("active");

      // 4. Y el mismo enlace no renueva otra vez. **No hay tabla de tokens
      //    quemados**: la quema es que `expires_at` dejó de valer lo que el
      //    token firmó, así que el `UPDATE` condicionado afecta cero filas.
      const repetido = await request.post(`/renovar/${token}`);
      expect(repetido.status()).toBe(409);
      expect(await repetido.text()).toContain("Tu aviso ya está renovado");
      // Y la fila no se movió otro mes por el segundo intento.
      expect(await vencimientoDe(client, listingId)).toBe(nuevoVencimiento);
    } finally {
      await client.query("delete from listing where id = $1", [listingId]);
      await client.end();
    }
  });
});

async function vencimientoDe(
  client: { query: (text: string, values: unknown[]) => Promise<{ rows: { e: Date }[] }> },
  listingId: string,
): Promise<number> {
  const { rows } = await client.query("select expires_at as e from listing where id = $1", [
    listingId,
  ]);
  const fila = rows[0];
  if (!fila) throw new Error(`el aviso ${listingId} no está en la base`);
  return fila.e.getTime();
}

async function estadoDe(
  client: { query: (text: string, values: unknown[]) => Promise<{ rows: { s: string }[] }> },
  listingId: string,
): Promise<string> {
  const { rows } = await client.query("select status as s from listing where id = $1", [listingId]);
  const fila = rows[0];
  if (!fila) throw new Error(`el aviso ${listingId} no está en la base`);
  return fila.s;
}
