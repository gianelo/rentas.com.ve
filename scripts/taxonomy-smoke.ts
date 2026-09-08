#!/usr/bin/env tsx
/**
 * **Falla ruidosamente cuando un despliegue no tiene la taxonomía que el
 * producto ofrece** (tarea 17.15).
 *
 * `schema-smoke.ts` (11b.5) prueba que están las COLUMNAS que el código
 * selecciona. Esto contesta la pregunta que faltaba y que nadie hacía: están
 * las FILAS sin las cuales el producto no funciona. El 2026-09-05 la
 * respuesta era no — producción tenía 10 zonas provisionales bajo una ciudad
 * llamada «Distrito Capital» en vez de las 5.796 de `docs/territorio/`, el
 * paso 2 de publicar no ofrecía ninguna zona, y publicar era imposible— con
 * la suite entera en verde: la taxonomía sólo llegaba por un `pnpm db:seed`
 * a mano, ningún paso de despliegue ni de CI lo corría, y ninguna afirmación
 * miraba el contenido del entorno real.
 *
 * **No solapa a los otros dos guardianes.** `deploy-migrate.mjs` decide si se
 * puede migrar, `schema-smoke.ts` si la base quedó con la forma que el código
 * espera, y esto si quedó con el CONTENIDO sin el cual el formulario está
 * vacío. Un solo punto de entrada, tres preguntas.
 *
 * Lo esperado se deriva de `buildTerritoryRows(readTerritoryDocuments())`, la
 * misma función que el seed usa, así que el chequeo no puede quedar desfasado
 * de los documentos. Que caza el defecto se prueba construyéndolo, en
 * `tests/integration/taxonomy-smoke.test.ts`.
 */
import { describeTaxonomyGaps } from "../src/modules/operability/domain/taxonomy-gap";
import { describeSlugGaps } from "../src/modules/operability/domain/taxonomy-slug";
import type { SmokeDatabase } from "../src/modules/operability/infrastructure/schema-shapes";
import {
  expectedTaxonomy,
  findTaxonomyGapsIn,
} from "../src/modules/operability/infrastructure/taxonomy-census";
import {
  backfillTaxonomySlugs,
  findTaxonomySlugGapsIn,
} from "../src/modules/operability/infrastructure/taxonomy-slug-backfill";
import { loadDotEnvWithoutOverriding } from "../src/shared/db/seed";

// En Vercel `DATABASE_URL` ya viene en el entorno y esto no hace nada. Está
// para la otra mitad del trabajo: mirar desde una laptop si un despliegue
// tiene su taxonomía, que es como se comprobó la siembra del 2026-09-06. Sin
// esto el comando sólo existe adentro del build, y un guardián que no se
// puede consultar a mano se consulta cuando ya es tarde. Lo que está en el
// entorno real GANA sobre el archivo, así que un `.env` local no puede
// redirigir un despliegue. El import es dinámico porque `./client` resuelve
// la cadena de conexión al importarse: cargar primero, importar después.
loadDotEnvWithoutOverriding(process.env);
const { db } = await import("../src/shared/db/client");

const gaps = await findTaxonomyGapsIn(db as unknown as SmokeDatabase);

if (gaps.length > 0) {
  console.error(
    "taxonomy-smoke: LA TAXONOMÍA NO ESTÁ SEMBRADA EN ESTA BASE.\n\n" +
      `${describeTaxonomyGaps(gaps)}\n\n` +
      "Esto es el fallo del 2026-09-05: la búsqueda sigue andando porque lee lo\n" +
      "poco que hay, y publicar es imposible porque el paso 2 no tiene una sola\n" +
      "zona que ofrecer. Corré `pnpm db:seed` contra este entorno — es\n" +
      "idempotente y no borra nada — y volvé a desplegar.",
  );
  process.exit(1);
}

// Segunda lectura de `docs/territorio/`, y a propósito: el chequeo corre por
// el mismo camino que la prueba lo ejerce (`findTaxonomyGapsIn`) en vez de
// armar acá una variante que nadie prueba. Cuesta parsear los documentos otra
// vez, una vez por despliegue.
const { cityNames, zoneIds } = expectedTaxonomy();
console.log(
  `taxonomy-smoke: ${cityNames.length} área(s) y ${zoneIds.length} zona(s) de docs/territorio/ presentes en la base.`,
);

// **El backfill del `slug` nullable (tasks.md 27.1, slice A), y su gate.**
// La migración sólo pudo AGREGAR la columna — ver `schema.ts` para por qué no
// pudo llenarla — así que este es el único lugar donde una fila vieja llega a
// tener slug. Es un no-op en cualquier despliegue que ya corrió esto una vez:
// sólo toca filas con `slug IS NULL`.
const backfill = await backfillTaxonomySlugs(db as unknown as SmokeDatabase);
if (backfill.citiesBackfilled > 0 || backfill.zonesBackfilled > 0) {
  console.log(
    `taxonomy-smoke: backfill de slug — ${backfill.citiesBackfilled} ciudad(es) y ` +
      `${backfill.zonesBackfilled} zona(s).`,
  );
}

// El gate. Un NULL o un slug desactualizado que sobreviviera al backfill de
// arriba no se vuelve a intentar solo: el tipo de la columna lo permite y
// nada más lo impide, así que esto falla el despliegue en vez de dejarlo
// pasar en silencio — la misma forma de fallar cerrado que el resto de este
// script ya usa para la taxonomía completa.
const slugGaps = await findTaxonomySlugGapsIn(db as unknown as SmokeDatabase);
if (slugGaps.length > 0) {
  console.error(
    "taxonomy-smoke: HAY FILAS SIN SLUG DESPUÉS DEL BACKFILL.\n\n" +
      `${describeSlugGaps(slugGaps)}\n\n` +
      "Esto no debería ser posible con el backfill de arriba ya corrido: revisá " +
      "si `slugify` cambió de forma que no termina en el mismo valor dos veces.",
  );
  process.exit(1);
}
