import { describe, expect, it } from "vitest";
import { composeNotice, noticeDueFor } from "./lifecycle-notice";

const EXPIRES_AT = new Date("2026-08-31T10:00:00.000Z");
// El ciclo del plan: publicado el día 1, vence el 30, purga el 45.
const DAY_27 = new Date("2026-08-28T10:00:00.000Z");
const DAY_40 = new Date("2026-09-10T10:00:00.000Z");

describe("noticeDueFor", () => {
  it("el día 27 toca el aviso de vencimiento", () => {
    expect(noticeDueFor(EXPIRES_AT, DAY_27)).toBe("expiry");
  });

  it("el día 40 toca el aviso de purga", () => {
    expect(noticeDueFor(EXPIRES_AT, DAY_40)).toBe("purge");
  });

  // La franja del medio: ya venció, todavía faltan más de 5 días para la
  // purga. No hay nada que decir, y decir algo sería el tercer correo que
  // nadie pidió.
  it("no toca nada entre el vencimiento y la anticipación de la purga", () => {
    expect(noticeDueFor(EXPIRES_AT, new Date("2026-09-02T10:00:00.000Z"))).toBeNull();
  });

  it("no toca nada mucho antes de vencer", () => {
    expect(noticeDueFor(EXPIRES_AT, new Date("2026-08-10T10:00:00.000Z"))).toBeNull();
  });

  // **Los dos correos son dos, y esto es lo que lo prueba.** Un solo aviso
  // dejaría a quien ignoró el primero sin segunda advertencia antes de una
  // borrada irreversible (19.5/19.8).
  it("el mismo aviso recibe DOS avisos distintos a lo largo de su ciclo", () => {
    expect(new Set([noticeDueFor(EXPIRES_AT, DAY_27), noticeDueFor(EXPIRES_AT, DAY_40)])).toEqual(
      new Set(["expiry", "purge"]),
    );
  });

  it("después de la purga ya no hay nada que avisar", () => {
    expect(noticeDueFor(EXPIRES_AT, new Date("2026-09-16T10:00:00.000Z"))).toBeNull();
  });
});

describe("composeNotice", () => {
  const listing = { id: "abc", title: "Apartamento 2 habitaciones", expiresAt: EXPIRES_AT };

  it("el aviso de vencimiento cuenta los días que faltan y ofrece renovar", () => {
    const notice = composeNotice("expiry", listing, DAY_27, "https://rentas.com.ve/renovar/T");

    expect(notice.subject).toContain("3 días");
    expect(notice.body).toContain(listing.title);
    expect(notice.body).toContain("https://rentas.com.ve/renovar/T");
  });

  // El segundo correo tiene que nombrar la consecuencia —las fotos— y la
  // fecha. «Tu aviso vence» otra vez no le dice a nadie que va a perder algo.
  it("el aviso de purga nombra las fotos y el día en que se borran", () => {
    const notice = composeNotice("purge", listing, DAY_40, "https://rentas.com.ve/renovar/T");

    expect(notice.subject.toLowerCase()).toContain("foto");
    expect(notice.body).toContain("15 de septiembre de 2026");
    expect(notice.body).toContain("https://rentas.com.ve/renovar/T");
  });
});
