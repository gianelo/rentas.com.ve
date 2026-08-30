import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import {
  type ListingEdit,
  type ListingEditViolation,
  planListingEdit,
} from "../domain/listing-edit";
import type { ListingEditPort } from "./ports/listing-edit.port";
import type { ZoneCataloguePort } from "./ports/zone-catalogue.port";

/**
 * Editar un aviso publicado (tasks.md 18.14).
 *
 * **Ninguna regla vive acá.** Qué campos puede tocar una edición y con qué
 * reglas se validan lo contesta `planListingEdit`, en el dominio y bajo el
 * piso del 90 %. Este caso de uso ordena las puertas: sesión, después la
 * lectura acotada, después el plan, y sólo entonces la escritura.
 *
 * **No hay `EditListingNotOwnedError`, y ahí se aparta deliberadamente de
 * `activateListing`.** Un borrador importado que no es tuyo es un id que sólo
 * podés haber tecleado; un aviso publicado tiene dirección pública, así que
 * «ese aviso no es tuyo» le confirmaría a cualquiera quién publicó cuál. El
 * aviso ajeno se contesta igual que el inexistente, como ya hacen
 * `/mis-avisos` y el revelado de contacto (AGENTS.md §7).
 */

export class EditListingNotFoundError extends Error {
  constructor(listingId: string) {
    super(`edit-listing: ${listingId} is not an editable listing of the caller.`);
    this.name = "EditListingNotFoundError";
  }
}

export class EditListingRejectedError extends Error {
  readonly violations: readonly ListingEditViolation[];

  constructor(violations: readonly ListingEditViolation[]) {
    super(`edit-listing: rejected (${violations.join(", ")})`);
    this.name = "EditListingRejectedError";
    this.violations = violations;
  }
}

export interface EditListingRequest {
  readonly listingId: string;
  readonly edit: ListingEdit;
}

export interface EditListingDependencies {
  readonly sessionPort: SessionPort;
  readonly zones: ZoneCataloguePort;
  readonly listings: ListingEditPort;
}

export interface EditListingResult {
  readonly listingId: string;
}

export async function editListing(
  request: EditListingRequest,
  dependencies: EditListingDependencies,
): Promise<EditListingResult> {
  const { sessionPort, zones, listings } = dependencies;

  // La sesión primero, antes de cualquier lectura: el mismo orden que
  // `publishListing`, `activateListing` y `revealContact`, y por la misma
  // razón — quien no entró no puede hacer que esta función toque el catálogo.
  const session = await requireAuthenticatedSession(sessionPort);

  const current = await listings.findEditableById(request.listingId, session.userId);
  if (!current) {
    throw new EditListingNotFoundError(request.listingId);
  }

  // Redundante con el `WHERE` del puerto, y a propósito: la garantía «sólo el
  // dueño edita» no puede depender de que un adaptador futuro se acuerde de
  // pasar el segundo parámetro. La integración prueba el `WHERE`; esto prueba
  // que el caso de uso no confía en él.
  if (current.publisherId !== session.userId) {
    throw new EditListingNotFoundError(request.listingId);
  }

  const curatedZones = await zones.listZonesForCity(current.cityId);

  const plan = planListingEdit(current, curatedZones, request.edit);
  if (!plan.ok) {
    throw new EditListingRejectedError(plan.violations);
  }

  const applied = await listings.applyEdit(request.listingId, session.userId, plan.write);
  if (!applied) {
    // La fila era editable cuando la lectura de arriba la vio, y dejó de
    // serlo antes del `UPDATE`: venció, la ocultaron por reportes, o alguien
    // la borró. No hay nada que ESTA llamada pueda haber hecho, y reintentar
    // no es un estado al que volver.
    throw new EditListingNotFoundError(request.listingId);
  }

  return { listingId: current.id };
}
