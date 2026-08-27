import {
  EXPIRY_NOTICE_WINDOW_DAYS,
  isExpired,
  wholeDaysBetween,
} from "../../listing-lifecycle/domain/expiry";
import { MIN_PHOTOS_FOR_ACTIVATION, type PublisherType } from "./publishable-listing";

/**
 * tasks.md 9.28 — «Mis avisos» (láminas 14c y 14d), como reglas y no como
 * plantilla.
 *
 * **Por qué acá.** Cuáles avisos van primero, en qué estado está cada uno y
 * cuántos «no se ven todavía» son afirmaciones sobre el producto. La lámina
 * las pone en el encabezado —«88 en total · 38 no se ven todavía», «50 de 88
 * publicados»— y anota al pie por qué el orden no es decorativo: *"los
 * borradores van arriba: son los que no se ven, y por eso los que
 * importan"*. Escritas en `app/mis-avisos/page.tsx` serían reglas que el
 * piso de 90% no alcanza (AGENTS.md §1).
 *
 * **Lo que este módulo NO decide.** Si un borrador puede activarse lo
 * contesta `activateListing`, re-validando con `validatePublishableListing`
 * en etapa `"activation"` — veinte reglas, no una. Acá sólo se cuenta
 * cuántos borradores no tienen ni una foto, con
 * `MIN_PHOTOS_FOR_ACTIVATION`, que es la misma constante que ese validador
 * aplica y no una segunda copia del número.
 *
 * **Puro y sin reloj propio**, igual que el resto de este directorio: `now`
 * entra por parámetro porque «vence pronto» es una respuesta sobre un
 * instante, y una función que lee el reloj sola no se puede probar contra
 * ninguno.
 */

export type PublisherListingStatus = "draft" | "active" | "expired" | "hidden";

/** Los cinco estados que 14d dibuja. `borrador es el quinto estado`, al pie. */
export type PublisherListingState = "draft" | "expiringSoon" | "hidden" | "active" | "expired";

/** Las seis fichas de 14d, con el nombre que viaja en la dirección. */
export type PublisherListingFilter =
  | "todos"
  | "borradores"
  | "activas"
  | "vencen-pronto"
  | "vencidas"
  | "ocultas";

/** Un aviso tal como el puerto lo trae: hechos, sin interpretar. */
export interface PublisherListing {
  readonly id: string;
  readonly title: string;
  readonly priceUsd: number;
  readonly zoneName: string;
  readonly rooms: number;
  readonly areaM2: number;
  readonly publisherType: PublisherType;
  /** La referencia con la que la inmobiliaria lo reconoce; `null` si no vino de un archivo. */
  readonly externalReference: string | null;
  readonly status: PublisherListingStatus;
  readonly photoCount: number;
  readonly expiresAt: Date;
}

export interface PublisherListingCard extends PublisherListing {
  readonly state: PublisherListingState;
  /** Sólo cuando el reloj todavía corre; `null` para borradores y vencidos. */
  readonly daysToExpiry: number | null;
}

export interface PublisherListingChip {
  readonly filter: PublisherListingFilter;
  readonly label: string;
  readonly count: number;
}

export interface PublisherListingBoard {
  readonly total: number;
  /** «38 borradores esperando fotos» (14d). */
  readonly draftsAwaitingPhotos: number;
  /** «50 de 88 publicados»: todo lo que alguna vez dejó de ser borrador. */
  readonly publishedCount: number;
  readonly chips: readonly PublisherListingChip[];
  /** Ya filtrados y en el orden de la lámina. */
  readonly cards: readonly PublisherListingCard[];
}

/**
 * El orden de 14d, de arriba abajo: lo que no se ve, lo que corre reloj, lo
 * que alguien más apagó, lo que está bien, y lo que ya terminó.
 */
const STATE_ORDER: readonly PublisherListingState[] = [
  "draft",
  "expiringSoon",
  "hidden",
  "active",
  "expired",
];

const CHIPS: readonly {
  readonly filter: PublisherListingFilter;
  readonly label: string;
  /** `null` en «Todos»: cuenta el tablero entero. */
  readonly state: PublisherListingState | null;
}[] = [
  { filter: "todos", label: "Todos", state: null },
  { filter: "borradores", label: "Borradores", state: "draft" },
  { filter: "activas", label: "Activas", state: "active" },
  { filter: "vencen-pronto", label: "Vencen pronto", state: "expiringSoon" },
  { filter: "vencidas", label: "Vencidas", state: "expired" },
  { filter: "ocultas", label: "Ocultas", state: "hidden" },
];

const FILTERS: ReadonlySet<string> = new Set(CHIPS.map((chip) => chip.filter));

/**
 * **Falla cerrado (AGENTS.md §7).** Un `?estado=` que nadie definió no elige
 * un subconjunto vacío ni un error: cae en «todos», que es el estado por
 * defecto de la pantalla y el único que no esconde nada.
 */
export function parsePublisherListingFilter(raw: string | undefined): PublisherListingFilter {
  return raw !== undefined && FILTERS.has(raw) ? (raw as PublisherListingFilter) : "todos";
}

/**
 * **La fecha manda sobre el estado guardado, y en un solo sentido.**
 * `markExpired` corre en un cron con `WHERE status = 'active'`, así que entre
 * el instante en que un aviso vence y el instante en que ese trabajo pasa la
 * fila sigue diciendo `active`. Dibujarla como activa repetiría lo que la
 * base todavía no corrigió. Al revés no vale: un `hidden` no vuelve a ser
 * activo porque le queden días, porque quien lo apagó no fue el reloj.
 */
function stateFor(listing: PublisherListing, now: Date): PublisherListingState {
  if (listing.status === "draft") return "draft";
  if (listing.status === "hidden") return "hidden";
  if (listing.status === "expired") return "expired";
  if (isExpired(listing.expiresAt, now)) return "expired";
  return wholeDaysBetween(now, listing.expiresAt) <= EXPIRY_NOTICE_WINDOW_DAYS
    ? "expiringSoon"
    : "active";
}

export function buildPublisherListingBoard(
  listings: readonly PublisherListing[],
  now: Date,
  filter: PublisherListingFilter = "todos",
): PublisherListingBoard {
  const cards: PublisherListingCard[] = listings.map((listing) => {
    const state = stateFor(listing, now);
    return {
      ...listing,
      state,
      daysToExpiry:
        state === "active" || state === "expiringSoon"
          ? wholeDaysBetween(now, listing.expiresAt)
          : null,
    };
  });

  const countByState = new Map<PublisherListingState, number>();
  for (const card of cards) {
    countByState.set(card.state, (countByState.get(card.state) ?? 0) + 1);
  }

  const drafts = countByState.get("draft") ?? 0;

  return {
    total: cards.length,
    draftsAwaitingPhotos: cards.filter(
      (card) => card.state === "draft" && card.photoCount < MIN_PHOTOS_FOR_ACTIVATION,
    ).length,
    publishedCount: cards.length - drafts,
    // Cuentan SIEMPRE el tablero entero, nunca lo filtrado: si contaran lo
    // mostrado, elegir «Borradores» pondría las otras cinco en cero y la
    // pantalla diría que la cuenta no tiene ni un aviso activo.
    chips: CHIPS.map((chip) => ({
      filter: chip.filter,
      label: chip.label,
      count: chip.state === null ? cards.length : (countByState.get(chip.state) ?? 0),
    })),
    cards: cards
      .filter((card) => matches(card.state, filter))
      // Estable dentro de cada estado: el puerto ya los trae en un orden y
      // ese orden es el suyo, no el de este `sort`.
      .sort((left, right) => STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state)),
  };
}

function matches(state: PublisherListingState, filter: PublisherListingFilter): boolean {
  if (filter === "todos") return true;
  return CHIPS.find((chip) => chip.filter === filter)?.state === state;
}
