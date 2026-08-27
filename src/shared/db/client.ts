import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { resolveLocalFetchEndpoint } from "./local-fetch-endpoint";
import { assertPooledConnectionString } from "./pooled-connection";
import * as schema from "./schema";

function getPooledDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  return assertPooledConnectionString(url);
}

// `neon-http` issues one HTTP request per query with no held connection —
// the right shape for a serverless function against Neon's pooled endpoint
// (design.md D2). Interactive multi-statement transactions are not needed by
// anything this app does today (Auth.js adapter calls, single-row use case
// writes); if that changes, `drizzle-orm/neon-serverless` is the documented
// escalation path, not a rewrite.

// **La costura del arnés de e2e (tasks.md 11.22), y sólo hacia el bucle local.**
// `neon()` habla HTTP, y a qué dirección lo habla lo decide esto: con el proxy
// de `scripts/neon-http-proxy.mjs` levantado, ESTA aplicación —sin una línea
// distinta— corre contra el Postgres de `docker-compose.yml`, que es lo que le
// devuelve los dientes al proyecto `crawlability`.
//
// Fuera de esa costura la variable no existe y nada cambia. Y no puede
// convertirse en otra cosa: `resolveLocalFetchEndpoint` rechaza cualquier host
// que no sea el bucle local, así que una variable filtrada en un despliegue
// deja la aplicación sin arrancar en vez de mandar cada consulta a otra parte.
// `assertPooledConnectionString` sigue corriendo, y sin aflojarse.
const localFetchEndpoint = resolveLocalFetchEndpoint(process.env.NEON_FETCH_ENDPOINT);
if (localFetchEndpoint) neonConfig.fetchEndpoint = localFetchEndpoint;

const sql = neon(getPooledDatabaseUrl());

export const db = drizzle(sql, { schema });
