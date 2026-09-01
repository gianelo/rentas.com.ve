import { readPublicationDraftOrExpiry } from "@/modules/listing-publication/application/publication-draft-session";
import {
  currentStepId,
  draftListingOf,
  type PublicationDraft,
  type PublishStepId,
} from "@/modules/listing-publication/domain/publication-steps";
import {
  type PublishViolation,
  validatePublishableListing,
} from "@/modules/listing-publication/domain/publishable-listing";
import { resolveZoneCity } from "@/modules/listing-publication/domain/zone-search";
import { DrizzleZoneCatalogue } from "@/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { DrizzleZoneVocabulary } from "@/modules/listing-publication/infrastructure/drizzle-zone-vocabulary";
import { db } from "@/shared/db/client";
import { emptyDraft, publicationDraftDependencies, type StoredDraft } from "./draft";

/**
 * Lo que toda pantalla del flujo necesita antes de dibujar nada: el borrador,
 * lo que le falta, en que paso esta la persona y como se llama su zona.
 *
 * Vive en un archivo aparte porque lo comparten cuatro rutas y porque **las
 * paginas no deben repetir esta secuencia**: quien la copie mal en una de
 * ellas va a validar contra otras zonas curadas y va a dar por hecho un paso
 * que no lo esta. Aca no se decide nada — se lee el borrador, se consulta y se
 * llama al dominio.
 *
 * **`publisherId` es un parametro y no algo que este archivo averigue** (18.30).
 * Las cuatro rutas ya piden `requireSession` antes de llamar aca, asi que pedirla
 * de nuevo seria una segunda respuesta a la misma pregunta; y exigirla en la
 * firma es lo que hace imposible dibujar el flujo sin saber de quien es el
 * borrador — que es justo lo que la cookie permitia.
 *
 * Las lecturas van por `db` (`neon-http`), no por el cliente transaccional:
 * este es el camino de lectura del que habla el argumento de latencia de D2, y
 * no sostiene ninguna conexion.
 */

export interface PublicationContext {
  readonly draft: StoredDraft;
  readonly violations: readonly PublishViolation[];
  readonly currentStep: PublishStepId;
  /**
   * Esta cuenta tenía un borrador y se le venció (18.34). **No es «no hay
   * borrador»**: quien nunca empezó llega acá con `false`, y ésa es exactamente
   * la diferencia que hasta ahora no se podía observar.
   */
  readonly draftExpired: boolean;
  /** El nombre de la zona elegida. Un `zone_id` crudo no le dice nada a nadie. */
  readonly zoneName?: string;
}

export async function readPublicationContext(publisherId: string): Promise<PublicationContext> {
  // **La condición «preguntar sólo cuando no hay borrador» vive en el módulo**,
  // no acá: escrita en `app/` sería una decisión de producto fuera del piso del
  // 90 % (AGENTS.md §1), y ésta decide qué se le dice a alguien y cuánto cuesta.
  const reading = await readPublicationDraftOrExpiry(
    publisherId,
    new Date(),
    publicationDraftDependencies(),
  );
  const draft = reading.draft ?? emptyDraft();

  const violations = await validateDraft(draft);

  return {
    draft,
    violations,
    currentStep: currentStepId(draft, violations),
    draftExpired: reading.expired,
    ...(await zoneNameOf(draft)),
  };
}

/**
 * La misma validacion que corre al publicar, sobre el mismo borrador.
 *
 * **Es la mitad de "la validacion corre en los dos lados"** — la otra la corre
 * `publishListing`, entera, otra vez. La repeticion es deliberada: la
 * importacion de cartera en lote pasa por la misma funcion, y una regla
 * implementada solo en un formulario es una regla que el importador no tiene.
 */
export async function validateDraft(draft: PublicationDraft): Promise<readonly PublishViolation[]> {
  const curatedZones = draft.listing.cityId
    ? await new DrizzleZoneCatalogue(db).listZonesForCity(draft.listing.cityId)
    : [];

  return validatePublishableListing(draftListingOf(draft), curatedZones);
}

async function zoneNameOf(draft: PublicationDraft): Promise<{ zoneName?: string }> {
  if (!draft.listing.zoneId) return {};

  const vocabulary = await new DrizzleZoneVocabulary(db).lookup(draft.listing.zoneId);
  // A traves de `resolveZoneCity` y no de un `find` suelto: es la funcion que
  // ya sabe que una zona cuya ciudad no esta curada no cuenta como elegida.
  const selection = resolveZoneCity(draft.listing.zoneId, vocabulary);
  const zone = selection
    ? vocabulary.zones.find((candidate) => candidate.id === selection.zoneId)
    : undefined;

  return zone ? { zoneName: zone.name } : {};
}
