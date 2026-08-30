import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DrizzleBulkImportAccounts } from "@/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import { homeSearchForm } from "@/modules/listing-catalogue/domain/search-destination";
import {
  EditListingNotFoundError,
  loadListingForEdit,
} from "@/modules/listing-publication/application/edit-listing";
import type { ChangedField } from "@/modules/listing-publication/domain/publication-steps";
import {
  MAX_TITLE_CHARACTERS,
  MIN_DESCRIPTION_CHARACTERS,
} from "@/modules/listing-publication/domain/publishable-listing";
import { DrizzleListingEdit } from "@/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { db } from "@/shared/db/client";
import { AppLink } from "../../../../components/atoms/AppLink";
import { Container } from "../../../../components/layout/Container";
import type { SearchPillProps } from "../../../../components/molecules/SearchPill";
import { Nav } from "../../../../components/organisms/Nav";
import { requireSession } from "../../../_lib/require-session";
import styles from "../../../publicar/publish-steps.module.css";
import {
  CHANGE_FIELD_LABEL,
  CONTACT_METHOD_LABEL,
  PUBLISHER_TYPE_LABEL,
} from "../../../publicar/step-copy";
import {
  listingEditViolationMessage,
  PUBLISHER_TYPE_IMMUTABLE_NOTICE,
} from "../../../publicar/violation-copy";
import { guardarEdicion } from "../../actions";

export const metadata: Metadata = {
  title: "Editar aviso — Rentas",
};

// De quién es el aviso y si sigue activo se lee en cada pedido: un aviso que
// venció hace un minuto no puede quedar horneado como editable.
export const dynamic = "force-dynamic";

/**
 * `/mis-avisos/[id]/editar` — tasks.md 18.20, el llamador que le faltaba a
 * `editListing`: la regla, el caso de uso, el puerto y el adaptador shipearon
 * enteros y probados sin que ninguna ruta los invocara, así que un dueño no
 * podía corregir su precio aunque el dominio supiera cómo.
 *
 * **Acá no se decide nada** (AGENTS.md §1). Qué campos puede tocar una edición
 * lo contesta `planListingEdit`; si este aviso es editable y de quién es lo
 * contesta `loadListingForEdit`; qué dice cada negativa lo contesta la misma
 * tabla de castellano que usa publicar.
 *
 * **El `[id]` no se convierte en nada.** Viaja como la cadena opaca que es
 * hasta el `WHERE`, que ya está acotado a `publisher_id` y a
 * `status = 'active'`: un id inventado, uno ajeno, un borrador, un vencido y
 * uno oculto vuelven todos como el mismo `null` y salen por el mismo
 * `notFound()`. Convertirlo en un valor del dominio antes de consultar sería
 * una regla en la capa que el piso del 90% no alcanza — es como esta misma
 * semana se llegó a «Cambiaste undefined».
 *
 * **Sin una línea de JavaScript de cliente**: un `<form method="post">` nativo
 * hacia una Server Action, igual que los nueve pasos de publicar.
 *
 * **Las fotos no se editan acá, y no es un olvido**: son la 18.21 y dependen
 * del menú `⋯` de la 18.15, que hoy no existe ni al publicar. El tope y el
 * piso SÍ rigen esta edición (etapa `"activation"`); lo que falta es agregar y
 * quitar, y media puerta sería peor que ninguna.
 */
export default async function EditarAvisoPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const session = await requireSession(`/mis-avisos/${id}/editar`);

  const [bulkImportAccount, aviso] = await Promise.all([
    new DrizzleBulkImportAccounts(db).findAccount(session.userId),
    loadListingForEdit(
      { listingId: id },
      { sessionPort: nextAuthSessionPort, listings: new DrizzleListingEdit(db) },
    ).catch((error: unknown) => {
      // Ajeno, inexistente, borrador, vencido y oculto salen por la misma
      // puerta. Cualquier otro fallo sube: una pantalla que dibujara igual ante
      // un error de base estaría mintiendo (AGENTS.md §7).
      if (error instanceof EditListingNotFoundError) return null;
      throw error;
    }),
  ]);

  if (!aviso) notFound();

  const account = resolveNavAccount(
    { name: session.name, email: session.email },
    bulkImportAccount ? { bulkImportEnabled: bulkImportAccount.bulkImportEnabled } : undefined,
  );
  const form = homeSearchForm();
  const pill: SearchPillProps = {
    action: form.action,
    name: form.name,
    value: form.value,
    placeholder: form.label,
    submitLabel: form.submitLabel,
    // Vacía por contrato (diseño 14i): es el estado de /mis-avisos.
    state: { kind: "empty" },
  };

  // Códigos, nunca frases: es lo que vuelve en la dirección cuando el dominio
  // se niega y no hay JavaScript donde devolver un valor.
  const motivos = (query.motivos ?? "").split(",").filter((motivo) => motivo !== "");

  return (
    <>
      <Nav
        account={account}
        publish={resolveNavPublish(account)}
        pill={pill}
        signInHref={`/signin?callbackUrl=${encodeURIComponent(`/mis-avisos/${id}/editar`)}`}
      />
      <main>
        <Container>
          <div className={styles.column}>
            {/* Se entra desde Mis avisos, así que se sale hacia ahí. */}
            <AppLink href="/mis-avisos">← Mis avisos</AppLink>
            <h1 className={styles.title}>Editar aviso</h1>
            <p className={styles.help}>
              Los cambios se ven enseguida en tu aviso. Quien ya vio tu contacto no lo pierde.
            </p>

            {motivos.length === 0 ? null : (
              <p className={styles.error} role="alert">
                No se pudo guardar:{" "}
                {motivos
                  .map((motivo) => listingEditViolationMessage(motivo, { title: aviso.title }))
                  .join(" · ")}
              </p>
            )}

            <form action={guardarEdicion} method="post" className={styles.form}>
              {/* La acción vuelve a acotarlo a la sesión: que este campo diga
                  un id no es una afirmación sobre de quién es. */}
              <input type="hidden" name="listingId" value={aviso.id} />

              <div>
                <label className={styles.label} htmlFor="title">
                  {etiqueta("title")}
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  className={styles.control}
                  defaultValue={aviso.title}
                  maxLength={MAX_TITLE_CHARACTERS * 2}
                />
              </div>

              <div>
                <label className={styles.label} htmlFor="description">
                  {etiqueta("description")}
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={8}
                  className={`${styles.control} ${styles.textarea}`}
                  defaultValue={aviso.description}
                />
                <p className={styles.help}>Mínimo {MIN_DESCRIPTION_CHARACTERS} caracteres.</p>
              </div>

              <div>
                <label className={styles.label} htmlFor="priceUsd">
                  {etiqueta("priceUsd")}
                </label>
                {/* `inputMode` y no `type="number"`, igual que el paso 3: un
                    campo numérico esconde lo que no puede parsear. */}
                <input
                  id="priceUsd"
                  name="priceUsd"
                  type="text"
                  inputMode="numeric"
                  className={styles.control}
                  defaultValue={aviso.priceUsd}
                />
              </div>

              <div className={styles.numbers}>
                {(
                  [
                    ["rooms", aviso.rooms],
                    ["bathrooms", aviso.bathrooms],
                    ["areaM2", aviso.areaM2],
                  ] as const
                ).map(([name, value]) => (
                  <div key={name} className={styles.numberRow}>
                    <label className={styles.label} htmlFor={name}>
                      {etiqueta(name)}
                    </label>
                    <input
                      id={name}
                      name={name}
                      type="text"
                      inputMode="numeric"
                      className={`${styles.control} ${styles.numberControl}`}
                      defaultValue={value}
                    />
                  </div>
                ))}
              </div>

              <fieldset className={styles.choices}>
                <legend className={styles.legend}>{etiqueta("contactMethod")}</legend>
                {(["whatsapp", "telefono", "email"] as const).map((value) => (
                  <label key={value} className={styles.choice}>
                    <input
                      className={styles.choiceInput}
                      type="radio"
                      name="contactMethod"
                      value={value}
                      defaultChecked={aviso.contactMethod === value}
                    />
                    <span>{CONTACT_METHOD_LABEL[value]}</span>
                  </label>
                ))}
              </fieldset>

              <div>
                <label className={styles.label} htmlFor="contactValue">
                  {etiqueta("contactValue")}
                </label>
                <input
                  id="contactValue"
                  name="contactValue"
                  type="text"
                  className={styles.control}
                  defaultValue={aviso.contactValue}
                />
                {/* «El que reveló, reveló. Si entra de nuevo que vea el
                    contacto nuevo» (fundador, 2026-08-29). La evidencia del
                    revelado no guarda el valor, así que cambiarlo no reescribe
                    una sola fila de lo que ya pasó. */}
                <p className={styles.help}>Se muestra solo a quien inicie sesión.</p>
              </div>

              {/*
                **Quién publica: el valor sí, el control no.** El dominio refusa
                el CAMBIO con `publisherType.immutable`; esto es la otra mitad, y
                hacen falta las dos — una acción de servidor es un endpoint HTTP
                público, así que no dibujar el campo no prueba nada sobre lo que
                pasa cuando alguien lo manda igual. Y se dice en vez de callarse:
                el paso 9 prometió esta misma frase, y callarla acá dejaría a un
                dueño buscando un control que no existe.
              */}
              <div>
                <p className={styles.label}>{etiqueta("publisherType")}</p>
                <p className={styles.help}>{PUBLISHER_TYPE_LABEL[aviso.publisherType]}</p>
                <p className={styles.warning}>{PUBLISHER_TYPE_IMMUTABLE_NOTICE}</p>
              </div>

              <div className={styles.actions}>
                <button type="submit" className={styles.primary}>
                  Guardar cambios
                </button>
                <AppLink className={styles.secondary} href="/mis-avisos">
                  Cancelar
                </AppLink>
              </div>
            </form>
          </div>
        </Container>
      </main>
    </>
  );
}

/**
 * La etiqueta de un campo, de la ÚNICA lista de nombres en castellano del
 * repositorio (`CHANGE_FIELD_LABEL`). Sólo se pone en mayúscula la primera
 * letra: eso es presentación, no un nombre nuevo. Una segunda lista al lado de
 * aquélla es la que después queda diciendo el nombre viejo de un campo.
 */
function etiqueta(field: ChangedField): string {
  const label = CHANGE_FIELD_LABEL[field];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}
