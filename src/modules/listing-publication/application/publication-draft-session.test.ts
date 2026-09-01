import { describe, expect, it, vi } from "vitest";
import { DRAFT_LIFETIME_MS } from "../domain/draft-expiry";
import type { StoredPublicationDraft } from "../domain/publication-steps";
import type { PublicationDraftStorePort } from "./ports/publication-draft-store.port";
import {
  discardPublicationDraft,
  type PublicationDraftDependencies,
  readPublicationDraft,
  savePublicationDraft,
} from "./publication-draft-session";

/**
 * El borrador de publicar, con la tabla como **única** fuente (tasks.md 18.30/18.33).
 *
 * Las tres puertas viven acá y no en `app/` porque deciden QUÉ pasa: qué se acepta
 * de una fila que escribió el formulario de ayer, y cuánto vive lo que se guarda.
 * `app/` sólo sabe qué adaptador contesta el puerto.
 */

const MARIA = "usr_maria";
const AHORA = new Date("2026-09-01T12:00:00.000Z");

const enTabla: StoredPublicationDraft = {
  listing: { title: "El de la tabla" },
  photos: [{ key: "usr_maria/a.webp", name: "Sala", bytes: 10 }],
  violations: [],
};

function dependencias(load: StoredPublicationDraft | null): PublicationDraftDependencies & {
  readonly store: { [K in keyof PublicationDraftStorePort]: ReturnType<typeof vi.fn> };
} {
  return {
    store: {
      load: vi.fn(async () => load),
      save: vi.fn(async () => undefined),
      discard: vi.fn(async () => undefined),
    },
  } as never;
}

describe("leer el borrador", () => {
  it("la fila de la cuenta es el borrador, filtrada por el instante que se le da", async () => {
    const deps = dependencias(enTabla);

    expect(await readPublicationDraft(MARIA, AHORA, deps)).toEqual(enTabla);
    // El `now` viaja hasta el `WHERE`: es lo que hace que un borrador vencido no
    // llegue a existir en memoria, en vez de un `if` posterior que alguien olvide.
    expect(deps.store.load).toHaveBeenCalledWith(MARIA, AHORA);
  });

  it("sin fila no hay borrador", async () => {
    expect(await readPublicationDraft(MARIA, AHORA, dependencias(null))).toBeNull();
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
  it("guarda con las 24 horas del dominio, y no con un plazo escrito acá", async () => {
    const deps = dependencias(null);

    await savePublicationDraft(MARIA, enTabla, AHORA, deps);

    expect(deps.store.save).toHaveBeenCalledWith(
      MARIA,
      enTabla,
      new Date(AHORA.getTime() + DRAFT_LIFETIME_MS),
    );
  });

  it("descartar deja la cuenta sin fila", async () => {
    // Publicar de verdad y abandonar terminan igual: sin fila. Si quedara algo,
    // el aviso recién publicado volvería como borrador en la pantalla siguiente.
    const deps = dependencias(enTabla);

    await discardPublicationDraft(MARIA, deps);

    expect(deps.store.discard).toHaveBeenCalledWith(MARIA);
  });
});
