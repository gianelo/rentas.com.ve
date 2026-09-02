import { describe, expect, it } from "vitest";
import {
  DRAFT_LIFETIME_MS,
  draftExpiresAt,
  hasDraftExpired,
  INCOMING_RETENTION_MS,
  stampUploadInstants,
} from "./draft-expiry";

describe("draftExpiresAt", () => {
  it("son las veinticuatro horas del fundador, contadas desde el momento que se le pasa", () => {
    expect(draftExpiresAt(new Date("2026-09-01T14:30:00.000Z"))).toEqual(
      new Date("2026-09-02T14:30:00.000Z"),
    );
    expect(DRAFT_LIFETIME_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("volver a guardar corre el vencimiento hacia adelante: quien vuelve retoma donde estaba", () => {
    // Se afirma la DIFERENCIA y no que el segundo sea mayor: «mayor» lo cumple
    // también una función que devuelva el instante recibido sin sumarle nada.
    const primero = draftExpiresAt(new Date("2026-09-01T08:00:00.000Z"));
    const alDiaSiguiente = draftExpiresAt(new Date("2026-09-02T07:00:00.000Z"));

    expect(alDiaSiguiente.getTime() - primero.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("no toca el instante que recibe", () => {
    // `now.setUTCHours(now.getUTCHours() + 24)` devuelve el número correcto habiendo
    // movido el reloj de quien llamó, que lo sigue usando después.
    const ahora = new Date("2026-09-01T14:30:00.000Z");
    draftExpiresAt(ahora);
    expect(ahora.toISOString()).toBe("2026-09-01T14:30:00.000Z");
  });
});

describe("hasDraftExpired", () => {
  it("un borrador de hace una hora sigue vivo, y uno de hace dos días no", () => {
    const ahora = new Date("2026-09-02T10:00:00.000Z");
    expect(hasDraftExpired(new Date("2026-09-02T11:00:00.000Z"), ahora)).toBe(false);
    expect(hasDraftExpired(new Date("2026-08-31T10:00:00.000Z"), ahora)).toBe(true);
  });

  it("en el instante exacto ya venció, y el borde se cierra hacia el vencimiento", () => {
    // AGENTS.md §7: la forma preferida es la negativa. El barrido borra fotos de R2
    // por esta misma regla, así que el empate cae del lado de «no lo devuelvas».
    const instante = new Date("2026-09-02T10:00:00.000Z");
    expect(hasDraftExpired(instante, instante)).toBe(true);
  });
});

/**
 * tasks.md 18.36 — **el borrador no puede prometer más de lo que el bucket
 * conserva.**
 *
 * `save` corre el vencimiento en CADA guardado, así que un borrador renovado a
 * diario vive para siempre; el objeto `incoming/` que nombra se muere a los siete
 * días CONTADOS DESDE LA SUBIDA, una cuenta que ningún guardado corre. No es un
 * huérfano: es una foto viva que se muere debajo de un borrador que sigue
 * valiendo, y quien vuelve el octavo día llega a `processUploadedPhoto` con una
 * clave que ya no existe.
 */
describe("draftExpiresAt con las fotos del borrador (18.36)", () => {
  const AHORA = new Date("2026-09-08T12:00:00.000Z");
  const MANANA = new Date("2026-09-09T12:00:00.000Z");

  const foto = (uploadedAt?: string) => ({
    key: `incoming/maria/${uploadedAt ?? "sin"}`,
    name: "Sala",
    bytes: 10,
    uploadedAt,
  });

  it("sin fotos, y con una recién subida, siguen siendo las veinticuatro horas enteras", () => {
    // El par positivo de todo lo que sigue: sin él, un tope que devolviera
    // siempre `now` pasaría cada una de las pruebas de recorte. La retención es
    // la regla del fundador, que el 2026-09-01 la subió de 1 día a 7.
    expect(INCOMING_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(draftExpiresAt(AHORA, [])).toEqual(MANANA);
    expect(draftExpiresAt(AHORA, [foto("2026-09-08T11:00:00.000Z")])).toEqual(MANANA);
  });

  it("una foto que se muere antes de mañana acorta el borrador hasta ella", () => {
    // Subida el día 2 a las 09:00 → el bucket la borra el 9 a las 09:00, tres
    // horas ANTES de las veinticuatro que este guardado querría prometer.
    expect(draftExpiresAt(AHORA, [foto("2026-09-02T09:00:00.000Z")])).toEqual(
      new Date("2026-09-09T09:00:00.000Z"),
    );
  });

  it("manda la MÁS VIEJA, que es la primera que el bucket se lleva", () => {
    // Con `Math.max`, o mirando sólo la primera, la de hoy taparía a la del día 2
    // y el borrador volvería a prometer más de lo que el bucket conserva.
    const photos = [foto("2026-09-08T11:00:00.000Z"), foto("2026-09-02T09:00:00.000Z")];

    expect(draftExpiresAt(AHORA, photos)).toEqual(new Date("2026-09-09T09:00:00.000Z"));
  });

  it("una foto sin sello, o con uno ilegible, no acorta nada", () => {
    // El sello lo pone `stampUploadInstants` en el mismo guardado que calcula
    // este vencimiento, así que «sin sello» es una fila anterior a esta regla — y
    // acortarla le quitaría el borrador a alguien por un despliegue que no vio.
    expect(draftExpiresAt(AHORA, [foto()])).toEqual(MANANA);
    expect(draftExpiresAt(AHORA, [foto("ayer por la tarde")])).toEqual(MANANA);
  });

  it("cuando la foto ya se murió, el borrador ya venció: el borde no se estira hasta `now`", () => {
    // AGENTS.md §7, la negativa: la fila queda vencida, `load` no la devuelve y
    // `readPublicationDraftOrExpiry` (18.34) lo explica — en vez de dejar que
    // publicar falle leyendo un objeto que el bucket ya se llevó.
    const vencido = draftExpiresAt(AHORA, [foto("2026-09-01T09:00:00.000Z")]);

    expect(vencido).toEqual(new Date("2026-09-08T09:00:00.000Z"));
    expect(hasDraftExpired(vencido, AHORA)).toBe(true);
  });
});

/**
 * tasks.md 18.36 — **el sello lo pone el servidor y no el formulario.**
 *
 * El paso 8 manda las fotos en campos ocultos y `applyStepAnswers` reemplaza el
 * arreglo entero con lo que llegó, así que un `uploadedAt` que viajara ahí sería
 * el navegador decidiendo cuánto vive el borrador. Acá se conserva POR CLAVE lo
 * que ya estaba guardado, que es la mitad que hace que el tope sirva: resellar en
 * cada guardado devolvería el defecto entero.
 */
describe("stampUploadInstants (18.36)", () => {
  const AHORA = new Date("2026-09-08T12:00:00.000Z");
  const VIEJO = "2026-09-02T09:00:00.000Z";

  const draftCon = (photos: readonly { key: string; uploadedAt?: string }[]) =>
    ({ listing: {}, photos: photos.map((p) => ({ name: "Foto", bytes: 10, ...p })) }) as never;

  it("una clave nueva estrena este instante, y una que ya estaba conserva SU sello", () => {
    const before = draftCon([{ key: "incoming/maria/uno", uploadedAt: VIEJO }]);

    const after = stampUploadInstants(
      before,
      draftCon([{ key: "incoming/maria/uno" }, { key: "incoming/maria/dos" }]),
      AHORA,
    );

    expect(after.photos).toEqual([
      { key: "incoming/maria/uno", name: "Foto", bytes: 10, uploadedAt: VIEJO },
      { key: "incoming/maria/dos", name: "Foto", bytes: 10, uploadedAt: AHORA.toISOString() },
    ]);
  });

  it("quitar una foto se lleva su sello, y el orden que llega es el que vuelve", () => {
    // El paso 8 es también donde se reordena: un sellado que ordenara por fecha
    // cambiaría la portada del aviso sin que nadie lo pidiera.
    const before = draftCon([
      { key: "incoming/maria/uno", uploadedAt: VIEJO },
      { key: "incoming/maria/dos", uploadedAt: VIEJO },
    ]);

    const after = stampUploadInstants(
      before,
      draftCon([{ key: "incoming/maria/dos" }, { key: "incoming/maria/tres" }]),
      AHORA,
    );

    expect(after.photos.map((photo) => photo.key)).toEqual([
      "incoming/maria/dos",
      "incoming/maria/tres",
    ]);
    expect(after.photos.map((photo) => photo.uploadedAt)).toEqual([VIEJO, AHORA.toISOString()]);
  });

  it("un sello que llegue en el formulario se descarta: el instante lo pone el servidor", () => {
    // `current` ES el formulario. Un navegador que mandara un sello de mañana
    // correría el vencimiento de una foto que el bucket va a borrar igual.
    const current = draftCon([
      { key: "incoming/maria/uno", uploadedAt: "2027-01-01T00:00:00.000Z" },
    ]);

    expect(stampUploadInstants(draftCon([]), current, AHORA).photos[0]?.uploadedAt).toBe(
      AHORA.toISOString(),
    );
  });
});
