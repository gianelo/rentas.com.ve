import { describe, expect, it, vi } from "vitest";
import { PURGE_GRACE_DAYS } from "../domain/expiry";
import type { JobRunPort, JobRunRecord } from "./ports/job-run.port";
import type { ListingPhotoPurgePort, PurgeCandidate } from "./ports/listing-photo-purge.port";
import { purgeExpiredPhotos } from "./purge-expired-photos";

const NOW = new Date("2026-09-20T10:00:00.000Z");

const CANDIDATE: PurgeCandidate = {
  listingId: "aviso-1",
  photoIds: ["foto-1", "foto-2"],
  objectKeys: ["listings/aviso-1/foto-1/card.webp", "listings/aviso-1/foto-2/card.webp"],
};

function dependencies(candidates: readonly PurgeCandidate[] = [CANDIDATE]) {
  const runs: JobRunRecord[] = [];
  const removed: string[] = [];
  const photos: ListingPhotoPurgePort = {
    candidates: vi.fn(async () => candidates),
    deletePhotos: vi.fn(async (ids: readonly string[]) => ids.length),
  };
  const jobRuns: JobRunPort = {
    record: vi.fn(async (run: JobRunRecord) => {
      runs.push(run);
    }),
  };
  return {
    photos,
    objectStorage: {
      remove: vi.fn(async (key: string) => {
        removed.push(key);
      }),
    },
    jobRuns,
    now: () => NOW,
    runs,
    removed,
  };
}

describe("purgeExpiredPhotos", () => {
  it("corta exactamente 15 días después del vencimiento", async () => {
    const deps = dependencies();
    await purgeExpiredPhotos(deps);

    expect(deps.photos.candidates).toHaveBeenCalledWith(
      new Date(NOW.getTime() - PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000),
    );
  });

  it("borra las filas de foto y los objetos del bucket", async () => {
    const deps = dependencies();
    const result = await purgeExpiredPhotos(deps);

    expect(deps.photos.deletePhotos).toHaveBeenCalledWith(["foto-1", "foto-2"]);
    expect(deps.removed).toEqual(CANDIDATE.objectKeys);
    expect(result.photosDeleted).toBe(2);
  });

  // **La mutación que carga el peso.** El puerto no ofrece forma de tocar la
  // fila del aviso, y esta prueba lo afirma sobre la superficie: si alguien
  // agregara un `deleteListing`, esto se pondría rojo.
  it("no tiene con qué tocar la fila del aviso", async () => {
    const deps = dependencies();
    await purgeExpiredPhotos(deps);

    expect(Object.keys(deps.photos).sort()).toEqual(["candidates", "deletePhotos"]);
  });

  // El bucket se limpia ANTES que las filas: al revés se pierde el único
  // índice de qué objetos quedaron, y esos bytes no los recupera nadie.
  it("borra del bucket antes que de la base", async () => {
    const order: string[] = [];
    const deps = dependencies();
    deps.objectStorage.remove = vi.fn(async () => {
      order.push("bucket");
    });
    deps.photos.deletePhotos = vi.fn(async (ids: readonly string[]) => {
      order.push("base");
      return ids.length;
    });

    await purgeExpiredPhotos(deps);

    expect(order).toEqual(["bucket", "bucket", "base"]);
  });

  // Un objeto que ya no está en R2 no puede bloquear la purga de la fila: el
  // resultado deseado —que no queden bytes— ya se cumplió.
  it("un objeto que falla al borrarse queda anotado y no detiene la corrida", async () => {
    const deps = dependencies();
    deps.objectStorage.remove = vi.fn(async (key: string) => {
      if (key.includes("foto-1")) throw new Error("no such key");
    });

    const result = await purgeExpiredPhotos(deps);

    expect(result.failed).toBe(1);
    expect(deps.photos.deletePhotos).toHaveBeenCalled();
    expect(deps.runs[0]?.failureDetail).toContain("no such key");
  });

  it("registra la corrida aunque no haya nada que purgar", async () => {
    const deps = dependencies([]);
    await purgeExpiredPhotos(deps);

    expect(deps.runs[0]).toMatchObject({ job: "photo-purge", selected: 0, succeeded: 0 });
    expect(deps.photos.deletePhotos).not.toHaveBeenCalled();
  });
});
