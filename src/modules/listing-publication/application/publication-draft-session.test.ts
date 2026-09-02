import { describe, expect, it, vi } from "vitest";
import { DRAFT_LIFETIME_MS } from "../domain/draft-expiry";
import type { StoredPublicationDraft } from "../domain/publication-steps";
import type { PublicationDraftStorePort } from "./ports/publication-draft-store.port";
import {
  discardPublicationDraft,
  type ExpiredDraftSignalDependencies,
  type PublicationDraftDependencies,
  readPublicationDraft,
  readPublicationDraftOrExpiry,
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

  /**
   * tasks.md 18.36 — **el vencimiento que se guarda mira las fotos de la fila.**
   * Sin esto, guardar el paso 9 el sexto día vuelve a prometer veinticuatro horas
   * sobre una foto que el bucket borra en tres. Se afirma el INSTANTE exacto y no
   * «es menor»: eso lo cumple también un guardado que venciera todo en el acto.
   */
  it("no promete más allá de la foto que el bucket se lleva primero", async () => {
    const deps = dependencias(null);
    const conFotoVieja: StoredPublicationDraft = {
      ...enTabla,
      photos: [
        {
          key: "incoming/maria/uno",
          name: "Sala",
          bytes: 10,
          uploadedAt: "2026-08-26T09:00:00.000Z",
        },
      ],
    };

    await savePublicationDraft(MARIA, conFotoVieja, AHORA, deps);

    // Subida el 26 a las 09:00 → el bucket la borra el 2 de septiembre a las
    // 09:00, tres horas antes de las veinticuatro que este guardado querría.
    expect(deps.store.save).toHaveBeenCalledWith(
      MARIA,
      conFotoVieja,
      new Date("2026-09-02T09:00:00.000Z"),
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

/**
 * tasks.md 18.34 — **vencido y nunca empezado dejan de ser el mismo observable.**
 *
 * `load` filtra en el `WHERE` con `expires_at > $ahora` y ese filtro se queda:
 * un borrador vencido nunca llega a existir en memoria, que es lo único que
 * impide devolver uno cuyas fotos el barrido de la 18.32 ya está borrando de R2.
 * Lo que se agrega al lado es una lectura angosta que trae UN HECHO —cuándo
 * vence la fila de esta cuenta— y deja la decisión donde vivía sin llamador:
 * `hasDraftExpired`.
 */
describe("qué ve quien vuelve con el borrador vencido (18.34)", () => {
  function conVencimiento(
    load: StoredPublicationDraft | null,
    expiry: Date | null,
  ): PublicationDraftDependencies &
    ExpiredDraftSignalDependencies & {
      readonly store: { load: ReturnType<typeof vi.fn> };
      readonly expiry: { findExpiry: ReturnType<typeof vi.fn> };
    } {
    return {
      ...dependencias(load),
      expiry: { findExpiry: vi.fn(async () => expiry) },
    } as never;
  }

  it("con el borrador vivo no se pregunta nada más, y se devuelve el borrador", async () => {
    // **Coste cero en el camino normal**, que es el argumento entero de esta
    // salida: quien está a mitad de publicar no paga una segunda consulta.
    const deps = conVencimiento(enTabla, null);

    expect(await readPublicationDraftOrExpiry(MARIA, AHORA, deps)).toEqual({
      draft: enTabla,
      expired: false,
    });
    expect(deps.expiry.findExpiry).not.toHaveBeenCalled();
  });

  it("sin borrador y sin fila, no se venció nada: es alguien que nunca empezó", async () => {
    const deps = conVencimiento(null, null);

    expect(await readPublicationDraftOrExpiry(MARIA, AHORA, deps)).toEqual({
      draft: null,
      expired: false,
    });
    expect(deps.expiry.findExpiry).toHaveBeenCalledWith(MARIA);
  });

  it("sin borrador pero con una fila vencida, se venció: es lo que la pantalla explica", async () => {
    const ayer = new Date(AHORA.getTime() - DRAFT_LIFETIME_MS);

    expect(await readPublicationDraftOrExpiry(MARIA, AHORA, conVencimiento(null, ayer))).toEqual({
      draft: null,
      expired: true,
    });
  });

  /**
   * **El par que hace que la decisión sea del dominio y no de la consulta.** Sin
   * esto, «hay fila» y «se venció» serían la misma afirmación y la lectura
   * angosta podría contestar con un `SELECT 1` que reescribiera el borde en SQL
   * — el tercer lugar donde estaría escrito el mismo `>=`. Acá la fila existe y
   * NO venció, y la respuesta es que no se venció.
   */
  it("una fila que todavía no vence no se anuncia como vencida, aunque exista", async () => {
    const manana = new Date(AHORA.getTime() + DRAFT_LIFETIME_MS);

    expect(await readPublicationDraftOrExpiry(MARIA, AHORA, conVencimiento(null, manana))).toEqual({
      draft: null,
      expired: false,
    });
  });
});
