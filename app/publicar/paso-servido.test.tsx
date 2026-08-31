import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  PublicationDraft,
  PublishStepId,
} from "../../src/modules/listing-publication/domain/publication-steps";

/**
 * tasks.md 18.22 — **la anatomía que la pantalla de editar reusa, probada
 * donde nació.**
 *
 * **Por qué aparece recién ahora, y es un hallazgo y no un extra.** Al mover
 * `field` al dominio se corrió la mutación obligatoria: apuntar TODAS las
 * violaciones de publicar al campo `title` no ponía roja una sola prueba de
 * `app/publicar`. `PublishStep.tsx` —638 líneas, los nueve pasos— no tenía
 * archivo de pruebas: lo único que se afirmaba era que la tabla NOMBRA un
 * campo, nunca que el mensaje aterrice bajo ese control. O sea que la razón que
 * la 18.22 cita —«el mensaje va ANTES del campo que lo produjo»— estaba escrita
 * en un comentario y en ninguna aserción.
 *
 * Esto no prueba los nueve pasos. Prueba el mecanismo que las dos pantallas
 * comparten, en el paso donde es más barato mirarlo.
 */

// El componente arrastra la acción de servidor (que trae `next/headers` y la
// base entera) y el subidor de fotos, que es de cliente. Acá se miran los bytes
// que salen del servidor, no lo que pasa al recibirlos.
vi.mock("./actions", () => ({ submitStep: vi.fn() }));
vi.mock("./fotos/PhotoUploader", () => ({ PhotoUploader: () => null }));

import { PublishStep } from "./PublishStep";

const BORRADOR = {
  listing: { priceUsd: 610, title: "Apartamento en La Castellana" },
  photos: [],
} as unknown as PublicationDraft;

function dibujar(stepId: PublishStepId, violations: readonly string[]): string {
  return renderToStaticMarkup(
    <PublishStep
      stepId={stepId}
      draft={BORRADOR}
      violations={violations as never}
      rail={[]}
      progress={30}
      returningToReview={false}
      discardHref={null}
      primaryLabel="Siguiente"
      previousStep={null}
    />,
  );
}

describe("un paso de publicar sirve la negativa al lado de su campo (18.22)", () => {
  /**
   * El mensaje ANTES del control, con su `id`, y el control anunciado. La razón
   * está escrita en `violation-copy.ts` y no es estética: «un borde rojo es
   * invisible para quien no distingue colores y para el modo de alto
   * contraste».
   */
  it("pone el mensaje antes del control que lo produjo y lo anuncia", () => {
    const html = dibujar("precio", ["priceUsd.invalid"]);

    expect(html).toContain('id="priceUsd-error"');
    expect(html).toContain('aria-describedby="priceUsd-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html.indexOf("Solo el número, en dólares")).toBeLessThan(html.indexOf('id="priceUsd"'));
  });

  /**
   * **El par, y es el que la mutación pedía.** Sin él, mandar toda violación al
   * mismo campo pasaría la anterior: un mensaje de precio bajo el título se
   * lee como si el título estuviera mal.
   */
  it("una negativa de otro campo no marca este control", () => {
    const html = dibujar("precio", ["title.required"]);

    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain('id="priceUsd-error"');
  });

  /** Y sin negativas no se anuncia nada: el silencio no miente. */
  it("sin negativas ningún control se anuncia inválido", () => {
    const html = dibujar("precio", []);

    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("-error");
  });
});
