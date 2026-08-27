import {
  authorizeBulkImport,
  BulkImportDisabledError,
} from "../../../src/modules/broker-bulk-import/application/authorize-bulk-import";
import { generateImportTemplate } from "../../../src/modules/broker-bulk-import/application/generate-import-template";
import { DrizzleBulkImportAccounts } from "../../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { UnauthenticatedError } from "../../../src/modules/identity/application/require-authenticated-session";
import { nextAuthSessionPort } from "../../../src/modules/identity/infrastructure/session-port";
import { DrizzleCatalogue } from "../../../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { db } from "../../../src/shared/db/client";

/**
 * El paso 1 de la lámina 14e: **"la plantilla es el paso 1, no un enlace
 * perdido"**. La plantilla es el contrato del formato, así que se baja dentro
 * del flujo.
 *
 * **Es la única pieza de importar que funciona con JavaScript apagado**, y es
 * a propósito: un `<a href>` a esta ruta navega igual que cualquier otro
 * enlace. AGENTS.md §2 exime a las pantallas de importar del piso del camino
 * de lectura porque la vista previa pasa en el dispositivo — la exención es
 * para la vista previa, no una licencia para que TODO dependa del script.
 *
 * **La puerta corre antes de generar nada.** `generateImportTemplate` lee el
 * catálogo entero (ciudades y zonas) para armar las filas de ejemplo; una
 * cuenta sin permiso no debe poder disparar esa consulta, ni una vez.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const handle = db as unknown as ConstructorParameters<typeof DrizzleBulkImportAccounts>[0];

  try {
    await authorizeBulkImport({
      sessionPort: nextAuthSessionPort,
      accounts: new DrizzleBulkImportAccounts(handle),
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (error instanceof BulkImportDisabledError) {
      return Response.json({ error: "bulk_import_disabled" }, { status: 403 });
    }
    throw error;
  }

  const csv = await generateImportTemplate({ catalogue: new DrizzleCatalogue(handle as never) });

  return new Response(csv, {
    status: 200,
    headers: {
      // `charset=utf-8` explícito: el archivo trae nombres de zonas con
      // tildes, y la lámina 14f dedica un rechazo entero a los acentos mal
      // leídos. Que la plantilla misma llegue mal etiquetada sería enseñar el
      // error que el flujo después rechaza.
      "content-type": "text/csv; charset=utf-8",
      // `attachment`, no `inline`: sin esto el navegador muestra el CSV como
      // texto en la pestaña y "Bajar plantilla CSV" no baja nada.
      "content-disposition": 'attachment; filename="plantilla-rentas.csv"',
      "cache-control": "no-store",
    },
  });
}
