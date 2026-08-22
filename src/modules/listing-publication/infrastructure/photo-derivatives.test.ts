import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  DETAIL_MAX_BYTES,
  DETAIL_MAX_EDGE,
  deriveListingPhoto,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_WIDTH,
} from "./photo-derivatives";

/**
 * Tasks 3.10–3.12, design.md D12.
 *
 * **The fixtures are noise on purpose, and this is the single most important
 * decision in this file.** A solid-colour test image compresses to almost
 * nothing, so a byte budget asserted against one passes no matter how badly
 * the encoder is configured — it would be a gate that cannot fail, which is
 * the exact failure this project has already shipped five times. Random
 * pixels are close to incompressible, so they are the worst case a real
 * photograph can approach, and a budget that holds against them holds
 * against anything a phone produces.
 */

/** Incompressible source material, generated rather than committed. */
async function noiseImage(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const pixels = Buffer.allocUnsafe(width * height * channels);
  // Deterministic, so a failure is reproducible. A seeded LCG rather than
  // Math.random: an intermittently-failing budget test is worse than none.
  let seed = 0x2545f491;
  for (let index = 0; index < pixels.length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixels[index] = seed & 0xff;
  }
  return sharp(pixels, { raw: { width, height, channels } }).jpeg({ quality: 100 }).toBuffer();
}

async function dimensionsOf(bytes: Buffer): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(bytes).metadata();
  return { width: width ?? 0, height: height ?? 0 };
}

describe("deriveListingPhoto", () => {
  const SOURCES = [
    ["landscape", 1600, 900],
    ["portrait", 900, 1600],
    ["oversized", 4032, 3024], // a real 12-megapixel phone photo
  ] as const;

  describe.each(SOURCES)("a %s source", (_label, width, height) => {
    it("emits a thumb at exactly the row's derivative size", async () => {
      // 128 × 96 covers the 44 × 34 mobile row and the 64 × 48 desktop row
      // at 2× device pixel ratio (D12/D14). Exact, not "at most": the row
      // is a fixed box, so the derivative crops to fill it rather than
      // letterboxing inside it.
      const { thumb } = await deriveListingPhoto(await noiseImage(width, height));

      expect(await dimensionsOf(thumb.bytes)).toEqual({
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
      });
    });

    it("keeps the thumb inside its byte budget", async () => {
      const { thumb } = await deriveListingPhoto(await noiseImage(width, height));

      expect(thumb.byteLength).toBeLessThanOrEqual(THUMBNAIL_MAX_BYTES);
      expect(thumb.byteLength).toBe(thumb.bytes.byteLength);
    });

    it("bounds the detail image's longest edge without distorting it", async () => {
      const source = await noiseImage(width, height);
      const { full: detail } = await deriveListingPhoto(source);
      const derived = await dimensionsOf(detail.bytes);

      expect(Math.max(derived.width, derived.height)).toBeLessThanOrEqual(DETAIL_MAX_EDGE);

      // Aspect ratio survives to within a pixel of rounding. Cropping a
      // portrait photograph to a landscape box would cut a room in half.
      expect(derived.width / derived.height).toBeCloseTo(width / height, 1);
    });

    it("keeps the detail image inside its byte budget", async () => {
      const { full: detail } = await deriveListingPhoto(await noiseImage(width, height));

      expect(detail.byteLength).toBeLessThanOrEqual(DETAIL_MAX_BYTES);
    });
  });

  it("never enlarges a source smaller than the detail bound", async () => {
    // Upscaling invents pixels and costs bytes for no added detail. A small
    // photo stays small.
    const { full: detail } = await deriveListingPhoto(await noiseImage(400, 300));

    expect(await dimensionsOf(detail.bytes)).toEqual({ width: 400, height: 300 });
  });

  /**
   * Task 3.10. The derivation step cannot hand the original onward: its
   * return type has exactly two members, and neither is the source.
   *
   * This is a structural guarantee, not the whole of D12 — the storage
   * adapter (3.7) must still refuse to PUT the buffer it was given. What
   * this proves is that nothing downstream can retain the original *by
   * receiving it from here*, which is the half this layer can enforce.
   */
  it("returns only derivatives — the original is not among them", async () => {
    const source = await noiseImage(1600, 900);
    const result = await deriveListingPhoto(source);

    // Las cinco, y el original no es ninguna. La forma ES la garantía: no
    // existe un campo por el cual devolverlo.
    expect(Object.keys(result).sort()).toEqual(["card", "detail", "full", "strip", "thumb"]);
    for (const derivative of Object.values(result)) {
      expect(derivative.bytes.equals(source)).toBe(false);
    }
  });

  it("refuses a decompression bomb instead of trying to decode it", async () => {
    // The pixel-dimension half of the upload guard, promised in 3.6 and
    // landed here because it needs the decoder. A 100-megapixel PNG is a
    // few KB on the wire and gigabytes in memory — a byte-length check
    // cannot see it, and this runs on a serverless function with a fixed
    // memory ceiling.
    const bomb = await sharp({
      create: { width: 12_000, height: 12_000, channels: 3, background: "#000" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await expect(deriveListingPhoto(bomb)).rejects.toThrow(/pixel/i);
  });

  it("rejects bytes that are not a decodable image", async () => {
    await expect(deriveListingPhoto(Buffer.from("not an image at all"))).rejects.toThrow();
  });
});

describe("los cinco tamaños que pide el diseño nuevo", () => {
  /**
   * **Cinco derivadas, no dos.** Las dos que existían se dimensionaron para el
   * layout viejo, donde la miniatura de una fila medía 44×34. El diseño nuevo
   * necesita cuatro superficies distintas — tarjeta de 158 en móvil, de 254 en
   * escritorio, tira de la ficha de 328×180, y foto principal de 640×360 —
   * más el visor.
   *
   * **A 1x, y eso lo dice el propio diseño**: "En 4K tampoco se sirven fotos al
   * doble de densidad: chocaría con el presupuesto de bytes".
   */
  const EXPECTED = [
    ["thumb", 160, 120],
    ["card", 256, 192],
    ["strip", 360, 200],
    ["detail", 640, 360],
  ] as const;

  it("emite las cinco, con los nombres que las superficies usan", async () => {
    const { deriveListingPhoto: derive } = await import("./photo-derivatives");
    const derivatives = await derive(await noiseImage(1600, 900));

    expect(Object.keys(derivatives).sort()).toEqual(
      ["card", "detail", "full", "strip", "thumb"].sort(),
    );
  });

  it.each(EXPECTED)("recorta %s a exactamente %i×%i", async (name, width, height) => {
    const derivatives = await deriveListingPhoto(await noiseImage(1600, 900));
    const derivative = (derivatives as Record<string, { bytes: Buffer }>)[name];

    // Recortadas a medida exacta y no ajustadas al interior: la cuadrícula
    // dibuja celdas iguales, y una foto más baja que su vecina deja un hueco.
    expect(await dimensionsOf(derivative!.bytes)).toEqual({ width, height });
  });

  /**
   * **El visor baja de 1280 a 1024 por decisión del fundador (2026-08-22), y
   * la razón está medida.** Esa derivada es el 59% del peso de una foto, así
   * que bajarla devuelve 1.393 avisos de capacidad dentro de los 10 GB
   * gratuitos de R2 — más que cualquier otro recorte posible.
   */
  it("acota el visor a 1024 sin deformarlo", async () => {
    const { full } = await deriveListingPhoto(await noiseImage(4032, 3024));
    const { width, height } = await dimensionsOf(full.bytes);

    expect(Math.max(width, height)).toBe(1024);
    expect(width / height).toBeCloseTo(4032 / 3024, 2);
  });

  it("nunca agranda una fuente más chica que su destino", async () => {
    // Una foto de 300px de ancho no se estira a 640: agrandar inventa píxeles
    // y gasta bytes en ellos.
    const { detail, full } = await deriveListingPhoto(await noiseImage(300, 200));

    expect((await dimensionsOf(detail.bytes)).width).toBeLessThanOrEqual(300);
    expect((await dimensionsOf(full.bytes)).width).toBeLessThanOrEqual(300);
  });

  it("mantiene cada una dentro de su presupuesto de bytes", async () => {
    const derivatives = await deriveListingPhoto(await noiseImage(4032, 3024));
    const { DERIVATIVE_BUDGETS } = await import("./photo-derivatives");

    for (const [name, maxBytes] of Object.entries(DERIVATIVE_BUDGETS)) {
      const derivative = (derivatives as Record<string, { byteLength: number }>)[name];
      expect(derivative!.byteLength).toBeLessThanOrEqual(maxBytes as number);
    }
  });

  /**
   * El número que decide cuántos avisos entran en R2. Se afirma acá para que
   * un cambio de presupuesto sea una decisión visible y no un efecto
   * secundario: subir cualquiera de los cinco baja la capacidad del catálogo.
   */
  it("suma 246 KB por foto, que son 1,44 MB por aviso de seis", async () => {
    const { DERIVATIVE_BUDGETS } = await import("./photo-derivatives");
    const perPhoto = Object.values(DERIVATIVE_BUDGETS).reduce((a, b) => a + (b as number), 0);

    expect(perPhoto).toBe(246 * 1024);
    expect(perPhoto * 6).toBeLessThan(1.5 * 1024 * 1024);
  });
});
