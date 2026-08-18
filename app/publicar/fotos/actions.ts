"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PublishRejectedError,
  publishListing,
} from "@/modules/listing-publication/application/publish-listing";
import { MAX_PHOTO_BYTES } from "@/modules/listing-publication/domain/uploaded-photo";
import { createR2PhotoStorage } from "@/modules/listing-publication/infrastructure/r2-photo-storage";
import { requireSession } from "../../_lib/require-session";
import { DRAFT_COOKIE, DRAFT_TTL_SECONDS, parseDraft, serialiseDraft } from "../draft";
import { toDraft } from "../submission";
import { UPLOAD_CONTENT_TYPE } from "./compress";
import { publishListingDependencies } from "./publication";
import { type RequestedUpload, validateUploadRequest } from "./upload-request";

/**
 * Issues the presigned PUTs step 2 uploads through (task 3.14).
 *
 * This is the one Server Action on the publish path that a client component
 * calls directly — SISTEMA.md allows JavaScript on this screen and nowhere
 * else, because compressing a photo before it leaves the phone is the whole
 * reason it exists.
 *
 * **A Server Action is a public HTTP endpoint.** Being called from a client
 * component of ours is not a guarantee about who calls it, so every check
 * here treats the caller as untrusted.
 */

export interface IssuedUploadTarget {
  readonly key: string;
  readonly url: string;
  readonly expiresAt: string;
}

export type UploadTargetsResult =
  | { readonly ok: true; readonly targets: readonly IssuedUploadTarget[] }
  | { readonly ok: false; readonly violations: readonly string[] };

export async function requestUploadTargets(
  requested: readonly RequestedUpload[],
): Promise<UploadTargetsResult> {
  const session = await requireSession("/publicar/fotos");

  // Photos belong to a listing somebody has already described. Without a
  // draft there is nothing to attach them to, and issuing write grants for a
  // listing that will never exist is how an empty prefix fills up.
  const draft = parseDraft((await cookies()).get(DRAFT_COOKIE)?.value);
  if (!draft) return { ok: false, violations: ["draft.missing"] };

  const violations = validateUploadRequest(requested);
  if (violations.length > 0) return { ok: false, violations };

  const storage = createR2PhotoStorage();

  // Sequential, matching the publish pipeline: each call is a signature, not
  // a network round trip, but a failure part-way should stop rather than
  // leave a caller holding some of what it asked for.
  const targets: IssuedUploadTarget[] = [];
  for (const upload of requested) {
    const target = await storage.createUploadTarget({
      // From the session. This is the segment that makes one publisher's
      // leaked URL useless for writing into another's space, and it is the
      // reason nothing about the destination comes from the request.
      publisherId: session.userId,
      contentType: upload.contentType,
      byteLength: upload.byteLength,
      // The caller's ceiling never raises ours; the adapter takes the lower
      // of the two.
      maxBytes: MAX_PHOTO_BYTES,
    });

    targets.push({
      key: target.key,
      url: target.url,
      // Serialised, because a Date does not survive the boundary between a
      // Server Action and the client component that awaited it.
      expiresAt: target.expiresAt.toISOString(),
    });
  }

  return { ok: true, targets };
}

/**
 * The last step: turn a described draft plus uploaded photo keys into a real
 * listing (task 3.14c).
 *
 * Everything this touches is already proven in isolation — the ownership
 * check on each key, the magic-byte guard, the derivatives and their byte
 * budgets, the one-transaction write. What happens here is only the joining,
 * and the two decisions worth reading are both about failure.
 */
export async function publishFromDraft(formData: FormData): Promise<void> {
  await requireSession("/publicar/fotos");

  const store = await cookies();
  const draft = parseDraft(store.get(DRAFT_COOKIE)?.value);
  // No draft means the cookie expired mid-upload or the URL was typed
  // directly. Step 1 is where that is recoverable.
  if (!draft) redirect("/publicar");

  const incomingKeys = formData
    .getAll("photoKey")
    .filter((v): v is string => typeof v === "string");

  const { photoCount: _ignored, ...values } = toDraft(draft.values);

  let listingId: string;
  try {
    const published = await publishListing(
      {
        ...values,
        photos: incomingKeys.map((incomingKey) => ({
          incomingKey,
          // Everything the uploader sends is WebP, because it compressed it.
          // The declaration is checked against the file's own header after
          // download, so a wrong value here is caught rather than trusted.
          declaredContentType: UPLOAD_CONTENT_TYPE,
        })),
      },
      publishListingDependencies(),
    );
    listingId = published.listingId;
  } catch (error) {
    // A rejected draft goes back to step 1 with its violations, because that
    // is the screen with the fields. Anything else — R2 unreachable, a photo
    // that is not an image, a database that refused the write — is not
    // something a publisher can fix by editing a field, so it is left to
    // propagate rather than dressed up as a form error.
    if (!(error instanceof PublishRejectedError)) throw error;

    store.set(
      DRAFT_COOKIE,
      serialiseDraft({ values: draft.values, violations: error.violations }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/publicar",
        maxAge: DRAFT_TTL_SECONDS,
        secure: process.env.NODE_ENV === "production",
      },
    );
    redirect("/publicar");
  }

  // Cleared only after the write succeeded. Clearing earlier would lose a
  // publisher's words to a failure they had no part in.
  store.delete(DRAFT_COOKIE);
  redirect(`/publicar/listo?id=${encodeURIComponent(listingId)}`);
}
