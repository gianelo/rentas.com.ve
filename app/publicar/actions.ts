"use server";

import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/shared/db/client";
import { zones as zonesTable } from "@/shared/db/schema";
import { validatePublishableListing } from "../../src/modules/listing-publication/domain/publishable-listing";
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

  const curatedZones = values.cityId
    ? await db
        .select({ id: zonesTable.id, cityId: zonesTable.cityId })
        .from(zonesTable)
        .where(eq(zonesTable.cityId, values.cityId))
        .orderBy(asc(zonesTable.name))
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
