import type { SessionPort } from "../../identity/application/ports/session.port";
import type { ContactVerificationEvidencePort } from "../../identity/application/ports/verified-contact.port";
import { contactVerificationNotice } from "../domain/contact-verification-notice";
import type {
  ContactAvailability,
  ContactMethod,
  ContactPresentation,
} from "../domain/revealable-contact";
import { presentListingContact } from "../domain/revealable-contact";
import type { ContactRevealMetricsPort } from "./ports/contact-reveal-metrics.port";
import type { RevealMessageHistoryPort } from "./ports/reveal-rate-limit.port";
import type { RevealableListingPort } from "./ports/revealable-listing.port";

/**
 * El lado de LECTURA de la revelación: qué muestra la ficha cuando se dibuja.
 *
 * `revealContact` escribe el evento; esto responde la otra mitad, que sin ella
 * la revelación no se ve. El formulario de la ficha no lleva JavaScript, así
 * que la acción de servidor termina en un re-render de la misma pantalla —
 * y esa pantalla tiene que volver a preguntarse, desde cero y en cada visita,
 * si quien mira ya reveló. El resultado de la acción no sobrevive al viaje.
 *
 * **El método y el estado los trae la ficha, que ya los leyó.** Repetir esa
 * consulta acá costaría un segundo viaje HTTP a Neon en la pantalla más
 * visitada del sitio, y ninguno de los dos datos es sensible: el canal es
 * exactamente lo que el botón bloqueado ya anuncia.
 */
/**
 * Lo que la ficha dibuja del bloque de contacto: el estado, y lo que la
 * pantalla afirma sobre su verificación (tasks.md 16.12 y 16.34).
 *
 * **Los dos viajan juntos y no como dos props sueltas de la página.** La
 * ficha pasaba `verifiedAt={null}` escrito a mano —un dato que ninguna
 * consulta llenaba nunca—, que es la forma exacta del defecto que este
 * repositorio ya encontró con `resultsOrigin`: un módulo probado al 100% y
 * muerto en producción porque su llamador nunca le pasó el argumento.
 *
 * `null` significa que no hay nada que decir, y es la respuesta normal: sin
 * fila en `verified_contact` la pantalla no dibuja ninguna línea.
 */
export interface ListingContactView {
  readonly contact: ContactPresentation;
  readonly verificationNotice: string | null;
}

export interface ViewListingContactRequest {
  readonly listingId: string;
  readonly method: ContactMethod;
  readonly availability: ContactAvailability;
}

export interface ViewListingContactDependencies {
  readonly sessionPort: SessionPort;
  readonly listings: RevealableListingPort;
  /**
   * La vista de pares únicos, no una consulta nueva. Su propio puerto lo dice:
   * "¿este inquilino ya reveló este aviso?" es la misma pregunta que la
   * métrica, y un segundo puerto sería un segundo lugar donde el nombre de la
   * vista queda escrito.
   */
  readonly reveals: ContactRevealMetricsPort;
  /**
   * tasks.md 6.14 — "the contact action opens with the submitted message
   * already written". Only ever consulted once `hasRevealed` is already
   * known true: a visitor who never revealed has no message to leak, and
   * this stays a fourth database read no locked render ever pays for.
   */
  readonly messages: RevealMessageHistoryPort;
  /**
   * tasks.md 16.12 — el instante que la F29 pide («desde cuándo está
   * verificado») ES `verified_contact.verified_at`, y se lee con la consulta
   * que la 19.9 dejó montada: una sola, por el triple (cuenta, método,
   * valor), sin una segunda regla.
   *
   * Sólo se consulta en la rama revelada, así que ninguna visita anónima —la
   * mayoría, en la pantalla más visitada del sitio— la paga.
   */
  readonly verification: ContactVerificationEvidencePort;
}

export async function viewListingContact(
  request: ViewListingContactRequest,
  dependencies: ViewListingContactDependencies,
): Promise<ListingContactView> {
  const { sessionPort, listings, reveals, messages, verification } = dependencies;

  /** Sin valor revelado no hay contacto del que hablar, así que no hay frase. */
  const sinVerificacion = (contact: ContactPresentation): ListingContactView => ({
    contact,
    verificationNotice: null,
  });

  // Un aviso vencido no tiene contacto para nadie, así que no hay nada que
  // preguntar: ni sesión, ni métrica, ni catálogo. La regla es del dominio;
  // lo que se decide acá es no gastar tres viajes en llegar a ella.
  if (request.availability === "expired") {
    return sinVerificacion(presentListingContact({ ...request, value: null }, null));
  }

  const session = await sessionPort.getSession();
  if (!session) {
    return sinVerificacion(presentListingContact({ ...request, value: null }, null));
  }

  // Las dos claves, siempre. Con una sola el fallo es enorme y mudo: por
  // aviso, el primero que revela se lo abre a todos; por inquilino, revelar
  // un aviso abre todos los avisos. Las dos versiones devuelven filas.
  const pairs = await reveals.findUniquePairs({
    listingId: request.listingId,
    tenantUserId: session.userId,
  });
  const viewer = { hasRevealed: pairs.length > 0 };
  if (!viewer.hasRevealed) {
    return sinVerificacion(presentListingContact({ ...request, value: null }, viewer));
  }

  // Recién acá sale el valor de Postgres, y sólo para quien ya lo reveló.
  // `findRevealable` devuelve `null` si el aviso dejó de ser revelable entre
  // la revelación y este render — el evento sobrevive al aviso a propósito.
  // El mensaje viaja en el mismo tramo: dos lecturas independientes que no
  // dependen una de la otra, en paralelo en vez de en fila.
  const [listing, message] = await Promise.all([
    listings.findRevealable(request.listingId),
    messages.findLatestMessage(session.userId, request.listingId),
  ]);

  const contact = presentListingContact(
    {
      // El canal lo manda quien trae el valor: un rótulo que nombre otro canal
      // que el del número mostrado es la promesa que el producto no cumple.
      method: listing?.contactMethod ?? request.method,
      availability: request.availability,
      value: listing?.contactValue ?? null,
    },
    { ...viewer, message },
  );

  // **La cuenta es la del aviso y el contacto es el que el aviso copió al
  // publicar** (tasks.md 19.9/19.12). Preguntar con `session.userId` diría que
  // el número del dueño está verificado porque lo verificó el inquilino que
  // mira; preguntar sólo por la cuenta daría por bueno cualquier valor que
  // esa cuenta escriba después.
  //
  // Va DESPUÉS de `findRevealable` y no en paralelo porque necesita el valor
  // que aquélla trae. Es un viaje más, y sólo en el render de quien ya reveló.
  if (contact.state !== "revealed" || !listing) return sinVerificacion(contact);

  const evidence = await verification.findEvidence({
    userId: listing.publisherId,
    contact: { method: listing.contactMethod, value: listing.contactValue },
  });

  return {
    contact,
    // Qué dice la pantalla lo decide el dominio; acá sólo se junta lo que dos
    // puertos trajeron. `null` de `findEvidence` es una cuenta que no existe y
    // se lee igual que una sin fila: no verificado.
    verificationNotice: contactVerificationNotice(contact.method, evidence?.verifiedAt ?? null),
  };
}
