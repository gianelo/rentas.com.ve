import { describe, expect, it, vi } from "vitest";
import { DRAFT_LIFETIME_MS } from "../domain/draft-expiry";
import type { StoredPublicationDraft } from "../domain/publication-steps";
import type { LegacyPublicationDraftPort } from "./ports/legacy-publication-draft.port";
import type { PublicationDraftStorePort } from "./ports/publication-draft-store.port";
import {
  discardPublicationDraft,
  type PublicationDraftDependencies,
  readPublicationDraft,
  savePublicationDraft,
} from "./publication-draft-session";

/**
 * El borrador de publicar, leído y escrito **por un solo lado** (tasks.md 18.30).
 *
 * La rebanada anterior dejó la tabla y su puerto sin llamador. Ésta los cablea, y
 * el día que shipea hay dos fuentes vivas del mismo borrador: la fila, y las dos
 * cookies que quien está a mitad de publicar todavía trae. **Un puente de dos
 * fuentes es el defecto**, no la solución, así que la regla de acá es lo único
 * que lo hace uno: la tabla gana siempre, y la cookie se muere en cuanto la tabla
 * se escribe. Escrito en el caso de uso y no en `app/` porque decide QUÉ pasa —
 * `app/` sólo sabe cómo se borra una cookie.
 */

const MARIA = "usr_maria";
const AHORA = new Date("2026-09-01T12:00:00.000Z");

const enTabla: StoredPublicationDraft = {
  listing: { title: "El de la tabla" },
  photos: [{ key: "usr_maria/a.webp", name: "Sala", bytes: 10 }],
  violations: [],
};
const enCookie: StoredPublicationDraft = {
  listing: { title: "El de la cookie" },
  photos: [],
  violations: [],
};

function dependencias(
  load: StoredPublicationDraft | null,
  legacy: StoredPublicationDraft | null = null,
): PublicationDraftDependencies & {
  readonly store: { [K in keyof PublicationDraftStorePort]: ReturnType<typeof vi.fn> };
  readonly legacy: { [K in keyof LegacyPublicationDraftPort]: ReturnType<typeof vi.fn> };
} {
  return {
    store: {
      load: vi.fn(async () => load),
      save: vi.fn(async () => undefined),
      discard: vi.fn(async () => undefined),
    },
    legacy: { read: vi.fn(async () => legacy), clear: vi.fn(async () => undefined) },
  } as never;
}

describe("leer el borrador", () => {
  it("la tabla gana sobre la cookie, y la cookie ni se consulta", async () => {
    // **El orden es la trampa entera.** Al revés —cookie primero— una cookie
    // vieja del mismo navegador pisaría en silencio lo que la persona acaba de
    // guardar, y las dos pantallas darían verde por separado.
    const deps = dependencias(enTabla, enCookie);

    expect(await readPublicationDraft(MARIA, AHORA, deps)).toEqual(enTabla);
    expect(deps.legacy.read).not.toHaveBeenCalled();
    expect(deps.store.load).toHaveBeenCalledWith(MARIA, AHORA);
  });

  it("sin fila, la cookie de la entrega anterior es el borrador", async () => {
    // El puente: quien estaba en el paso 6 el día del despliegue.
    const deps = dependencias(null, enCookie);

    expect(await readPublicationDraft(MARIA, AHORA, deps)).toEqual(enCookie);
  });

  it("sin fila y sin cookie no hay borrador", async () => {
    expect(await readPublicationDraft(MARIA, AHORA, dependencias(null))).toBeNull();
  });

  it("leer nunca borra la cookie, ni siquiera cuando la tabla contestó", async () => {
    // No es prolijidad: leer pasa por un componente de servidor, y ahí Next no
    // deja tocar cookies. Un `clear()` acá sería un 500 en el paso 1.
    const deps = dependencias(enTabla, enCookie);
    await readPublicationDraft(MARIA, AHORA, deps);

    expect(deps.legacy.clear).not.toHaveBeenCalled();
  });

  it("una fila con la forma de ayer se limpia campo por campo, y el resto sobrevive", async () => {
    // El tipo dice `StoredPublicationDraft`; la fila la escribió el formulario
    // de ayer. Falla cerrado POR CAMPO (AGENTS.md §7): se pierde un paso, no
    // los nueve.
    const ayer = {
      listing: { title: "Real", rooms: 2, priceUsd: "450", barrio: "inventado" },
      photos: [],
      violations: [],
    } as unknown as StoredPublicationDraft;

    const draft = await readPublicationDraft(MARIA, AHORA, dependencias(ayer));

    expect(draft?.listing).toEqual({ title: "Real", rooms: 2 });
  });

  it("una fila que no es un borrador es como no tener ninguno", async () => {
    const basura = [] as unknown as StoredPublicationDraft;

    expect(await readPublicationDraft(MARIA, AHORA, dependencias(basura))).toBeNull();
  });
});

describe("escribir el borrador", () => {
  it("guarda con las 24 horas del dominio y borra las dos cookies", async () => {
    const deps = dependencias(null);

    await savePublicationDraft(MARIA, enTabla, AHORA, deps);

    expect(deps.store.save).toHaveBeenCalledWith(
      MARIA,
      enTabla,
      new Date(AHORA.getTime() + DRAFT_LIFETIME_MS),
    );
    // **La aserción que sostiene toda la rebanada.** Sin esto la cookie queda
    // como una segunda fuente del mismo borrador, y el día que discrepen gana
    // la que nadie mira.
    expect(deps.legacy.clear).toHaveBeenCalledTimes(1);
  });

  it("si la tabla no aceptó la escritura, la cookie NO se borra", async () => {
    // El orden es lo que protege el borrador: borrar antes de que la fila
    // exista deja a quien publica sin ninguna de las dos fuentes por una falla
    // en la que no tuvo parte.
    const deps = dependencias(null);
    deps.store.save.mockRejectedValueOnce(new Error("la base dijo que no"));

    await expect(savePublicationDraft(MARIA, enTabla, AHORA, deps)).rejects.toThrow(
      "la base dijo que no",
    );
    expect(deps.legacy.clear).not.toHaveBeenCalled();
  });

  it("descartar borra la fila y también las dos cookies", async () => {
    // Publicar de verdad y abandonar terminan igual, y sin esto publicar dejaría
    // la cookie viva: el siguiente `load` la subiría de nuevo y el aviso ya
    // publicado volvería como borrador.
    const deps = dependencias(enTabla);

    await discardPublicationDraft(MARIA, deps);

    expect(deps.store.discard).toHaveBeenCalledWith(MARIA);
    expect(deps.legacy.clear).toHaveBeenCalledTimes(1);
  });

  it("si la fila no se pudo borrar, la cookie tampoco", async () => {
    const deps = dependencias(enTabla);
    deps.store.discard.mockRejectedValueOnce(new Error("la base dijo que no"));

    await expect(discardPublicationDraft(MARIA, deps)).rejects.toThrow("la base dijo que no");
    expect(deps.legacy.clear).not.toHaveBeenCalled();
  });
});
