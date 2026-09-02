import { describe, expect, it } from "vitest";
import { retentionNoticeFor } from "./retention-notice";

/**
 * tasks.md 19.6 y 19.7 — el segundo canal de la retención, y qué promete el
 * botón a cada lado de la purga.
 *
 * El vencimiento de referencia es el 1 de septiembre; la purga cae 15 días
 * después, el 16 de septiembre (`PURGE_GRACE_DAYS`). Las fechas se escriben
 * al mediodía UTC a propósito: a las 02:00 Z el día en Caracas es el
 * anterior, que es justamente el error que `spanish-date.ts` documenta.
 */

const VENCIO = new Date("2026-09-01T12:00:00Z");

describe("el conteo regresivo de la purga (19.6)", () => {
  it("nombra el día en que las fotos se borran y cuántos faltan", () => {
    const aviso = retentionNoticeFor(4, VENCIO, new Date("2026-09-06T12:00:00Z"));

    expect(aviso.kind).toBe("countdown");
    expect(aviso.deadline).toBe("Sus fotos se borran el 16 de septiembre — faltan 10 días.");
  });

  it("dice «1 día» y no «1 días» la víspera", () => {
    const aviso = retentionNoticeFor(4, VENCIO, new Date("2026-09-15T12:00:00Z"));

    expect(aviso.deadline).toBe("Sus fotos se borran el 16 de septiembre — falta 1 día.");
  });

  /**
   * **El trabajo de purga todavía no tiene cron en `vercel.json` (19.4), así
   * que la fecha puede quedar atrás con las fotos todavía ahí.** Prometer «se
   * borran el 16 de septiembre» el 20 de septiembre sería nombrar un día que
   * ya pasó; el conteo deja de dar fecha y dice lo único cierto.
   */
  it("pasado el día deja de prometer una fecha que ya pasó", () => {
    const enElDia = retentionNoticeFor(4, VENCIO, new Date("2026-09-16T12:00:00Z"));
    const cuatroDiasTarde = retentionNoticeFor(4, VENCIO, new Date("2026-09-20T12:00:00Z"));

    expect(enElDia.deadline).toBe("Sus fotos se borran en la próxima limpieza.");
    expect(cuatroDiasTarde.deadline).toBe(enElDia.deadline);
    expect(cuatroDiasTarde.deadline).not.toContain("septiembre");
  });

  it("sin fotos el conteo se acabó, y lo dice en pasado", () => {
    const aviso = retentionNoticeFor(0, VENCIO, new Date("2026-09-20T12:00:00Z"));

    expect(aviso.kind).toBe("purged");
    expect(aviso.deadline).toBe("Las fotos de este aviso ya se borraron.");
  });

  /**
   * **La cuenta de fotos manda sobre el reloj, y no al revés.** El reloj dice
   * cuándo DEBERÍAN borrarse; la fila dice si se borraron. Con el cron
   * ausente los dos discrepan durante días, y decidir por el reloj le diría a
   * quien todavía tiene sus seis fotos que las perdió.
   */
  it("con la fecha pasada pero las fotos todavía ahí, el aviso sigue siendo el conteo", () => {
    const aviso = retentionNoticeFor(6, VENCIO, new Date("2026-10-01T12:00:00Z"));

    expect(aviso.kind).toBe("countdown");
  });
});

describe("qué promete «volver a publicar» (19.7)", () => {
  /**
   * **Las dos ramas en una sola aserción, a propósito.** Cualquiera de las
   * dos sola pasa con la decisión entera borrada: una función que devuelve
   * siempre la misma frase cumple la mitad que se afirme. Lo que hay que
   * afirmar es que son DISTINTAS y que cada una dice lo suyo.
   */
  it("promete el aviso con sus fotos antes de la purga, y subirlas de nuevo después", () => {
    const antes = retentionNoticeFor(4, VENCIO, new Date("2026-09-06T12:00:00Z"));
    const despues = retentionNoticeFor(0, VENCIO, new Date("2026-09-20T12:00:00Z"));

    expect(antes.republish).toBe("Renovalo antes de esa fecha y el aviso vuelve con sus fotos.");
    expect(despues.republish).toBe("Volver a publicarlo significa subir las fotos de nuevo.");
    expect(antes.republish).not.toBe(despues.republish);
  });

  it("sin fecha que nombrar, la promesa tampoco la nombra", () => {
    const aviso = retentionNoticeFor(4, VENCIO, new Date("2026-09-20T12:00:00Z"));

    expect(aviso.republish).toBe(
      "Renovalo ya: mientras las fotos estén, el aviso vuelve con ellas.",
    );
  });
});
