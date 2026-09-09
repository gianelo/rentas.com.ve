import { DrizzleCatalogue } from "../../../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { db } from "../../../src/shared/db/client";

/**
 * La ruta que el latido pregunta «¿estás viva?» (tasks.md 27.5).
 *
 * **Toca la base con una consulta mínima real, y eso es lo que la hace
 * distinta de una página estática.** Una página estática devolvería 200 con
 * la base muerta y el latido mentiría — es el límite absoluto que la tarea
 * dejó escrito. `listCities()` se eligió y no una vista completa: 5 filas y
 * 349 bytes medidos (tasks.md 27.1), 1/65 del costo de una vista de ciudad,
 * y sigue siendo una consulta real contra una tabla real — muere si Neon
 * está caído o sin cuota, igual que cualquier otra.
 *
 * **No filtra nada del fallo.** El cuerpo de la respuesta no lleva mensaje
 * de error, causa ni nombre de host: lo único que el vigilante necesita es
 * el status, y un cuerpo con la causa sería una fuga sin comprador — quien
 * mira el latido no necesita saber por qué, sólo que pasó.
 */

// Toca la base en cada pedido; cachearla devolvería el latido de la última
// vez que la base contestó, y el chequeo dejaría de significar algo.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await new DrizzleCatalogue(db).listCities();
  } catch {
    return Response.json({ status: "down" }, { status: 503 });
  }

  return Response.json({ status: "ok" });
}
