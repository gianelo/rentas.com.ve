import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLink } from "../../components/atoms/AppLink";
import { Container } from "../../components/layout/Container";
import type { SearchPillProps } from "../../components/molecules/SearchPill";
import { Nav } from "../../components/organisms/Nav";
import { isBulkImportAuthorized } from "../../src/modules/broker-bulk-import/domain/bulk-import-authorization";
import { DrizzleBulkImportAccounts } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import {
  resolveNavAccount,
  resolveNavPublish,
} from "../../src/modules/identity/domain/nav-account";
import { homeSearchForm } from "../../src/modules/listing-catalogue/domain/search-destination";
import { db } from "../../src/shared/db/client";
import { requireSession } from "../_lib/require-session";
import { ImportarCartera } from "./ImportarCartera";
import styles from "./importar.module.css";

export const metadata: Metadata = {
  title: "Importar cartera — Rentas",
};

// Quién está adentro y si su cuenta importa cartera se lee en cada pedido:
// una bandera que un operador acaba de apagar no puede quedar horneada.
export const dynamic = "force-dynamic";

/**
 * `/importar` — láminas 14e a 14h (tasks.md 9.26).
 *
 * **Existía el motor entero y no existía la puerta.** `src/modules/broker-
 * bulk-import/` traía parseo, límites, validación fila por fila, resolución
 * de ciudad/zona por nombre, idempotencia por índice único, confirmación y
 * plantilla descargable — 25 archivos, todos probados, ninguno alcanzable
 * desde un navegador. Esta ruta es esa puerta.
 *
 * **La bandera se decide dos veces, y ninguna es ésta.** Acá se consulta la
 * cuenta y se le pregunta al DOMINIO (`isBulkImportAuthorized`, la misma
 * función que usa `authorizeBulkImport`), y además `/api/bulk-import` y
 * `/importar/plantilla` la vuelven a exigir por su cuenta: esconder la
 * pantalla NO puede ser el único control (spec broker-bulk-import). La
 * página no escribe su propio `if` sobre `bulkImportEnabled` — eso sería una
 * tercera copia de la regla, en la capa que el piso de 90% no alcanza
 * (AGENTS.md §1).
 *
 * **`notFound()` y no una pantalla de disculpa** (AGENTS.md §7): para una
 * cuenta sin la bandera esta ruta no existe. Es la misma forma en la que el
 * estado de contacto bloqueado no tiene propiedad `value` — el modo de fallo
 * es la negativa, no una versión degradada.
 *
 * **La pastilla va vacía, por contrato** (diseño 14i: "sin búsqueda no hay
 * nada que filtrar. Es el estado de /mis-avisos e importar"), y por eso reusa
 * el mismo `homeSearchForm` que `/mis-avisos`, sin una segunda copia del
 * mecanismo.
 */
export default async function ImportarPage() {
  const session = await requireSession("/importar");

  const bulkImportAccount = await new DrizzleBulkImportAccounts(db).findAccount(session.userId);
  if (!isBulkImportAuthorized(bulkImportAccount)) notFound();

  const account = resolveNavAccount(
    { name: session.name, email: session.email },
    { bulkImportEnabled: true },
  );
  const publish = resolveNavPublish(account);

  const form = homeSearchForm();
  const pill: SearchPillProps = {
    action: form.action,
    name: form.name,
    value: form.value,
    placeholder: form.label,
    submitLabel: form.submitLabel,
    state: { kind: "empty" },
  };

  return (
    <>
      <Nav
        account={account}
        publish={publish}
        pill={pill}
        signInHref="/signin?callbackUrl=%2Fimportar"
      />
      <main>
        <Container>
          {/* La vuelta que dibuja la lámina: importar se entra desde Mis
              avisos, así que se sale hacia ahí. */}
          <AppLink className={styles.volver} href="/mis-avisos">
            ← Mis avisos
          </AppLink>
          <h1 className={styles.titulo}>Importar cartera</h1>
          <ImportarCartera />
        </Container>
      </main>
    </>
  );
}
