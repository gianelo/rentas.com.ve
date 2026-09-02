import { describe, expect, it } from "vitest";
import type { ExpiredDraftPhotos } from "./ports/expired-publication-drafts.port";
import { sweepExpiredDrafts } from "./sweep-expired-drafts";

/**
 * tasks.md 18.32 — **el orden es el diseño, así que se afirma y no se comenta.**
 * La fila es lo único que nombra esos objetos: borrarla primero fabrica el
 * huérfano que este barrido existe para quitar, y ninguna prueba que sólo mire
 * los contadores lo distingue. Por eso todo pasa por un registro de llamadas.
 */

const AHORA = new Date("2026-09-01T13:00:00.000Z");

function sweepWith(
  expired: readonly ExpiredDraftPhotos[],
  rejectKeys: readonly string[] = [],
  discardThrows: readonly string[] = [],
) {
  const calls: string[] = [];
  const askedFor: Date[] = [];

  return {
    calls,
    askedFor,
    dependencies: {
      drafts: {
        listExpired: async (now: Date) => {
          askedFor.push(now);
          calls.push("listExpired");
          return expired;
        },
      },
      objectStorage: {
        remove: async (key: string) => {
          calls.push(`remove:${key}`);
          if (rejectKeys.includes(key)) throw new Error(`R2 rechazó ${key}`);
        },
      },
      store: {
        discard: async (publisherId: string) => {
          calls.push(`discard:${publisherId}`);
          if (discardThrows.includes(publisherId)) throw new Error("la base cortó");
        },
      },
      now: () => AHORA,
    },
  };
}

describe("sweepExpiredDrafts", () => {
  it("lee las claves y las borra de R2 ANTES de borrar la fila que las nombra", async () => {
    const { calls, askedFor, dependencies } = sweepWith([
      { publisherId: "maria", photoKeys: ["promoted/maria/cocina", "promoted/maria/sala"] },
    ]);

    const resultado = await sweepExpiredDrafts(dependencies);

    // El orden literal, no «se llamaron las dos cosas»: `discard` último y
    // después de las dos claves.
    expect(calls).toEqual([
      "listExpired",
      "remove:promoted/maria/cocina",
      "remove:promoted/maria/sala",
      "discard:maria",
    ]);
    expect(askedFor).toEqual([AHORA]);
    expect(resultado).toEqual({ selected: 1, draftsDeleted: 1, objectsRemoved: 2, failed: 0 });
  });

  it("cuando R2 rechaza una clave, la fila SOBREVIVE — es lo único que nombra el resto", async () => {
    const { calls, dependencies } = sweepWith(
      [{ publisherId: "maria", photoKeys: ["promoted/maria/cocina", "promoted/maria/sala"] }],
      ["promoted/maria/cocina"],
    );

    const resultado = await sweepExpiredDrafts(dependencies);

    // Se intentan las dos —una falla no cancela el resto del borrador— y
    // ninguna `discard` aparece: la corrida de mañana vuelve a nombrarlas.
    expect(calls).toEqual([
      "listExpired",
      "remove:promoted/maria/cocina",
      "remove:promoted/maria/sala",
    ]);
    expect(resultado).toEqual({ selected: 1, draftsDeleted: 0, objectsRemoved: 1, failed: 1 });
  });

  it("la falla de un borrador no arrastra al siguiente, que sí se barre entero", async () => {
    const { calls, dependencies } = sweepWith(
      [
        { publisherId: "maria", photoKeys: ["promoted/maria/cocina"] },
        { publisherId: "agencia", photoKeys: ["promoted/agencia/patio"] },
      ],
      ["promoted/maria/cocina"],
    );

    const resultado = await sweepExpiredDrafts(dependencies);

    // El par positivo de la prueba de arriba: sin él, un barrido MUERTO —que no
    // borra nunca nada— pasaría las dos.
    expect(calls).toEqual([
      "listExpired",
      "remove:promoted/maria/cocina",
      "remove:promoted/agencia/patio",
      "discard:agencia",
    ]);
    expect(resultado).toEqual({ selected: 2, draftsDeleted: 1, objectsRemoved: 1, failed: 1 });
  });

  it("un borrador vencido sin ninguna foto igual pierde la fila", async () => {
    const { calls, dependencies } = sweepWith([{ publisherId: "se-fue", photoKeys: [] }]);

    const resultado = await sweepExpiredDrafts(dependencies);

    expect(calls).toEqual(["listExpired", "discard:se-fue"]);
    expect(resultado).toEqual({ selected: 1, draftsDeleted: 1, objectsRemoved: 0, failed: 0 });
  });

  it("si la base rechaza el borrado de la fila, se cuenta como falla y el barrido sigue", async () => {
    const { calls, dependencies } = sweepWith(
      [
        { publisherId: "maria", photoKeys: ["promoted/maria/cocina"] },
        { publisherId: "agencia", photoKeys: [] },
      ],
      [],
      ["maria"],
    );

    const resultado = await sweepExpiredDrafts(dependencies);

    expect(calls).toEqual([
      "listExpired",
      "remove:promoted/maria/cocina",
      "discard:maria",
      "discard:agencia",
    ]);
    expect(resultado).toEqual({ selected: 2, draftsDeleted: 1, objectsRemoved: 1, failed: 1 });
  });
});
