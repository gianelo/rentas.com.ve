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
import { loadListingPhotosForEdit } from "@/modules/listing-publication/application/edit-listing-photos";
import { COVER_PHOTO_INDEX } from "@/modules/listing-publication/domain/draft-photo-actions";
import type { ChangedField } from "@/modules/listing-publication/domain/publication-steps";
import {
  MAX_PHOTOS_PER_LISTING,
  MAX_TITLE_CHARACTERS,
  MIN_DESCRIPTION_CHARACTERS,
} from "@/modules/listing-publication/domain/publishable-listing";
import {
  type ListingField,
  placeListingEditViolations,
} from "@/modules/listing-publication/domain/violation-field";
import {
  DrizzleListingEdit,
  DrizzleListingPhotoSet,
} from "@/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { db } from "@/shared/db/client";
import { AppLink } from "../../../../components/atoms/AppLink";
import { Container } from "../../../../components/layout/Container";
import type { SearchPillProps } from "../../../../components/molecules/SearchPill";
import { Nav } from "../../../../components/organisms/Nav";
import { requireSession } from "../../../_lib/require-session";
import { FieldError } from "../../../publicar/FieldError";
import {
  coverChangedNotice,
  PHOTO_ACTION_COPY,
  photoActionLabel,
  photoRemovalRefusalMessage,
} from "../../../publicar/photo-action-copy";
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
import {
  adjuntarFotoAlAviso,
  guardarEdicion,
  pedirDestinoDeFotoDelAviso,
  quitarFotoDelAviso,
} from "../../actions";
import { SubirFoto } from "../../SubirFoto";

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
 * **Las fotos se agregan y se quitan acá desde la 18.21**, y con su propio
 * `<form>` cada una: no viajan con «Guardar cambios» porque no son un campo
 * del pedido — `photoCount` sale de contar filas y nunca de la edición. Quién
 * puede agregar y quitar lo contesta `edit-listing-photos.ts` con la MISMA
 * puerta que esta pantalla ya usó para leer el aviso; el piso, el tope y el
 * ascenso de la portada los contesta el dominio.
 *
 * **Dónde se lee cada negativa lo decide el dominio** (tasks.md 18.22): antes
 * del campo que la produjo y anunciada, como hacen los nueve pasos, con el
 * MISMO `FieldError`. El bloque de arriba queda sólo para lo que una edición no
 * manda y para un código inventado en la dirección.
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

  const [bulkImportAccount, aviso, fotos] = await Promise.all([
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
    // La MISMA puerta, así que un aviso ajeno tampoco muestra sus fotos y sale
    // por el mismo `notFound()`.
    loadListingPhotosForEdit(
      { listingId: id },
      {
        sessionPort: nextAuthSessionPort,
        listings: new DrizzleListingEdit(db),
        order: new DrizzleListingPhotoSet(db),
      },
    ).catch((error: unknown) => {
      if (error instanceof EditListingNotFoundError) return [];
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

  // **Dónde va cada negativa lo decide el dominio** (tasks.md 18.22), no esta
  // pantalla: `placeListingEditViolations` reparte entre los campos que un
  // pedido de edición manda y las que no tienen ninguno. Acá sólo se dibuja lo
  // que ya viene decidido.
  const negativas = placeListingEditViolations(motivos);
  const mensaje = (field: ListingField): string | undefined => {
    const codigo = negativas.byField.get(field);
    return codigo === undefined
      ? undefined
      : listingEditViolationMessage(codigo, { title: aviso.title });
  };
  const invalido = (field: ListingField) =>
    negativas.byField.has(field)
      ? { "aria-invalid": "true" as const, "aria-describedby": `${field}-error` }
      : {};
  const claseControl = (field: ListingField) =>
    negativas.byField.has(field) ? ` ${styles.controlInvalid}` : "";

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

            {/*
              **Sólo las que no tienen campo en esta pantalla.** Las demás se
              leen al lado del control que las produjo, como hace publicar. Este
              bloque queda para lo que una edición no manda —fotos, zona,
              ciudad, tipo de inmueble, puestos— y para un código inventado en la
              dirección: tragárselas dejaría un formulario que se niega a guardar
              sin decir por qué (AGENTS.md §7).
            */}
            {negativas.elsewhere.length === 0 ? null : (
              <p className={styles.error} role="alert">
                No se pudo guardar:{" "}
                {negativas.elsewhere
                  .map((motivo) => listingEditViolationMessage(motivo, { title: aviso.title }))
                  .join(" · ")}
              </p>
            )}

            {/*
              **Las fotos, antes del formulario y fuera de él.** Cada una lleva
              su propio `<form method="post">`, así que anidarlas adentro del de
              guardar sería marcado inválido y haría que quitar una enviara la
              edición entera. Y se guardan al tocarlas: `photoCount` sale de
              contar filas, nunca de un campo del pedido.
            */}
            <section className={styles.choices} aria-labelledby="fotos-titulo">
              <h2 className={styles.legend} id="fotos-titulo">
                Fotos
              </h2>
              <p className={styles.help}>
                {fotos.length} de {MAX_PHOTOS_PER_LISTING}. La primera es la portada
                {PHOTO_ACTION_COPY.makeCover.hint === undefined
                  ? "."
                  : `: ${PHOTO_ACTION_COPY.makeCover.hint}.`}{" "}
                Se guardan al tocarlas, sin esperar a «Guardar cambios».
              </p>

              {/* La negativa vuelve como código, y la copia la decide la tabla
                  del paso 8 — no una segunda lista de castellano. */}
              {query.foto === undefined ? null : (
                <p className={styles.error} role="alert">
                  {photoRemovalRefusalMessage(query.foto)}
                </p>
              )}

              {/* Quien quita la portada cambió la cara del aviso sin pedirlo,
                  así que se anuncia con nombre en vez de callarse. */}
              {query.portada === "1" && fotos.length > 0 ? (
                <p className={styles.help} role="status">
                  {coverChangedNotice(nombreDeFoto(COVER_PHOTO_INDEX))}
                </p>
              ) : null}

              <ul className={styles.results}>
                {fotos.map((photoId, index) => (
                  <li key={photoId} className={styles.photoRow}>
                    <span>
                      {nombreDeFoto(index)}
                      {index === COVER_PHOTO_INDEX ? " (portada)" : ""}
                    </span>
                    {/* Un `<form>` de verdad: quitar funciona con el script
                        apagado, a diferencia de agregar, que comprime en el
                        teléfono antes de que los bytes salgan. */}
                    <form action={quitarFotoDelAviso} method="post">
                      <input type="hidden" name="listingId" value={aviso.id} />
                      <input type="hidden" name="photoId" value={photoId} />
                      <button
                        type="submit"
                        className={styles.secondary}
                        aria-label={photoActionLabel("remove", nombreDeFoto(index))}
                      >
                        {PHOTO_ACTION_COPY.remove.label}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>

              {/* Visible y no en un `title`: la especificación la marca como no
                  decorativa, y en un teléfono un `title` no aparece nunca. */}
              <p className={styles.help}>{PHOTO_ACTION_COPY.remove.hint}</p>

              {/* El MISMO componente que sube una foto a un borrador importado:
                  cambia la puerta del servidor, no la secuencia. */}
              <SubirFoto
                listingId={aviso.id}
                photoCount={fotos.length}
                firmar={pedirDestinoDeFotoDelAviso}
                adjuntar={adjuntarFotoAlAviso}
                exito="Foto agregada a tu aviso."
              />
            </section>

            <form action={guardarEdicion} method="post" className={styles.form}>
              {/* La acción vuelve a acotarlo a la sesión: que este campo diga
                  un id no es una afirmación sobre de quién es. */}
              <input type="hidden" name="listingId" value={aviso.id} />

              <div>
                {/* `FieldError` es el MISMO de los nueve pasos, movido a su
                    archivo en vez de copiado: dos maneras de anunciar un mismo
                    tipo de error es como un producto se contradice. */}
                <FieldError id="title-error" message={mensaje("title")} />
                <label className={styles.label} htmlFor="title">
                  {etiqueta("title")}
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  className={`${styles.control}${claseControl("title")}`}
                  defaultValue={aviso.title}
                  maxLength={MAX_TITLE_CHARACTERS * 2}
                  {...invalido("title")}
                />
              </div>

              <div>
                <FieldError id="description-error" message={mensaje("description")} />
                <label className={styles.label} htmlFor="description">
                  {etiqueta("description")}
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={8}
                  className={`${styles.control} ${styles.textarea}${claseControl("description")}`}
                  defaultValue={aviso.description}
                  {...invalido("description")}
                />
                <p className={styles.help}>Mínimo {MIN_DESCRIPTION_CHARACTERS} caracteres.</p>
              </div>

              <div>
                <FieldError id="priceUsd-error" message={mensaje("priceUsd")} />
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
                  className={`${styles.control}${claseControl("priceUsd")}`}
                  defaultValue={aviso.priceUsd}
                  {...invalido("priceUsd")}
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
                    <FieldError id={`${name}-error`} message={mensaje(name)} />
                    <label className={styles.label} htmlFor={name}>
                      {etiqueta(name)}
                    </label>
                    <input
                      id={name}
                      name={name}
                      type="text"
                      inputMode="numeric"
                      className={`${styles.control} ${styles.numberControl}${claseControl(name)}`}
                      defaultValue={value}
                      {...invalido(name)}
                    />
                  </div>
                ))}
              </div>

              {/* **El grupo, no un radio.** Tres opciones excluyentes no tienen
                  un control único al que apuntar, así que se describe el
                  conjunto y no se marca ninguno como el inválido — marcar el
                  primero diría que ése es el problema. */}
              <fieldset
                className={styles.choices}
                aria-describedby={
                  negativas.byField.has("contactMethod") ? "contactMethod-error" : undefined
                }
              >
                <FieldError id="contactMethod-error" message={mensaje("contactMethod")} />
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
                <FieldError id="contactValue-error" message={mensaje("contactValue")} />
                <label className={styles.label} htmlFor="contactValue">
                  {etiqueta("contactValue")}
                </label>
                <input
                  id="contactValue"
                  name="contactValue"
                  type="text"
                  className={`${styles.control}${claseControl("contactValue")}`}
                  defaultValue={aviso.contactValue}
                  {...invalido("contactValue")}
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
                {/* **El hueco que la 18.22 nombraba, cerrado.** Sin campo en la
                    tabla, `publisherType.immutable` era el único código que no
                    podía colocarse y salía arriba, lejos de lo que explica. No
                    lleva `aria-invalid`: no hay control que invalidar, que es
                    justamente lo que la negativa dice. */}
                <FieldError id="publisherType-error" message={mensaje("publisherType")} />
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

/**
 * Cómo se llama una foto de un aviso publicado.
 *
 * **Su posición es el único nombre que tiene**, y no es una carencia de esta
 * pantalla: `listing_photo` no guarda ni nombre de archivo ni `alt_text`, a
 * propósito —«pedirle a quien llena el formulario de pie y con una mano que
 * describa seis fotografías produce campos vacíos, no accesibilidad»—. Base
 * uno para quien lee, igual que `photoAltText`: «Foto 0» no es algo que nadie
 * diga en voz alta.
 */
function nombreDeFoto(index: number): string {
  return `Foto ${index + 1}`;
}
