#!/usr/bin/env node
/**
 * **El arnés que le devuelve los dientes al proyecto `crawlability`**
 * (tasks.md 11.22, y con él la 11.16).
 *
 * `AGENTS.md` §2 dice que la suite con el script apagado es «lo que convierte
 * "anda sin JavaScript" de afirmación en medición». No medía nada: siete
 * especificaciones de `tests/e2e/` se saltaban solas sin `PLAYWRIGHT_BASE_URL`,
 * porque `/alquiler/**` consulta el catálogo antes de dibujar y el respaldo
 * local compila contra una `DATABASE_URL` deliberadamente inalcanzable. Sólo
 * podía contestar 500.
 *
 * La causa era estructural y no un descuido: **la aplicación no habla el
 * protocolo de cable de Postgres.** Habla el HTTP de Neon, por
 * `@neondatabase/serverless`, y el contenedor de `docker-compose.yml` no puede
 * hacerse pasar por eso. Esto es lo que falta en el medio: cuarenta líneas que
 * traducen el HTTP de Neon a una consulta de `pg` contra ese contenedor.
 *
 * **El protocolo, comprobado corriendo y no leído de una documentación:**
 *
 *   POST <fetchEndpoint>
 *   Neon-Raw-Text-Output: true    → los valores vuelven como texto crudo
 *   Neon-Array-Mode: true         → cada fila es un arreglo, no un objeto
 *   { "query": "select …", "params": [...] }
 *   → { command, rowCount, rows, fields, rowAsArray }
 *
 * `pg` —que ya es dependencia de desarrollo— lo sirve entero con
 * `rowMode: "array"` más un `getTypeParser` identidad, que es exactamente lo
 * que "texto crudo" significa: el driver de Neon hace su propia conversión del
 * otro lado, así que convertir acá la haría dos veces.
 *
 * **La guarda del endpoint agrupado NO se debilita.** La cadena de conexión de
 * prueba lleva `-pooler.` en su nombre de host —y por eso
 * `assertPooledConnectionString` la acepta sin cambiar una línea— mientras el
 * ruteo real viaja por `neonConfig.fetchEndpoint`, que sólo se acepta si apunta
 * al bucle local (`src/shared/db/local-fetch-endpoint.ts`). En producción esa
 * variable no existe y la guarda sigue rechazando un endpoint directo de Neon
 * exactamente igual que hoy.
 *
 * Uso:
 *   node scripts/neon-http-proxy.mjs            # 5432 sobre TEST_DATABASE_URL
 *   NEON_PROXY_PORT=7432 node scripts/neon-http-proxy.mjs
 */
import { createServer } from "node:http";
import pg from "pg";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  console.error(
    "neon-http-proxy: TEST_DATABASE_URL no está puesta. Es el Postgres real contra el que " +
      "este proxy traduce (`pnpm db:test:up && pnpm db:test:migrate`).",
  );
  process.exit(1);
}

const port = Number(process.env.NEON_PROXY_PORT ?? 5544);

/**
 * **Identidad, y es el punto entero.** Con `Neon-Raw-Text-Output` el driver de
 * Neon recibe texto y lo convierte él mismo; si `pg` ya lo convirtiera acá,
 * `2026-08-27` llegaría del otro lado como un `Date` serializado a JSON y se
 * volvería a parsear, que es cómo una fecha pierde un día en silencio.
 */
const RAW_TEXT_TYPES = { getTypeParser: () => (value) => value };

const pool = new pg.Pool({ connectionString, max: 8 });

/** Una sentencia del cuerpo, tal como el driver de Neon la escribe. */
async function runOne(client, statement, { arrayMode, rawText }) {
  const result = await client.query({
    text: statement.query,
    values: statement.params ?? [],
    rowMode: arrayMode ? "array" : undefined,
    types: rawText ? RAW_TEXT_TYPES : undefined,
  });

  return {
    command: result.command,
    rowCount: result.rowCount,
    rows: result.rows,
    // El driver mapea los valores por `dataTypeID`, así que los campos viajan
    // con la forma que `pg` ya devuelve. Recortarlos a `{ name }` deja al
    // driver sin con qué convertir y todo llega como cadena.
    fields: result.fields.map((field) => ({
      name: field.name,
      dataTypeID: field.dataTypeID,
      tableID: field.tableID,
      columnID: field.columnID,
      dataTypeSize: field.dataTypeSize,
      dataTypeModifier: field.dataTypeModifier,
      format: field.format,
    })),
    rowAsArray: Boolean(arrayMode),
  };
}

const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", async () => {
    // `true` por defecto: es lo que `drizzle-orm/neon-http` manda siempre, y un
    // respaldo que devolviera objetos se vería como filas vacías del otro lado.
    const arrayMode = request.headers["neon-array-mode"] !== "false";
    const rawText = request.headers["neon-raw-text-output"] !== "false";

    let client;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
      client = await pool.connect();

      // El cuerpo es un arreglo cuando el driver abre una transacción
      // (`db.transaction()` de `drizzle-orm/neon-http`): varias sentencias, una
      // sola transacción. Servirlas sueltas rompería la atomicidad sin que nada
      // se queje, que es la peor forma de servirlas.
      if (Array.isArray(body)) {
        await client.query("begin");
        try {
          const results = [];
          for (const statement of body) {
            results.push(await runOne(client, statement, { arrayMode, rawText }));
          }
          await client.query("commit");
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ results }));
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
      } else {
        const result = await runOne(client, body, { arrayMode, rawText });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
      }
    } catch (error) {
      // La forma del error que `@neondatabase/serverless` sabe leer: el código
      // y el mensaje de Postgres, no un 500 opaco. Sin esto, una restricción
      // violada llega a la aplicación como "fetch failed".
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          message: error?.message ?? String(error),
          code: error?.code,
          detail: error?.detail,
          severity: error?.severity ?? "ERROR",
        }),
      );
    } finally {
      client?.release();
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`neon-http-proxy: escuchando en http://127.0.0.1:${port}/sql`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    void pool.end().then(() => process.exit(0));
  });
}
