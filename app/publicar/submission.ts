import type {
  DraftListing,
  PublishViolation,
} from "../../src/modules/listing-publication/domain/publishable-listing";
import type { PublishFormValues } from "./PublishForm";

/**
 * The two decisions step 1's handler makes on its own, kept out of
 * `actions.ts` because a `"use server"` module may only export async
 * functions — the build refuses anything else, which is how this file came
 * to exist. The separation is the better shape regardless: these are pure,
 * so they are provable without a database, a session, or a request.
 */

/**
 * Photos belong to step 2, so their rules are not reported here — there is no
 * photo control on this screen, and an error pointing at a field that does
 * not exist is a dead end.
 *
 * **Nothing is skipped overall.** `publishListing` runs the whole validator
 * again at publish time, including these, which is what makes filtering here
 * a presentation decision rather than a hole.
 */
export const STEP_TWO_VIOLATIONS: readonly PublishViolation[] = [
  "photos.required",
  "photos.tooMany",
];

const VALUE_KEYS = [
  "publisherType",
  "title",
  "priceUsd",
  "cityId",
  "zoneId",
  "rooms",
  "areaM2",
  "bathrooms",
  "parkingSpots",
  "contactMethod",
  "contactValue",
  "description",
] as const;

export function readValues(formData: FormData): PublishFormValues {
  const values: Record<string, string> = {};
  for (const key of VALUE_KEYS) {
    const value = formData.get(key);
    if (typeof value === "string" && value !== "") values[key] = value;
  }
  return values;
}

/**
 * Exported so the two decisions this handler makes on its own are provable
 * without a database or a session.
 *
 * Strings in, `DraftListing` out. A price typed as "quinientos" becomes
 * `NaN`, which the validator already refuses as `priceUsd.invalid` — the
 * parsing deliberately decides nothing the domain decides.
 */
export function toDraft(values: PublishFormValues): DraftListing {
  const number = (raw: string | undefined) => (raw === undefined ? undefined : Number(raw));

  return {
    publisherType: values.publisherType as DraftListing["publisherType"],
    title: values.title,
    description: values.description,
    priceUsd: number(values.priceUsd),
    cityId: values.cityId,
    zoneId: values.zoneId,
    rooms: number(values.rooms),
    areaM2: number(values.areaM2),
    bathrooms: number(values.bathrooms),
    // **`?? 0`, and only here.** `readValues` drops empty strings, so a
    // publisher who leaves the field alone arrives as `undefined` -- and for
    // this one field that means "no parking", which is an answer. Every other
    // number stays `undefined` so the validator can ask for it.
    parkingSpots: number(values.parkingSpots) ?? 0,
    contactMethod: values.contactMethod as DraftListing["contactMethod"],
    contactValue: values.contactValue,
    // Step 2's business. Declared so the validator sees a complete draft and
    // the filtered codes above are the only ones it could have raised.
    photoCount: 1,
  };
}
