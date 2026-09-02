import { afterEach, describe, expect, it, vi } from "vitest";
import { contactVerificationNotice } from "./contact-verification-notice";

/** Un instante del pasado, fijo y por valor: no cambia de sujeto con el calendario. */
const VERIFICADO_EL_19 = new Date("2026-08-19T12:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

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

  /**
   * **La 19.12, y hasta hoy no la medía nadie.** Un aviso vive 30 días y
   * puede publicarse el último día de una verificación, así que los dos
   * relojes se cruzan a mitad de vuelo. Lo que mantiene honesta a la ficha es
   * estructural —esta función no recibe `now`, así que no tiene CON QUÉ
   * decidir si la verificación sigue viva—, y lo que se afirma acá es su
   * consecuencia visible: la misma fila dice la misma frase el día que se
   * verificó y cinco años después.
   *
   * **Por qué hacía falta una prueba nueva y no alcanzaba con las de
   * arriba**: todas fijan un instante de hace trece días, así que un `if` de
   * caducidad metido en esta función —«verificación vencida», o `null`— las
   * dejaría a las tres en verde y la 19.12 dejaría de ser cierta sin que nada
   * se pusiera rojo.
   */
  it("dice lo mismo cinco años después: no tiene reloj con qué decidir si sigue vigente", () => {
    const HACE_TRES_ANOS = new Date("2023-08-19T12:00:00.000Z");
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    const yaCaducada = contactVerificationNotice("whatsapp", HACE_TRES_ANOS);

    vi.setSystemTime(new Date("2031-09-01T12:00:00.000Z"));
    const muchoDespues = contactVerificationNotice("whatsapp", HACE_TRES_ANOS);

    // Positiva y no sólo «no cambió»: sigue diciendo CUÁNDO, que es lo que la
    // lámina dibuja, en vez de callarse o de afirmar un estado.
    expect(yaCaducada).toBe("verificado por WhatsApp el 19 ago.");
    expect(muchoDespues).toBe(yaCaducada);
  });
});
