import type { Metadata } from "next";
import { AppLink } from "../../components/atoms/AppLink";
import type { SearchPillProps } from "../../components/molecules/SearchPill";
import { Nav } from "../../components/organisms/Nav";
import { DrizzleBulkImportAccounts } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import {
  resolveNavAccount,
  resolveNavPublish,
} from "../../src/modules/identity/domain/nav-account";
import { homeSearchForm } from "../../src/modules/listing-catalogue/domain/search-destination";
import { db } from "../../src/shared/db/client";
import { requireSession } from "../_lib/require-session";

export const metadata: Metadata = {
  title: "Mis avisos — Rentas",
};

// La sesión se lee en cada pedido: quién está adentro y si su cuenta importa
// cartera no puede quedar horneado en tiempo de compilación.
export const dynamic = "force-dynamic";

/**
 * `/mis-avisos` (tasks.md 20.9: "es el nombre de la ruta de Mis
 * publicaciones", nunca `/mis-publicaciones").
 *
 * **Sólo el andamiaje de este trabajo: el nav y una carcasa protegida por
 * sesión.** La lista real de avisos — task 14c del diseño — necesita una
 * consulta que todavía no existe (el mismo motivo que ya deja escrito
 * `tasks.md` para el resto de "Cuenta e importar"); es la siguiente
 * porción, no ésta.
 *
 * **Por qué existe igual.** El control de cuenta del nav apunta acá en las
 * dos rutas de escape (con y sin JavaScript) — un enlace roto no es
 * aceptable (AGENTS.md §2) — así que esta pantalla tiene que existir antes
 * de que el nav se pueda enlazar en ningún otro lado.
 *
 * **Es el estado "vacío" de la pastilla, por contrato (diseño 14i):** sin
 * zona elegida el filtro no existe como pieza — "sin búsqueda no hay nada
 * que filtrar" — y es exactamente el mismo estado que ve `/` antes de
 * escribir nada, así que reusa el mismo formulario (`homeSearchForm`) en
 * vez de inventar una segunda copia del mecanismo.
 */
export default async function MisAvisosPage() {
  const session = await requireSession("/mis-avisos");

  const bulkImportAccount = await new DrizzleBulkImportAccounts(db).findAccount(session.userId);
  const account = resolveNavAccount(
    { name: session.name, email: session.email },
    bulkImportAccount ? { bulkImportEnabled: bulkImportAccount.bulkImportEnabled } : undefined,
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
        signInHref="/signin?callbackUrl=%2Fmis-avisos"
      />
      <main>
        <h1>Mis avisos</h1>
        {/*
          **«Importar vive acá, no en la navegación global»** — la anotación al
          pie de la lámina 14d. El menú de cuenta (14b) también la ofrece, pero
          ese panel sólo existe con JavaScript y su propia lámina aclara que
          "nada vive solo en el menú": ésta es la puerta que funciona igual sin
          el paquete.

          La decisión ya viene tomada (`resolveNavAccount` -> `canImportListings`,
          con el piso de 90% encima). Acá sólo se dibuja: la página no mira
          `bulkImportEnabled` por su cuenta (AGENTS.md §1).
        */}
        {account.kind === "authenticated" && account.canImportListings ? (
          <p>
            <AppLink href="/importar">Importar cartera</AppLink>
          </p>
        ) : null}
        <p>
          La lista de tus publicaciones vive acá. Todavía no está construida — es la próxima porción
          de este trabajo.
        </p>
      </main>
    </>
  );
}
