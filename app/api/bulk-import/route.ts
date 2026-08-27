import { BulkImportDisabledError } from "../../../src/modules/broker-bulk-import/application/authorize-bulk-import";
import { confirmImport } from "../../../src/modules/broker-bulk-import/application/confirm-import";
import {
  ImportEncodingError,
  ImportMissingColumnsError,
} from "../../../src/modules/broker-bulk-import/application/parse-import-file";
import type { ImportFileSourcePort } from "../../../src/modules/broker-bulk-import/application/ports/import-file-source.port";
import {
  ImportFileTooLargeError,
  ImportTooManyRowsError,
} from "../../../src/modules/broker-bulk-import/application/read-bounded-import-file";
import { ImportMissingAccountContactError } from "../../../src/modules/broker-bulk-import/application/run-import-validation";
import { validateImport } from "../../../src/modules/broker-bulk-import/application/validate-import";
import { DrizzleBulkImportAccounts } from "../../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { DrizzleImportAccountContact } from "../../../src/modules/broker-bulk-import/infrastructure/drizzle-import-account-contact";
import { UnauthenticatedError } from "../../../src/modules/identity/application/require-authenticated-session";
import { nextAuthSessionPort } from "../../../src/modules/identity/infrastructure/session-port";
import { DrizzleCatalogue } from "../../../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import {
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
} from "../../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { db } from "../../../src/shared/db/client";
import { getTransactionalDatabase } from "../../../src/shared/db/transactional-client";
import { importRowReasonText } from "../../importar/import-copy";

/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md
 * 9.2/9.3) + el cableado de la 9.26.
 *
 * **La puerta sigue siendo la misma, y sigue estando primero.** Esta ruta no
 * llama `authorizeBulkImport` por su cuenta: la llaman `validateImport` y
 * `confirmImport` como su PRIMERA línea, antes de leer un solo byte del
 * archivo. Duplicar la comprobación acá sería una segunda copia del control
 * que la spec advierte contra ("esconder la UI NO puede ser el único
 * control") — y una copia que puede quedarse atrás.
 *
 * **Un solo endpoint con dos acciones, y el archivo viaja dos veces.** Es la
 * consecuencia deliberada de que la vista previa no escriba NADA (spec:
 * "previsualizar sin confirmar no crea nada"): sin un borrador de lote
 * guardado no hay nada del lado del servidor que "confirmar", así que el
 * cliente vuelve a subir el mismo archivo. `runImportValidation` es la MISMA
 * función en los dos caminos, que es lo que hace verdadero por construcción
 * que "confirmar crea exactamente las filas que la vista previa dio por
 * válidas".
 *
 * **Falla cerrado (AGENTS.md §7).** Una acción desconocida, un archivo
 * ausente o un archivo que el dominio rechaza no llegan nunca a `crear`: se
 * devuelven 400 o 422, que es negarse, no seguir con lo que se pueda.
 */
export const dynamic = "force-dynamic";

type Accion = "revisar" | "crear";

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status });
}

/**
 * `File` ya conoce su tamaño sin leerse, que es exactamente lo que
 * `ImportFileSourcePort.declaredByteLength` existe para aprovechar: el límite
 * de 2 MB se decide antes de tocar un byte.
 */
function sourceFrom(file: File): ImportFileSourcePort {
  return {
    declaredByteLength: file.size,
    async *chunks() {
      const reader = file.stream().getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    },
  };
}

function dependencies() {
  const readHandle = db as unknown as ConstructorParameters<typeof DrizzleBulkImportAccounts>[0];
  const writeHandle = getTransactionalDatabase();

  return {
    sessionPort: nextAuthSessionPort,
    accounts: new DrizzleBulkImportAccounts(readHandle),
    contact: new DrizzleImportAccountContact(readHandle),
    zones: new DrizzleZoneCatalogue(readHandle as never),
    catalogue: new DrizzleCatalogue(readHandle as never),
    // La escritura va por el cliente transaccional, igual que publicar: cada
    // aviso es una fila más sus fotos, y `neon-http` no sabe hacer eso.
    listings: new DrizzleListingRepository(writeHandle),
  };
}

/** Los cuatro rechazos de la lámina 14f, más los dos que el dominio ya sabía. */
const RECHAZOS: readonly {
  readonly is: (error: unknown) => boolean;
  readonly motivo: string;
}[] = [
  { is: (e) => e instanceof ImportMissingColumnsError, motivo: "columna-faltante" },
  { is: (e) => e instanceof ImportEncodingError, motivo: "codificacion" },
  { is: (e) => e instanceof ImportFileTooLargeError, motivo: "archivo-muy-grande" },
  { is: (e) => e instanceof ImportTooManyRowsError, motivo: "demasiadas-filas" },
  { is: (e) => e instanceof ImportMissingAccountContactError, motivo: "cuenta-sin-contacto" },
];

function respondToError(error: unknown): Response {
  if (error instanceof UnauthenticatedError) return json({ error: "unauthorized" }, 401);
  if (error instanceof BulkImportDisabledError) return json({ error: "bulk_import_disabled" }, 403);

  const rechazo = RECHAZOS.find((candidate) => candidate.is(error));
  if (rechazo) {
    return json(
      {
        estado: "rechazado",
        motivo: rechazo.motivo,
        // El mensaje del dominio, entero. Es el que dice qué hacer —"volvé a
        // exportar como CSV UTF-8", "partilo en dos"— y reescribirlo acá
        // sería una segunda versión de una frase que ya existe.
        mensaje: (error as Error).message,
      },
      422,
    );
  }

  // Lo que no se reconoce sube. Un 500 de Next es la respuesta honesta a un
  // fallo del servidor; convertirlo en un 422 diría que el archivo tiene la
  // culpa.
  throw error;
}

function erroresPara(errors: readonly { rowNumber: number; reasons: readonly string[] }[]) {
  return errors.map((error) => ({
    fila: error.rowNumber,
    // La traducción pasa en el servidor: la pantalla nunca recibe un código,
    // así que un código sin copia no puede llegar a la cara de nadie sin que
    // `import-copy.test.ts` se ponga roja primero.
    razones: error.reasons.map(importRowReasonText),
  }));
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();

  const accionCruda = form.get("accion");
  const accion: Accion | null =
    accionCruda === "revisar" || accionCruda === "crear" ? accionCruda : null;
  if (!accion) return json({ error: "unknown_action" }, 400);

  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return json({ error: "missing_file" }, 400);
  }

  const source = sourceFrom(archivo);

  try {
    if (accion === "revisar") {
      const preview = await validateImport(source, dependencies());
      return json(
        {
          estado: "vista-previa",
          totalFilas: preview.totalRows,
          listas: preview.validRows.length,
          errores: erroresPara(preview.errors),
        },
        200,
      );
    }

    const result = await confirmImport(source, dependencies());
    return json(
      {
        estado: "creado",
        totalFilas: result.totalRows,
        creadas: result.createdCount,
        yaEstaban: result.skippedDuplicates.map((row) => ({
          fila: row.rowNumber,
          referencia: row.externalReference,
        })),
        errores: erroresPara(result.errors),
      },
      200,
    );
  } catch (error) {
    return respondToError(error);
  }
}
