import { describe, expect, it } from "vitest";
import { contactVerificationNotice } from "./contact-verification-notice";

/** Un instante del pasado, fijo y por valor: no cambia de sujeto con el calendario. */
const VERIFICADO_EL_19 = new Date("2026-08-19T12:00:00.000Z");

describe("contactVerificationNotice", () => {
  /**
   * **Sin fila no hay nada que dibujar, y ésa es la garantía entera de la
   * 19.9.** La ausencia de fila en `verified_contact` ES la respuesta «no
   * verificado» (AGENTS.md §7), así que la frase tiene que ser `null` y no
   * «sin verificar», ni un rótulo vacío: las láminas de la ficha dibujan tres
   * estados —sin cuenta, con cuenta y vencido— y NINGUNO tiene estado
   * negativo. Un texto por defecto acá convertiría un hueco en una
   * afirmación.
   */
  it("no dice nada cuando la verificación no ocurrió", () => {
    expect(contactVerificationNotice("whatsapp", null)).toBeNull();
    expect(contactVerificationNotice("email", null)).toBeNull();
    expect(contactVerificationNotice("telefono", null)).toBeNull();
  });

  /**
   * La frase de la lámina de la ficha (artboard 10b, §6 de la
   * especificación), fijada POR VALOR: «verificado por WhatsApp el 19 ago».
   * Dice CUÁNDO y nunca «vigente» — un aviso puede publicarse el último día
   * de una verificación y los dos relojes se cruzan (tasks.md 19.12).
   */
  it("dice por qué canal y desde cuándo", () => {
    expect(contactVerificationNotice("whatsapp", VERIFICADO_EL_19)).toBe(
      "verificado por WhatsApp el 19 ago.",
    );
  });

  /**
   * **El canal es el de la fila, no «WhatsApp» por defecto.** El canal de
   * WhatsApp está diferido al final del proyecto (fundador, 2026-08-29:
   * cuesta por mensaje), así que HOY la única fila que
   * `resolveContactVerification` escribe es la del correo propio (19.10).
   * Escribir «verificado por WhatsApp» sobre esa fila certificaría un
   * mensaje que nunca se mandó.
   *
   * Que no pueda pasar es estructural y no una comprobación: la consulta de
   * `findEvidence` fija `method` y `value` en el `JOIN`, así que la fila que
   * vuelve pertenece exactamente al triple que se preguntó — y el que se
   * pregunta es el contacto que el aviso copió al publicar.
   */
  it("nombra el canal que se verificó, y hoy el que existe es el correo", () => {
    expect(contactVerificationNotice("email", VERIFICADO_EL_19)).toBe(
      "verificado por email el 19 ago.",
    );
    expect(contactVerificationNotice("telefono", VERIFICADO_EL_19)).toBe(
      "verificado por teléfono el 19 ago.",
    );
  });
});
