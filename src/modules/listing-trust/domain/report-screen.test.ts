import { describe, expect, it } from "vitest";
import { REPORT_SENT_PARAM, resolveReportScreen } from "./report-screen";
import { AUTO_HIDE_REPORT_THRESHOLD } from "./report-threshold";

/**
 * **La pantalla de reportar, decidida donde el suelo de cobertura llega.**
 *
 * `reportListing` existe, está probado contra Postgres real y **no lo llama
 * ninguna ruta** (tasks.md 8.7): en un navegador nadie puede reportar, así que
 * el umbral de tres reportantes distintos no puede dispararse nunca. Esto es la
 * mitad de esa puerta que sí es una decisión de producto — qué se dibuja y qué
 * se dice — y por eso vive acá y no en `app/`.
 */
describe("resolveReportScreen", () => {
  it("sin el parámetro dibuja el formulario, que es lo único que puede reportar", () => {
    expect(resolveReportScreen(undefined).state).toBe("form");
  });

  /**
   * Sin JavaScript el acuse sólo puede llegar por una URL: la acción redirige
   * a esta misma pantalla con la marca puesta. `?enviado` pelado llega como
   * cadena vacía, que es lo que Next entrega y lo que un `if (flag)` habría
   * tratado como ausente — el acuse no se dibujaría nunca.
   */
  it.each([
    ["pelado, sin valor", ""],
    ["con valor", "1"],
    ["repetido, como lo arma quien edita la URL", ["", "1"]],
  ])("con el parámetro %s dibuja el acuse", (_caso, flag) => {
    expect(resolveReportScreen(flag).state).toBe("sent");
  });

  /**
   * **El acuse no puede decir si el aviso quedó oculto, y no porque acá se
   * elija no decirlo: porque no tiene con qué.**
   *
   * Un acuse que dijera «este aviso quedó oculto» le regala a quien ataca el
   * dato exacto que necesita — cuántas cuentas le faltan. Es la misma forma que
   * AGENTS.md §7 llama preferir el rechazo: el estado bloqueado del contacto
   * **no lleva la propiedad `value` encima**, así que un render no puede
   * filtrarla. Acá igual: `resolveReportScreen` recibe UN argumento —la marca
   * de la URL— y `ReportListingResult` no tiene por dónde entrar.
   */
  it("no tiene por dónde recibir el resultado del reporte", () => {
    expect(resolveReportScreen.length).toBe(1);
  });

  it("dice lo mismo haya ocultado el aviso o no, y no nombra el umbral", () => {
    const acuse = resolveReportScreen("");
    if (acuse.state !== "sent") throw new Error("el acuse no se dibujó");

    // Ni el número del umbral ni ningún otro: una cifra en este texto es un
    // conteo, y un conteo es la mitad del dato que no se da.
    expect(acuse.body).not.toContain(String(AUTO_HIDE_REPORT_THRESHOLD));
    expect(`${acuse.heading} ${acuse.body}`).not.toMatch(/\d/);
    // Ni la consecuencia dicha con palabras, que filtra lo mismo sin cifras.
    expect(`${acuse.heading} ${acuse.body}`).not.toMatch(/ocult/i);
    expect(acuse.body.length).toBeGreaterThan(20);
  });

  /** El nombre del parámetro lo fija el dominio: la acción redirige con él. */
  it("publica el nombre del parámetro con el que la acción redirige", () => {
    expect(REPORT_SENT_PARAM).toBe("enviado");
  });

  /** El formulario nombra su botón; sin texto, nadie sabe qué hace. */
  it("el formulario trae encabezado, explicación y texto del botón", () => {
    const formulario = resolveReportScreen(undefined);
    if (formulario.state !== "form") throw new Error("el formulario no se dibujó");

    expect(formulario.heading.length).toBeGreaterThan(0);
    expect(formulario.body.length).toBeGreaterThan(20);
    expect(formulario.submitLabel).toBe("Enviar el reporte");
  });
});
