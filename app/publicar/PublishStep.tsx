import { AppLink } from "@/../components/atoms/AppLink";
import { measureOf } from "../../src/modules/listing-publication/domain/carried-value";
import type {
  PublicationDraft,
  PublishStepId,
} from "../../src/modules/listing-publication/domain/publication-steps";
import {
  characterCount,
  MAX_REFERENCE_CHARACTERS,
  MAX_TITLE_CHARACTERS,
  MIN_DESCRIPTION_CHARACTERS,
  type PublishViolation,
} from "../../src/modules/listing-publication/domain/publishable-listing";
import {
  LISTING_VIOLATION_FIELD,
  type ListingField,
} from "../../src/modules/listing-publication/domain/violation-field";
import type { PublicationZoneOption } from "../../src/modules/listing-publication/domain/zone-search";
import { submitStep } from "./actions";
import { FieldError } from "./FieldError";
import { PhotoUploader } from "./fotos/PhotoUploader";
import styles from "./publish-steps.module.css";
import {
  DISCARD_CHANGE_LABEL,
  FEATURE_LABELS,
  STEP_COPY,
  STEP_MAP_TRIGGER_LABEL,
} from "./step-copy";
import {
  PUBLISH_VIOLATION_COPY,
  PUBLISHER_TYPE_IMMUTABLE_LEAD,
  PUBLISHER_TYPE_IMMUTABLE_STRESS,
} from "./violation-copy";

/**
 * Una pantalla del formulario de nueve pasos.
 *
 * **Sin una linea de JavaScript de cliente, salvo el paso 8.** Cada pantalla
 * es un `<form method="post">` nativo hacia una Server Action: se llena de
 * pie, en un telefono barato, antes de que llegue ningun bundle. El unico
 * lugar donde el diseno lo permite es comprimir las fotos en el dispositivo,
 * porque es la diferencia entre subir 30 MB y subir 1 — y ese componente ya
 * estaba construido.
 *
 * **Aca no vive ninguna regla.** Cual es el paso siguiente, cual esta hecho,
 * cual es navegable, que dice el boton y que cambio lo contesta
 * `publication-steps`; que texto lleva cada cosa lo contesta `step-copy`.
 * Este archivo dibuja lo que esas dos le dicen.
 */

export interface RailEntry {
  readonly id: PublishStepId;
  readonly number: number;
  readonly label: string;
  readonly summary: string | null;
  readonly done: boolean;
  readonly navigable: boolean;
  readonly current: boolean;
}

export interface PublishStepProps {
  readonly stepId: PublishStepId;
  readonly draft: PublicationDraft;
  /** Solo las de ESTE paso. Un error de fotos en el paso 3 es un callejon. */
  readonly violations: readonly PublishViolation[];
  /** Lo tecleado que no sobrevivio al parseo, para mostrarlo con su error. */
  readonly raw?: Readonly<Record<string, string>>;
  readonly rail: readonly RailEntry[];
  /**
   * Los pasos a los que ESTE paso puede saltar, para el mapa de movil (18.17).
   *
   * **Lo decide `jumpableStepsFrom`, no esta pantalla**, y llega como prop
   * requerida a proposito: opcional dejaria que un renderer nuevo se olvidara
   * de pasarla y el mapa desapareceria en silencio, que es exactamente la forma
   * de defecto que este cambio ya encontro seis veces (AGENTS.md §1).
   */
  readonly jumpable: readonly PublishStepId[];
  readonly progress: number;
  readonly returningToReview: boolean;
  /**
   * Adonde lleva «Descartar el cambio», o `null` cuando este paso no lo ofrece.
   *
   * **La decision la toma `offersDiscardToReview`, no esta pantalla**: obligar a
   * que llegue resuelto es lo que impide que un `if` de producto termine
   * viviendo en un componente sin piso de cobertura (AGENTS.md §1).
   */
  readonly discardHref: string | null;
  readonly primaryLabel: string;
  readonly previousStep: PublishStepId | null;
  /** Resultados del buscador del paso 2 y lo que se escribio para buscarlos. */
  readonly zoneQuery?: string;
  readonly zoneResults?: readonly PublicationZoneOption[];
  readonly zoneName?: string;
}

function errorsByField(violations: readonly PublishViolation[], draft: PublicationDraft) {
  const errors = new Map<ListingField, string>();
  for (const violation of violations) {
    // A qué campo pertenece lo contesta el dominio (tasks.md 18.22); acá sólo
    // se elige la frase. La pantalla de editar lee la MISMA tabla.
    const field = LISTING_VIOLATION_FIELD[violation];
    if (errors.has(field)) continue;
    errors.set(
      field,
      // **Medidas y no texto** (tasks.md 18.25): lo que el contador dibuja es
      // un número, y es acá —donde el borrador recién guardado está a mano—
      // donde se cuenta. `undefined` cuando el campo no se contestó, para que
      // la frase no dibuje un cero que nadie escribió.
      PUBLISH_VIOLATION_COPY[violation].message({
        descriptionLength: measureOf(draft.listing.description),
        titleLength: measureOf(draft.listing.title),
      }),
    );
  }
  return errors;
}

function characters(value: string | undefined): number {
  // Puntos de codigo, igual que el validador: con `String.length` el contador
  // de la pantalla le daria a un emoji el doble de lo que la regla le da.
  return characterCount(value ?? "");
}

export function PublishStep(props: PublishStepProps) {
  const { stepId, draft, rail, progress, returningToReview, primaryLabel, previousStep } = props;
  const copy = STEP_COPY[stepId];
  const errors = errorsByField(props.violations, draft);

  // El mapa reusa las mismas entradas del riel: el numero, el ✓ y el valor ya
  // vienen resueltos, asi que el telefono no arma una segunda anatomia de fila.
  const mapEntries = rail.filter((entry) => props.jumpable.includes(entry.id));

  const backHref = previousStep
    ? `/publicar/paso/${previousStep}${returningToReview ? "?volver=revisar" : ""}`
    : null;

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          {/* Un paso atras: la flecha en movil, el mismo enlace nombrado en
              escritorio. 44px de area tactil, la regla que mas se olvida. */}
          {backHref ? (
            <AppLink className={styles.back} href={backHref} aria-label="Volver al paso anterior">
              ←
            </AppLink>
          ) : (
            <p className={styles.brand}>rentas.</p>
          )}

          {/* **El mapa, que es lo que en 360 reemplaza al riel** (18.17). El
              contador ya decia cuanto falta; abrirlo es lo que agrega poder
              hacer algo al respecto, y no cuesta un renglon de alto porque la
              hoja se dibuja ENCIMA de la pantalla, no dentro del flujo.

              `<details>` y no un panel propio, el mismo mecanismo que el menu
              ⋯ de las fotos: abre con un toque y con Enter sin una linea de
              JavaScript, y adentro hay enlaces de verdad. Con el script
              apagado funciona igual, que es el piso de §2.

              Sin ningun salto posible NO se dibuja: un desplegable vacio es un
              control que no puede hacer nada (AGENTS.md §7). */}
          {mapEntries.length > 0 ? (
            <details className={styles.map}>
              <summary className={styles.mapTrigger} aria-label={STEP_MAP_TRIGGER_LABEL}>
                {copy.number} / {rail.length}
              </summary>
              <ol className={styles.mapSheet}>
                {mapEntries.map((entry) => (
                  <li key={entry.id}>
                    <AppLink className={styles.mapItem} href={`/publicar/paso/${entry.id}`}>
                      <span className={styles.mapNumber} aria-hidden="true">
                        {entry.done ? "✓" : entry.number}
                      </span>
                      {/* El valor y no el numero, igual que el riel: «Altamira»
                          dice a donde se vuelve, «2» no dice nada. */}
                      <span>{entry.summary ?? entry.label}</span>
                    </AppLink>
                  </li>
                ))}
              </ol>
            </details>
          ) : (
            <span className={styles.counter}>
              {copy.number} / {rail.length}
            </span>
          )}

          {/* Lo unico que dice que el borrador sobrevive. Sin esto nadie sabe
              si puede cerrar la pantalla. */}
          <span className={styles.saved}>Guardado</span>

          {/* Salida siempre visible (regla 5 de la seccion 4). */}
          <AppLink className={styles.exit} href="/" aria-label="Salir de publicar">
            ×
          </AppLink>
        </div>

        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ inlineSize: `${progress}%` }} />
        </div>
      </header>

      <div className={styles.layout}>
        <Rail rail={rail} returningToReview={returningToReview} />

        <main className={styles.column}>
          <h1 className={styles.title}>{copy.question}</h1>
          {copy.help ? <p className={styles.help}>{copy.help}</p> : null}

          {/* El buscador del paso 2 es un GET aparte: un formulario dentro de
              otro no es HTML valido, y buscar no debe guardar nada. */}
          {stepId === "zona" ? <ZoneSearch query={props.zoneQuery} /> : null}

          <form action={submitStep} method="post" className={styles.form}>
            <input type="hidden" name="step" value={stepId} />
            {/* Lo que hace que el boton diga "Guardar y volver a revisar" y que
                el destino sea revisar y no el paso siguiente. */}
            {returningToReview ? <input type="hidden" name="volver" value="revisar" /> : null}

            <StepFields {...props} errors={errors} />

            <div className={styles.actions}>
              <button type="submit" className={styles.primary}>
                {primaryLabel}
              </button>
              {backHref ? (
                <AppLink className={styles.secondary} href={backHref}>
                  Atrás
                </AppLink>
              ) : null}
              {/* Nivel neutro de la jerarquia de botones, la misma fila que
                  "Atrás" — y un ENLACE, no un boton: no postea nada, porque
                  descartar es irse antes de escribir. */}
              {props.discardHref ? (
                <AppLink className={styles.secondary} href={props.discardHref}>
                  {DISCARD_CHANGE_LABEL}
                </AppLink>
              ) : null}
            </div>
          </form>

          {/* La otra mitad del paso 5. Un formulario propio porque sin
              JavaScript nada puede destildar las casillas al enviar: este
              postea el paso SIN ninguna, que es exactamente lo que
              "No tiene ninguna" significa. */}
          {stepId === "atributos" ? (
            <form action={submitStep} method="post">
              <input type="hidden" name="step" value="atributos" />
              {returningToReview ? <input type="hidden" name="volver" value="revisar" /> : null}
              <button type="submit" className={styles.secondary}>
                No tiene ninguna
              </button>
            </form>
          ) : null}
        </main>
      </div>
    </div>
  );
}

/**
 * El riel de nueve pasos, que en 1280 reemplaza a la barra de progreso.
 *
 * **Un paso hecho muestra su valor y es un enlace; uno que falta no lo es.**
 * Esa asimetria es el criterio de aceptacion 10 dibujado: no se salta a algo
 * sin contestar, porque asi es como se llega a revisar con huecos que nadie
 * vio. El servidor lo vuelve a comprobar en la pagina del paso — un enlace
 * ausente no es una garantia, es una cortesia.
 */
function Rail({
  rail,
  returningToReview,
}: {
  rail: readonly RailEntry[];
  returningToReview: boolean;
}) {
  return (
    <nav aria-label="Progreso">
      <ol className={styles.rail}>
        {rail.map((entry) => {
          const className = [
            styles.railItem,
            entry.done ? styles.railDone : "",
            entry.current ? styles.railCurrent : "",
          ]
            .filter(Boolean)
            .join(" ");

          const label = entry.summary ?? entry.label;

          return (
            <li key={entry.id} className={className}>
              <span className={styles.railNumber} aria-hidden="true">
                {entry.done ? "✓" : entry.number}
              </span>
              {entry.navigable && !entry.current ? (
                <AppLink href={`/publicar/paso/${entry.id}`}>{label}</AppLink>
              ) : (
                <span>{label}</span>
              )}
            </li>
          );
        })}
      </ol>

      {/* "Volver a revisar" fijo al pie del riel: no hay que recorrer los pasos
          de nuevo para salir de una correccion. */}
      {returningToReview ? (
        <AppLink className={styles.railExit} href="/publicar/revisar">
          ↩ Volver a revisar
        </AppLink>
      ) : null}
    </nav>
  );
}

function ZoneSearch({ query }: { query: string | undefined }) {
  return (
    <form method="get" className={styles.search}>
      {/* El control ya dice que hacer, asi que no lleva subtitulo (regla
          transversal 3). */}
      {/* La etiqueta existe igual, invisible: un `placeholder` desaparece en
          cuanto se escribe, y un lector de pantalla no lo anuncia como nombre
          del campo. */}
      <label className={styles.srOnly} htmlFor="q">
        Buscá tu zona
      </label>
      <input
        id="q"
        name="q"
        type="search"
        className={styles.control}
        defaultValue={query ?? ""}
        placeholder="Buscá tu zona"
      />
      <button type="submit" className={styles.searchButton}>
        Buscar
      </button>
    </form>
  );
}

interface FieldsProps extends PublishStepProps {
  readonly errors: Map<ListingField, string>;
}

function StepFields(props: FieldsProps) {
  const { draft, errors, raw } = props;
  const { listing } = draft;

  switch (props.stepId) {
    case "tipo":
      return (
        <fieldset className={styles.choices}>
          <legend className={styles.srOnly}>Tipo de propiedad</legend>
          <FieldError id="propertyType-error" message={errors.get("propertyType")} />
          {/* Sin `defaultChecked` en ninguna, y no puede agregarse: el dominio
              rechaza un tipo ausente y no aplica default, para que un anexo no
              se publique como apartamento por un olvido. */}
          {(
            [
              ["apartamento", "Apartamento"],
              ["casa", "Casa"],
              ["quinta", "Quinta"],
              ["anexo", "Anexo"],
              ["habitacion", "Habitación"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={styles.choice}>
              <input
                className={styles.choiceInput}
                type="radio"
                name="propertyType"
                value={value}
                defaultChecked={listing.propertyType === value}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      );

    case "zona":
      return (
        <>
          <FieldError id="zoneId-error" message={errors.get("zoneId") ?? errors.get("cityId")} />

          {props.zoneResults && props.zoneResults.length > 0 ? (
            <ul className={styles.results}>
              {props.zoneResults.map((option) => (
                <li key={option.zoneId}>
                  <label className={styles.choice}>
                    <input
                      className={styles.choiceInput}
                      type="radio"
                      name="zoneId"
                      value={option.zoneId}
                      defaultChecked={listing.zoneId === option.zoneId}
                    />
                    <span>
                      {option.label}
                      {/* Municipio y ciudad: es lo unico que desambigua dos
                          nombres iguales en ciudades distintas. */}
                      <span className={styles.resultScope}>{option.scope}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}

          {/* La zona ya elegida sigue enviandose aunque la busqueda no la
              muestre: sin esto, volver al paso 2 y no buscar nada borraria la
              zona guardada. */}
          {listing.zoneId &&
          !props.zoneResults?.some((option) => option.zoneId === listing.zoneId) ? (
            <label className={styles.choice}>
              <input
                className={styles.choiceInput}
                type="radio"
                name="zoneId"
                value={listing.zoneId}
                defaultChecked
              />
              <span>{props.zoneName ?? listing.zoneId}</span>
            </label>
          ) : null}

          {/* No es decorativa. Con lista cerrada, una zona faltante deja al
              dueño trabado, y de paso indica dónde hay demanda. */}
          <p className={styles.escape}>
            ¿No está la tuya?{" "}
            <AppLink
              className={styles.escapeLink}
              href="mailto:hola@rentas.com.ve?subject=Falta%20mi%20zona"
            >
              Avisanos
            </AppLink>
          </p>

          <div>
            {/* La seña tiene su propia negativa desde la 18.7, y por eso su
                propio `FieldError`: el de arriba pertenece a la zona, y un
                mensaje de zona colgado de este campo diría que la seña está
                mal. Dos controles en un paso son dos anuncios. */}
            <FieldError id="reference-error" message={errors.get("reference")} />
            <label className={styles.label} htmlFor="reference">
              Referencia
            </label>
            <input
              id="reference"
              name="reference"
              type="text"
              className={`${styles.control} ${errors.get("reference") ? styles.controlInvalid : ""}`}
              defaultValue={listing.reference ?? ""}
              placeholder="Frente a la plaza"
              // El doble del tope, igual que el título: el navegador frena el
              // pegado accidental y la regla la sigue diciendo el servidor,
              // que es el único lado que la importación también atraviesa.
              maxLength={MAX_REFERENCE_CHARACTERS * 2}
              aria-invalid={errors.get("reference") ? "true" : undefined}
              aria-describedby={errors.get("reference") ? "reference-error" : undefined}
            />
            <p className={styles.help}>Opcional. No se publica la dirección.</p>
          </div>
        </>
      );

    case "precio":
      return (
        <div>
          <FieldError id="priceUsd-error" message={errors.get("priceUsd")} />
          <div className={styles.price}>
            <span className={styles.priceSign} aria-hidden="true">
              $
            </span>
            <label className={styles.srOnly} htmlFor="priceUsd">
              Precio mensual en dólares
            </label>
            {/* `inputMode` y no `type="number"`: un campo numerico esconde lo
                que se tecleo cuando no puede parsearlo, y esta pantalla
                devuelve el valor ofensivo al lado de su mensaje. */}
            <input
              id="priceUsd"
              name="priceUsd"
              type="text"
              inputMode="numeric"
              className={`${styles.control} ${styles.priceControl} ${errors.get("priceUsd") ? styles.controlInvalid : ""}`}
              defaultValue={raw?.priceUsd ?? listing.priceUsd ?? ""}
              aria-invalid={errors.get("priceUsd") ? "true" : undefined}
              aria-describedby={errors.get("priceUsd") ? "priceUsd-error" : undefined}
            />
          </div>
        </div>
      );

    case "tamano":
      return (
        <div className={styles.numbers}>
          <FieldError
            id="tamano-error"
            message={
              errors.get("rooms") ??
              errors.get("bathrooms") ??
              errors.get("areaM2") ??
              errors.get("parkingSpots")
            }
          />
          {(
            [
              ["rooms", "Habitaciones", listing.rooms],
              ["bathrooms", "Baños", listing.bathrooms],
              // Cero es una respuesta, no un hueco: un anexo sin puesto es un
              // aviso normal, y nadie deberia tener que escribir el cero.
              ["parkingSpots", "Puestos de auto", listing.parkingSpots ?? 0],
              ["areaM2", "Metros cuadrados", listing.areaM2],
            ] as const
          ).map(([name, label, value]) => (
            <div key={name} className={styles.numberRow}>
              <label className={styles.label} htmlFor={name}>
                {label}
              </label>
              <input
                id={name}
                name={name}
                type="text"
                inputMode="numeric"
                className={`${styles.control} ${styles.numberControl}`}
                defaultValue={raw?.[name] ?? value ?? ""}
              />
            </div>
          ))}
        </div>
      );

    case "atributos":
      return (
        <fieldset className={styles.choices}>
          <legend className={styles.srOnly}>Qué tiene la propiedad</legend>
          {FEATURE_LABELS.map(([field, label]) => (
            <label key={field} className={styles.choice}>
              <input
                className={styles.choiceInput}
                type="checkbox"
                name={field}
                defaultChecked={listing[field] === true}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      );

    case "titulo": {
      const written = characters(listing.title);
      return (
        <div>
          <FieldError id="title-error" message={errors.get("title")} />
          <label className={styles.srOnly} htmlFor="title">
            Título
          </label>
          <input
            id="title"
            name="title"
            type="text"
            className={`${styles.control} ${errors.get("title") ? styles.controlInvalid : ""}`}
            defaultValue={listing.title ?? ""}
            maxLength={MAX_TITLE_CHARACTERS * 2}
            aria-invalid={errors.get("title") ? "true" : undefined}
            aria-describedby={errors.get("title") ? "title-error" : undefined}
          />
          <p className={styles.counterLine}>
            <span>Sin mayúsculas sostenidas.</span>
            <span>
              {written} / {MAX_TITLE_CHARACTERS}
            </span>
          </p>

          {/* "Así se va a ver". Se dibuja con lo GUARDADO, no con lo que se
              está tecleando: una vista en vivo necesitaría JavaScript, y esta
              pantalla no lo tiene. */}
          <div className={styles.preview}>
            <p className={styles.previewLabel}>Así se va a ver</p>
            <p className={styles.previewPrice}>${listing.priceUsd ?? "—"}</p>
            <p className={styles.previewTitle}>{listing.title ?? "Tu título"}</p>
            <p className={styles.previewMeta}>
              {props.zoneName ?? "Tu zona"} · {listing.rooms ?? "—"} hab · {listing.areaM2 ?? "—"}{" "}
              m²
            </p>
          </div>
        </div>
      );
    }

    case "descripcion": {
      const written = characters(listing.description);
      const missing = Math.max(0, MIN_DESCRIPTION_CHARACTERS - written);
      return (
        <div>
          <FieldError id="description-error" message={errors.get("description")} />
          <label className={styles.srOnly} htmlFor="description">
            Descripción
          </label>
          <textarea
            id="description"
            name="description"
            rows={8}
            className={`${styles.control} ${styles.textarea} ${errors.get("description") ? styles.controlInvalid : ""}`}
            defaultValue={listing.description ?? ""}
            aria-invalid={errors.get("description") ? "true" : undefined}
            aria-describedby={errors.get("description") ? "description-error" : undefined}
          />
          {/* Un minimo se muestra como progreso, no como castigo. */}
          <div className={styles.meter}>
            <div
              className={styles.meterFill}
              style={{
                inlineSize: `${Math.min(100, Math.round((written / MIN_DESCRIPTION_CHARACTERS) * 100))}%`,
              }}
            />
          </div>
          <p className={styles.counterLine}>
            <span className={missing > 0 ? styles.counterShort : undefined}>
              {missing > 0 ? `te faltan ${missing} caracteres` : "ya alcanza"}
            </span>
            <span>
              {written} / {MIN_DESCRIPTION_CHARACTERS}
            </span>
          </p>
        </div>
      );
    }

    case "fotos":
      return (
        <>
          <FieldError id="photos-error" message={errors.get("photos")} />
          <PhotoUploader initial={draft.photos} />
        </>
      );

    case "quien":
      return (
        <>
          <fieldset className={styles.choices}>
            <legend className={styles.legend}>¿Quién publica?</legend>
            <FieldError id="publisherType-error" message={errors.get("publisherType")} />
            {/* Sin default, y no puede agregarse: un default convertiria "al
                que se le olvido" en "todos son duenos", y esa distincion es la
                garantia de confianza central del producto. */}
            {(
              [
                ["owner", "Soy el dueño"],
                ["broker", "Inmobiliaria o corredor"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={styles.choice}>
                <input
                  className={styles.choiceInput}
                  type="radio"
                  name="publisherType"
                  value={value}
                  defaultChecked={listing.publisherType === value}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          {/* La advertencia va ANTES, no despues de publicar. Declararlo mal
              es motivo de baja, y nadie puede corregirlo despues. */}
          <p className={styles.warning}>
            {PUBLISHER_TYPE_IMMUTABLE_LEAD}
            <strong>{PUBLISHER_TYPE_IMMUTABLE_STRESS}</strong>.
          </p>

          <fieldset className={styles.choices}>
            <legend className={styles.legend}>¿Cómo te contactan?</legend>
            <FieldError
              id="contact-error"
              message={errors.get("contactMethod") ?? errors.get("contactValue")}
            />
            {(
              [
                ["whatsapp", "WhatsApp"],
                ["telefono", "Llamada"],
                ["email", "Correo"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={styles.choice}>
                <input
                  className={styles.choiceInput}
                  type="radio"
                  name="contactMethod"
                  value={value}
                  defaultChecked={listing.contactMethod === value}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <div>
            <label className={styles.label} htmlFor="contactValue">
              Tu dato de contacto
            </label>
            <input
              id="contactValue"
              name="contactValue"
              type="text"
              className={`${styles.control} ${errors.get("contactValue") ? styles.controlInvalid : ""}`}
              defaultValue={listing.contactValue ?? ""}
            />
            {/* El boton de la ficha toma su texto del metodo: decir "Ver
                WhatsApp" sobre un correo es una promesa que el producto no
                cumple. */}
            <p className={styles.help}>Se muestra solo a quien inicie sesión.</p>
          </div>
        </>
      );
  }
}
