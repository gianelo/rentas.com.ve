"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/shared/db/client";
import { validatePublishableListing } from "../../src/modules/listing-publication/domain/publishable-listing";
import { DrizzleZoneCatalogue } from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { requireSession } from "../_lib/require-session";
import { DRAFT_COOKIE, DRAFT_TTL_SECONDS, serialiseDraft } from "./draft";
import { readValues, STEP_TWO_VIOLATIONS, toDraft } from "./submission";

/**
 * Step 1's submit handler (SISTEMA.md screen 3, artboard `2c`).
 *
 * A Server Action rather than a route handler, because `page.tsx` and
 * `route.ts` cannot share a segment — and it works with JavaScript disabled,
 * which this screen requires: a native POST, a redirect, a re-render.
 *
 * The result travels back in the draft cookie rather than the URL. A redirect
 * is what lets the back button and a refresh behave, and a 1,200-character
 * description has no business in a query string.
 */

export async function submitPublishStep1(formData: FormData): Promise<void> {
  // First, before anything is read or written: publishing is a protected
  // action, and a Server Action is a public HTTP endpoint like any other.
  await requireSession("/publicar");

  const values = readValues(formData);

  // Through the port listing-publication already owns. The hand-written
  // select this replaces skipped its join against `city`, so a zone whose
  // city had been removed still validated a draft — and the insert then
  // failed on a foreign key, turning an actionable `cityId.unknown` into a
  // 500.
  const curatedZones = values.cityId
    ? await new DrizzleZoneCatalogue(db).listZonesForCity(values.cityId)
    : [];

  const violations = validatePublishableListing(toDraft(values), curatedZones).filter(
    (violation) => !STEP_TWO_VIOLATIONS.includes(violation),
  );

  const store = await cookies();
  store.set(DRAFT_COOKIE, serialiseDraft({ values, violations }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/publicar",
    maxAge: DRAFT_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  // `redirect` throws by design, so nothing below it runs. Both branches write
  // the draft first: on the error path so the publisher gets their words back,
  // on the success path so step 2 has something to publish.
  redirect(violations.length > 0 ? "/publicar" : "/publicar/fotos");
}
