#!/usr/bin/env tsx
/**
 * **Falla ruidosamente cuando el esquema de un despliegue no coincide con el
 * código** (tarea 11b.5).
 *
 * `deploy-migrate.mjs` (11b.1) hace que las migraciones lleguen con el código
 * que las espera. Esto es lo que lo **prueba** en vez de confiarlo, y corre
 * justo después de migrar: si `drizzle-kit migrate` dijo que todo está al día
 * y sin embargo falta una columna que el código selecciona, el despliegue se
 * detiene acá en vez de esperar a que un visitante lo encuentre.
 *
 * **No es un segundo guardián con responsabilidades solapadas.**
 * `deploy-migrate.mjs` decide si se puede migrar —y refuse una migración
 * destructiva—; esto contesta una pregunta distinta y posterior: quedó la base
 * como el código la espera. Por eso lo invoca aquel y no `vercel-build`: un
 * solo punto de entrada, dos preguntas.
 *
 * El defecto que tiene que cazar está nombrado: un `select` que nombra una
 * columna que la base no tiene. Que lo caza se prueba construyéndolo, en
 * `tests/integration/schema-smoke.test.ts`.
 */
import {
  describeSchemaDrift,
  findSchemaDrift,
} from "../src/modules/operability/domain/schema-drift";
import {
  actualTableShapes,
  expectedTableShapes,
  type SmokeDatabase,
} from "../src/modules/operability/infrastructure/schema-shapes";
import { db } from "../src/shared/db/client";

const drift = findSchemaDrift(
  expectedTableShapes(),
  await actualTableShapes(db as unknown as SmokeDatabase),
);

if (drift.length > 0) {
  console.error(
    "schema-smoke: EL ESQUEMA DESPLEGADO NO ES EL QUE EL CÓDIGO ESPERA.\n\n" +
      `${describeSchemaDrift(drift)}\n\n` +
      "Esto es el fallo del 2026-08-17: la búsqueda seguiría andando porque no\n" +
      "selecciona lo que falta, y entrar o publicar fallaría con `column ... does\n" +
      "not exist`. Falta una migración, o falta generarla.",
  );
  process.exit(1);
}

console.log(
  `schema-smoke: ${expectedTableShapes().length} tabla(s) del código presentes en la base, con todas sus columnas.`,
);
