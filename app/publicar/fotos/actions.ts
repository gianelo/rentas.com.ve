"use server";

import { readPublicationDraft } from "@/modules/listing-publication/application/publication-draft-session";
import { MAX_PHOTO_BYTES } from "@/modules/listing-publication/domain/uploaded-photo";
import { createR2PhotoStorage } from "@/modules/listing-publication/infrastructure/r2-photo-storage";
import { requireSession } from "../../_lib/require-session";
import { publicationDraftDependencies } from "../draft";
import { type RequestedUpload, validateUploadRequest } from "./upload-request";

/**
 * Firma los PUT por los que sube el paso 8 (task 3.14).
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
  const session = await requireSession("/publicar/paso/fotos");

  // Photos belong to a listing somebody has already described. Without a
  // draft there is nothing to attach them to, and issuing write grants for a
  // listing that will never exist is how an empty prefix fills up.
  const draft = await readPublicationDraft(
    session.userId,
    new Date(),
    publicationDraftDependencies(),
  );
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
