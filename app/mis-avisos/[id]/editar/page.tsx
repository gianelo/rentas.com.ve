import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DrizzleBulkImportAccounts } from "@/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import { homeSearchForm } from "@/modules/listing-catalogue/domain/search-destination";
import { photoAltText, photoUrl } from "@/modules/listing-discovery/domain/listing-photo-view";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import {
  EditListingNotFoundError,
  loadListingForEdit,
} from "@/modules/listing-publication/application/edit-listing";
import { loadListingPhotosForEdit } from "@/modules/listing-publication/application/edit-listing-photos";
import { readCarriedMeasure } from "@/modules/listing-publication/domain/carried-value";
import { COVER_PHOTO_INDEX } from "@/modules/listing-publication/domain/draft-photo-actions";
import { editablePublisherTypes } from "@/modules/listing-publication/domain/listing-edit";
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
  PROPERTY_TYPE_LABEL,
  PUBLISHER_TYPE_LABEL,
} from "../../../publicar/step-copy";
import {
  listingEditViolationMessage,
  PUBLISHER_TYPE_ONE_WAY_NOTICE,
  type PublishCopyContext,
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
        thumbnails: new DrizzleListingPhotoSet(db),
      },
    ).catch((error: unknown) => {
      if (error instanceof EditListingNotFoundError) return [];
      throw error;
    }),
  ]);

  if (!aviso) notFound();

  /**
   * **Después del `notFound()`, y el orden es la garantía.** Un aviso ajeno se
   * contesta como uno inexistente pase lo que pase con la configuración: leer
   * la base antes haría que un despliegue sin `R2_BUCKET_PUBLIC_URL`
   * distinguiera un id ajeno (500) de uno inventado (404), que es exactamente
   * lo que `loadListingForEdit` se escribió para cerrar.
   *
   * **Y se niega en vez de dibujar de menos** (AGENTS.md §7). Volver en
   * silencio al ordinal sería regresar al daño que la 18.26 cierra —elegir
   * entre seis fotos parecidas por un número— con la diferencia de que ahora
   * nadie lo vería: un despliegue mal configurado se vería igual que uno
   * correcto.
   */
  const fotosBaseUrl = readPhotoPublicBaseUrl();

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

  /**
   * **El contador cuenta lo que se envió, o no cuenta** (tasks.md 18.25).
   *
   * Antes esto era `{ title: aviso.title }` y el «Vas N» de la descripción
   * salía 0, porque lo que se acababa de escribir no volvía. Pasarle
   * `aviso.description` habría dicho el largo de la GUARDADA, que tampoco es la
   * que se rechazó: las dos son un número que nadie escribió. Lo que vuelve es
   * la medida de lo enviado, que es lo único que la frase dibuja y lo único que
   * cabe en una dirección (18.19).
   *
   * **Un parámetro es una afirmación de afuera** (AGENTS.md §7):
   * `readCarriedMeasure` devuelve nada ante lo ausente y ante lo inventado, y
   * la frase sale sin contador antes que con un número falso.
   */
  const medidas: PublishCopyContext = {
    titleLength: readCarriedMeasure(query.largoTitulo),
    descriptionLength: readCarriedMeasure(query.largoDescripcion),
  };

  const mensaje = (field: ListingField): string | undefined => {
    const codigo = negativas.byField.get(field);
    return codigo === undefined ? undefined : listingEditViolationMessage(codigo, medidas);
  };
  const invalido = (field: ListingField) =>
    negativas.byField.has(field)
      ? { "aria-invalid": "true" as const, "aria-describedby": `${field}-error` }
      : {};
  const claseControl = (field: ListingField) =>
    negativas.byField.has(field) ? ` ${styles.controlInvalid}` : "";

  // Vacía para una inmobiliaria, que no tiene a dónde ir (18.38).
  const publisherTypes = editablePublisherTypes(aviso.publisherType);

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
                  .map((motivo) => listingEditViolationMessage(motivo, medidas))
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
                {fotos.map((foto, index) => (
                  <li key={foto.photoId} className={styles.photoRow}>
                    {/*
                      **La foto, no su ordinal** (tasks.md 18.26). Antes de
                      esto el renglón decía «Foto 4» y nada más, así que quien
                      tiene seis parecidas elegía a ciegas y podía quitar la
                      que no era, sobre su propio aviso y sin vuelta atrás.

                      `<img>` y no `next/image` por la misma razón que la
                      cuadrícula y el visor: el optimizador de la plataforma es
                      un recurso medido del plan gratuito, y estas derivadas ya
                      salen de R2 con egreso cero.

                      **La miniatura, nunca la foto entera**: los cuatro
                      tamaños existen para que un teléfono con datos caros no
                      descargue seis imágenes de pantalla completa para elegir
                      una.

                      **Una foto sin derivada conserva su renglón**, sin
                      `<img>`: filtrarla dejaría una fila que el aviso muestra
                      y su dueño no puede sacar, porque este renglón es el
                      único camino para quitarla (AGENTS.md §7).
                    */}
                    {foto.thumbKey === null ? null : (
                      /* `next/image` optimiza contra un servicio medido del
                         plan gratuito; estas derivadas YA se generaron una vez
                         al subir, en cuatro tamaños, justamente para salir de
                         R2 con egreso cero. Pasarlas por el optimizador
                         gastaría una transformación paga por una imagen que ya
                         está en el tamaño que se dibuja. */
                      // biome-ignore lint/performance/noImgElement: derivada ya generada, egreso cero desde R2
                      <img
                        className={styles.photoThumb}
                        src={photoUrl(fotosBaseUrl, foto.thumbKey)}
                        /* **El texto alternativo es producto, no decoración**,
                           y lo compone el dominio: la posición va primero
                           porque quien usa lector de pantalla necesita saber
                           dónde está antes que qué mira. Un `alt="foto"`
                           escrito acá sería peor que ninguno. Sin zona: el
                           dueño ya sabe dónde está su aviso, y traerla pediría
                           una segunda lectura para una coma. */
                        alt={photoAltText({
                          position: index,
                          total: fotos.length,
                          title: aviso.title,
                          zone: "",
                        })}
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <span className={styles.photoName}>
                      {nombreDeFoto(index)}
                      {index === COVER_PHOTO_INDEX ? " (portada)" : ""}
                    </span>
                    {/* Un `<form>` de verdad: quitar funciona con el script
                        apagado, a diferencia de agregar, que comprime en el
                        teléfono antes de que los bytes salgan. */}
                    <form action={quitarFotoDelAviso} method="post">
                      <input type="hidden" name="listingId" value={aviso.id} />
                      <input type="hidden" name="photoId" value={foto.photoId} />
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
                    // Cero es una respuesta y no un hueco, igual que en el paso
                    // 4: se dibuja el cero en vez de dejar el campo vacío.
                    ["parkingSpots", aviso.parkingSpots],
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

              {/*
                **El tipo de inmueble y la referencia, desde la 18.27.** «Se
                puede corregir cualquier dato menos el de la zona» (fundador,
                2026-09-01). Los dos estaban cerrados porque la tabla campo por
                campo del 2026-08-29 no los nombraba, no porque cambiarlos
                rompiera nada: ninguno de los dos está en la URL del aviso.
              */}
              <fieldset
                className={styles.choices}
                aria-describedby={
                  negativas.byField.has("propertyType") ? "propertyType-error" : undefined
                }
              >
                <FieldError id="propertyType-error" message={mensaje("propertyType")} />
                <legend className={styles.legend}>{etiqueta("propertyType")}</legend>
                {Object.entries(PROPERTY_TYPE_LABEL).map(([value, label]) => (
                  <label key={value} className={styles.choice}>
                    <input
                      className={styles.choiceInput}
                      type="radio"
                      name="propertyType"
                      value={value}
                      defaultChecked={aviso.propertyType === value}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <div>
                <FieldError id="reference-error" message={mensaje("reference")} />
                <label className={styles.label} htmlFor="reference">
                  {etiqueta("reference")}
                </label>
                <input
                  id="reference"
                  name="reference"
                  type="text"
                  className={`${styles.control}${claseControl("reference")}`}
                  defaultValue={aviso.reference ?? ""}
                  {...invalido("reference")}
                />
                {/* Y se dice que se puede vaciar: es el único campo del aviso
                    donde borrar el contenido es una corrección válida, y sin la
                    frase nadie sabría que dejarlo en blanco la saca. */}
                <p className={styles.help}>Opcional. Dejala en blanco para sacarla.</p>
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
                **Quién publica, en un solo sentido** (tasks.md 18.38): dueño →
                inmobiliaria sí, la vuelta no. **A quién se le ofrece el control
                lo contesta el dominio** con `editablePublisherTypes`, no un
                `if` de esta pantalla — para una inmobiliaria la lista viene
                vacía porque no hay a dónde ir, y ofrecerle un control
                prometería algo que la guarda va a negar.

                **Y no dibujar el control nunca fue la garantía.** Una acción de
                servidor es un endpoint HTTP público, así que la mitad que de
                verdad cierra la dirección es la del dominio; ésta sólo evita
                prometer lo imposible.
              */}
              <fieldset
                className={styles.choices}
                aria-describedby={
                  negativas.byField.has("publisherType") ? "publisherType-error" : undefined
                }
              >
                <FieldError id="publisherType-error" message={mensaje("publisherType")} />
                <legend className={styles.legend}>{etiqueta("publisherType")}</legend>
                {publisherTypes.length === 0 ? (
                  <p className={styles.help}>{PUBLISHER_TYPE_LABEL[aviso.publisherType]}</p>
                ) : (
                  publisherTypes.map((value) => (
                    <label key={value} className={styles.choice}>
                      <input
                        className={styles.choiceInput}
                        type="radio"
                        name="publisherType"
                        value={value}
                        defaultChecked={aviso.publisherType === value}
                      />
                      <span>{PUBLISHER_TYPE_LABEL[value]}</span>
                    </label>
                  ))
                )}
                {/* **Antes de guardar, no después en una negativa.** Una vez
                    guardado `broker` la guarda cierra la vuelta, así que decirlo
                    recién en el rechazo llegaría cuando ya no evita nada. */}
                <p className={styles.warning}>{PUBLISHER_TYPE_ONE_WAY_NOTICE}</p>
              </fieldset>

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
