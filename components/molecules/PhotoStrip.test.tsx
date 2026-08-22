import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ListingPhotoView } from "@/modules/listing-discovery/application/ports/listing-photos.port";
import { PhotoStrip } from "./PhotoStrip";

const BASE = "https://fotos.rentas.com.ve";
const HREF = "/alquiler/caracas/chacao/apto-2-hab-abc123";

function photo(position: number): ListingPhotoView {
  return {
    position,
    keys: {
      thumb: `photos/p${position}/thumb.webp`,
      card: `photos/p${position}/card.webp`,
      strip: `photos/p${position}/strip.webp`,
      detail: `photos/p${position}/detail.webp`,
      full: `photos/p${position}/full.webp`,
    },
  };
}

const SIX = [0, 1, 2, 3, 4, 5].map(photo);

function render(overrides: Partial<Parameters<typeof PhotoStrip>[0]> = {}) {
  return renderToStaticMarkup(
    <PhotoStrip
      photos={SIX}
      publicBaseUrl={BASE}
      title="Apartamento 2 habitaciones"
      zone="Chacao"
      href={HREF}
      {...overrides}
    />,
  );
}

const css = readFileSync("components/molecules/PhotoStrip.module.css", "utf-8");
const source = readFileSync("components/molecules/PhotoStrip.tsx", "utf-8");

describe("PhotoStrip", () => {
  /**
   * **El techo de 500 KB de la ficha es lo que decide esto, no el gusto.** Seis
   * fotos pedidas a la vez son seis descargas en el camino crítico sobre una
   * conexión móvil venezolana; una sola lo es. `loading="lazy"` en las otras
   * cinco es la diferencia entre entrar en el presupuesto y no entrar.
   */
  it("pide una sola foto con la página y difiere las otras cinco", () => {
    const markup = render();

    expect(markup.match(/loading="eager"/g)).toHaveLength(1);
    expect(markup.match(/loading="lazy"/g)).toHaveLength(5);
  });

  it("la que se pide con la página es la primera, no una cualquiera", () => {
    const markup = render();

    expect(markup.indexOf('loading="eager"')).toBeLessThan(markup.indexOf('loading="lazy"'));
  });

  /**
   * El texto alternativo sale de `photoAltText` y no de acá. La regla de que la
   * posición va primero (R7) es una decisión de accesibilidad tomada a
   * propósito, y reescribirla en el componente es cómo se pierde.
   */
  it("compone el alternativo con photoAltText, con la posición adelante", () => {
    const markup = render();

    expect(markup).toContain('alt="Foto 1 de 6 — Apartamento 2 habitaciones, Chacao"');
    expect(markup).toContain('alt="Foto 6 de 6 — Apartamento 2 habitaciones, Chacao"');
  });

  it("arma las URLs con photoUrl sobre la base pública", () => {
    const markup = render();

    expect(markup).toContain(`${BASE}/photos/p0/strip.webp`);
    expect(markup).toContain(`${BASE}/photos/p5/strip.webp`);
  });

  /**
   * **Un componente con puntos de quiebre, no dos.** El escritorio no vuelve a
   * dibujar la tira: la misma marca pide otra derivada con `<picture>`, así que
   * el navegador baja exactamente una imagen por foto.
   */
  it("en escritorio pide `detail` para la principal y `thumb` para las demás", () => {
    const markup = render();

    // El nombre del atributo va sin distinguir mayúsculas a propósito: HTML no
    // las distingue y React eligió una grafía que no es contrato de nadie.
    expect(markup).toMatch(
      new RegExp(
        `<source media="\\(min-width: 768px\\)" srcset="${BASE}/photos/p0/detail\\.webp"`,
        "i",
      ),
    );
    expect(markup).toMatch(
      new RegExp(
        `<source media="\\(min-width: 768px\\)" srcset="${BASE}/photos/p1/thumb\\.webp"`,
        "i",
      ),
    );
    // La grande es una sola: las otras cinco nunca piden la derivada de 640.
    expect(markup.match(/detail\.webp/g)).toHaveLength(1);
  });

  it("cada foto enlaza a la ficha — el visor todavía no existe", () => {
    const markup = render();

    expect(markup.match(new RegExp(`href="${HREF}"`, "g"))).toHaveLength(6);
  });

  /**
   * La cota es la del dominio (`MAX_PHOTOS_PER_LISTING`), no un 6 escrito acá:
   * un número de negocio copiado en un componente es un número que deja de
   * coincidir el día que el negocio cambia.
   */
  it("no dibuja más fotos que las que un aviso puede tener", () => {
    const markup = render({ photos: [...SIX, photo(6), photo(7)] });

    expect(markup.match(/<img /g)).toHaveLength(6);
  });

  /**
   * Una fila sin sus derivadas es un registro roto, y una `<img>` rota se lee
   * como una ficha rota. Se saltea, y el total del alternativo cuenta lo que se
   * dibuja: "Foto 2 de 5" sobre cinco fotos es verdad; "Foto 2 de 6" no.
   */
  it("saltea una foto sin derivadas y cuenta el total sobre lo que dibuja", () => {
    const markup = render({ photos: [photo(0), { position: 1, keys: {} }, photo(2)] });

    expect(markup.match(/<img /g)).toHaveLength(2);
    expect(markup).toContain('alt="Foto 2 de 2 — Apartamento 2 habitaciones, Chacao"');
  });

  it("no dibuja nada cuando el aviso no tiene fotos", () => {
    expect(render({ photos: [] })).toBe("");
  });

  /**
   * Sin `R2_BUCKET_PUBLIC_URL` cada URL quedaría relativa al propio sitio: seis
   * íconos rotos en vez de un error. Ninguna tira es más honesto.
   */
  it("no dibuja nada cuando el bucket público no está configurado", () => {
    expect(render({ publicBaseUrl: "" })).toBe("");
  });

  it("dibuja un punto por foto, y ninguno cuando hay una sola", () => {
    expect(render().match(/data-testid="photo-dot"/g)).toHaveLength(6);
    expect(render({ photos: [photo(0)] })).not.toContain("photo-dot");
  });

  /**
   * **Sin JavaScript.** La tira es scroll nativo con `scroll-snap`: la regla del
   * proyecto es que leer un aviso funcione con el script apagado, y un carrusel
   * deja seis fotos inalcanzables en cuanto no llega.
   */
  it("es scroll nativo con scroll-snap, y no lleva JavaScript de cliente", () => {
    expect(css).toMatch(/scroll-snap-type:\s*x mandatory/);
    expect(css).toMatch(/scroll-snap-align:\s*center/);
    expect(source).not.toContain('"use client"');
  });

  /** Regla transversal: el texto tenue es `--soft`, nunca una opacidad. */
  it("no atenúa nada con opacity", () => {
    expect(css).not.toMatch(/opacity/);
  });

  /** El punto de quiebre del proyecto es uno solo, y son 768px. */
  it("declara un único punto de quiebre, el del proyecto", () => {
    const queries = [...css.matchAll(/@media([^{]+)\{/g)].map((match) => match[1]?.trim());

    expect(queries.length).toBeGreaterThan(0);
    expect(new Set(queries)).toEqual(new Set(["(min-width: 768px)"]));
  });
});
