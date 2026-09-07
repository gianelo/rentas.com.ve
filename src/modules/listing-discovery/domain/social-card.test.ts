import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREAS } from "../../listing-catalogue/infrastructure/territorio-areas";
import { SOCIAL_CARD, SOCIAL_CARD_PALETTE, SOCIAL_CARD_SIZE, socialCardAreas } from "./social-card";

/**
 * **La tarjeta social se DERIVA del sistema, y esto es lo que lo comprueba**
 * (AGENTS.md §2, tarea 26.12).
 *
 * `next/og` dibuja fuera de un navegador: no hay cascada, no hay `tokens.css`
 * y `var(--bg)` no resuelve a nada. La única forma honesta de que la tarjeta
 * use la paleta que ship*a* es escribir sus valores una vez —acá— y **atarlos
 * al archivo de tokens con una prueba**, que es lo que `lint:tokens` haría si
 * pudiera leer un objeto de JavaScript (su propia cabecera dice que no puede).
 *
 * El día que alguien retoque `menta`, esta prueba se pone roja y la tarjeta se
 * entera. Sin ella, la tarjeta social sería la única superficie del producto
 * que pinta un color inventado sin que nada la contradiga.
 */
const TOKENS = readFileSync("src/styles/tokens.css", "utf8");

/** El bloque del tema que ship*a*, tal cual lo lee `scripts/lint-tokens.mjs`. */
function mentaToken(name: string): string | undefined {
  const block = /\[data-theme="menta"\]\s*\{([^}]*)\}/.exec(TOKENS)?.[1];
  return new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(block ?? "")?.[1]?.trim();
}

describe("la tarjeta social", () => {
  it("lee un tokens.css que declara la paleta menta", () => {
    // La guarda: sin esto, un cambio de nombre de bloque dejaría a todas las
    // comparaciones de abajo midiendo `undefined` contra `undefined`.
    expect(mentaToken("--bg")).toBeTruthy();
  });

  it("pinta con los colores que declara [data-theme=menta], no con los suyos", () => {
    expect(SOCIAL_CARD_PALETTE.bg).toBe(mentaToken("--bg"));
    expect(SOCIAL_CARD_PALETTE.surface).toBe(mentaToken("--surface"));
    expect(SOCIAL_CARD_PALETTE.line).toBe(mentaToken("--line"));
    expect(SOCIAL_CARD_PALETTE.ink).toBe(mentaToken("--ink"));
    expect(SOCIAL_CARD_PALETTE.soft).toBe(mentaToken("--soft"));
    expect(SOCIAL_CARD_PALETTE.accent).toBe(mentaToken("--accent"));
    expect(SOCIAL_CARD_PALETTE.accentInk).toBe(mentaToken("--accent-ink"));
    expect(SOCIAL_CARD_PALETTE.tint).toBe(mentaToken("--tint"));
  });

  /**
   * SISTEMA.md, «Assets»: *no hay logotipo: la marca es la palabra "Rentoru"
   * en el stack del sistema — con mayúscula inicial y sin punto final*. La
   * tarjeta es la superficie donde más tienta dibujar un logo, así que la
   * ausencia de uno se afirma acá.
   */
  it("lleva la marca escrita como la escribe el sistema, y ningún logotipo", () => {
    expect(SOCIAL_CARD.mark).toBe("Rentoru");
    expect(SOCIAL_CARD.mark.endsWith(".")).toBe(false);
  });

  it("dice en español lo que el producto es, sin prometer lo que no hace", () => {
    expect(SOCIAL_CARD.tagline).toContain("Venezuela");
    expect(SOCIAL_CARD.tagline.toLowerCase()).toContain("gratis");
  });

  /** 1200×630 es lo que recortan Facebook, WhatsApp y X sin re-encuadrar. */
  it("mide 1200×630", () => {
    expect(SOCIAL_CARD_SIZE).toEqual({ width: 1200, height: 630 });
  });

  /**
   * **Las áreas se derivan de `AREAS`, y esto es lo que lo ata.**
   *
   * La primera versión de la tarjeta las escribió a mano y dijo «Distrito
   * Capital · Maracaibo»: un área que la 17.2 había renombrado a «Caracas»
   * por ser factualmente incorrecta, y que el 2026-09-06 dejó de existir en
   * producción. Nada la puso en rojo porque nada la miraba — una tarjeta
   * social no tiene modo de falla, sólo se comparte.
   */
  it("nombra las áreas que el producto cubre, derivadas y no transcritas", () => {
    const linea = socialCardAreas(AREAS.map((area) => area.name));

    for (const area of AREAS) expect(linea).toContain(area.name);
    expect(linea.split(" · ")).toHaveLength(AREAS.length);
  });

  it("no nombra un área que la taxonomía ya no define", () => {
    const nombres = new Set(AREAS.map((area) => area.name));

    expect(nombres.has("Distrito Capital")).toBe(false);
    expect(socialCardAreas([...nombres])).not.toContain("Distrito Capital");
  });
});
