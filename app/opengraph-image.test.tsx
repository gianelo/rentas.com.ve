import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SOCIAL_CARD_PALETTE,
  SOCIAL_CARD_SIZE,
} from "@/modules/listing-discovery/domain/social-card";
import OpengraphImage, { alt, contentType, size } from "./opengraph-image";

/**
 * **La tarjeta social, probada dibujándola** (tarea 26.12).
 *
 * Una etiqueta `og:image` que apunta a una imagen rota es peor que no tener
 * etiqueta: WhatsApp y X muestran el hueco en vez de no mostrar nada. Por eso
 * acá se ejecuta el `ImageResponse` de verdad y se mira lo que devuelve, en
 * vez de leer el archivo — es el mismo criterio con el que
 * `scripts/lint-tokens.test.ts` corre el gate en lugar de importarlo.
 */
const SOURCE = readFileSync(new URL("./opengraph-image.tsx", import.meta.url), "utf8");

describe("la imagen de Open Graph", () => {
  it("declara lo que Next.js necesita para servirla", () => {
    expect(size).toEqual(SOCIAL_CARD_SIZE);
    expect(contentType).toBe("image/png");
    // El alternativo no es decorativo: es lo que lee quien recibe el enlace
    // con un lector de pantalla, y va en español como el resto del producto.
    expect(alt).toContain("Rentoru");
  });

  /**
   * **El umbral está medido, no elegido.** La primera versión pedía «más de
   * 3000 bytes» y la comprobación de mutación de AGENTS.md §1 la desarmó:
   * vaciar la marca y la bajada dejaba una tarjeta en blanco de **4417 bytes**
   * y el test seguía verde — un umbral que no separaba «dibujó» de «no
   * dibujó». La tarjeta completa mide **45 948 bytes** (el mismo número que
   * devuelve `/opengraph-image` sobre el build), así que 20 000 cae entre las
   * dos con holgura de sobra de cada lado y la mutación ahora sí se pone roja.
   */
  it("devuelve un PNG de verdad, y no un lienzo vacío", async () => {
    const response = OpengraphImage();
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(bytes.byteLength).toBeGreaterThan(20_000);
    // La firma del formato, por si alguien cambia el tipo declarado sin
    // cambiar lo que sale.
    expect(bytes.subarray(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
    // Y las medidas de verdad, leídas del IHDR: que el archivo sea un PNG no
    // dice todavía que salga en el tamaño que WhatsApp y X recortan.
    const header = new DataView(bytes.buffer, bytes.byteOffset);
    expect(header.getUint32(16)).toBe(SOCIAL_CARD_SIZE.width);
    expect(header.getUint32(20)).toBe(SOCIAL_CARD_SIZE.height);
  }, 30_000);

  /**
   * **No inventa un color: los pide.** `scripts/lint-tokens.mjs` escanea este
   * archivo —está bajo `app/` y termina en `.tsx`— pero su propia cabecera
   * dice que las declaraciones escritas como objeto de JavaScript quedan fuera
   * de su alcance, así que un literal acá pasaría el gate sin que nadie lo
   * vea. Esta prueba cierra ese hueco por el único camino que queda: que el
   * archivo no escriba ningún color, y los tome del dominio, donde
   * `social-card.test.ts` los ata a `tokens.css`.
   */
  it("no escribe ni un color literal: la paleta viene del dominio", () => {
    expect(SOURCE).toContain("SOCIAL_CARD_PALETTE");
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\b(?:rgba?|hsla?)\(/);
    expect(SOCIAL_CARD_PALETTE.bg).toMatch(/^#/);
  });
});
