import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EscribinosPage, { metadata } from "./page";

/**
 * tasks.md 23.7 (DECIDIDA 2026-09-04) — "Escribinos" en los bytes que salen
 * de la ruta, la misma disciplina que `entrar-servida.test.tsx` sigue para
 * `/signin`: un render de los bytes prueba que la pantalla INSTALA la
 * decisión, no sólo que el dominio la calcula bien (eso ya lo prueba
 * `contact-message.test.ts`/`contact-screen.test.ts`).
 */
async function servida(searchParams: Record<string, string | string[] | undefined> = {}) {
  return renderToStaticMarkup(
    await EscribinosPage({ searchParams: Promise.resolve(searchParams) }),
  );
}

describe("EscribinosPage — la pantalla del formulario", () => {
  it("dibuja un formulario nativo apuntando a la Server Action, sin JavaScript de por medio", async () => {
    const html = await servida();

    // React arma el POST solo cuando `action` es una función — la misma
    // forma que `reportar/page.tsx` ya usa, sin un `method="post"` propio.
    expect(html).toContain("<form");
    expect(html).toContain("<button");
  });

  it("pide nombre, correo y mensaje, cada uno con su etiqueta", async () => {
    const html = await servida();

    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('name="message"');
  });

  it("nunca publica una dirección de correo — no hay ningún `mailto:`", async () => {
    const html = await servida();

    expect(html).not.toContain("mailto:");
  });

  it("incluye la trampa para bots, oculta de cualquier visitante real", async () => {
    const html = await servida();

    expect(html).toContain('name="sitioWeb"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
  });

  it("no dibuja ningún aviso de error en la carga normal", async () => {
    const html = await servida();

    expect(html).not.toContain("Revisá los datos");
  });

  it("is indexable — the page carries no noindex directive", () => {
    expect(metadata.robots).toBeUndefined();
  });
});

describe("EscribinosPage — el acuse, después de mandar", () => {
  it("dibuja el acuse y ningún formulario cuando llega `?enviado`", async () => {
    const html = await servida({ enviado: "" });

    expect(html).not.toContain("<form");
    expect(html).toContain("Recibimos tu mensaje");
  });
});

describe("EscribinosPage — el rechazo del servidor", () => {
  it("dibuja el aviso de error y vuelve a mostrar el formulario cuando llega `?error`", async () => {
    const html = await servida({ error: "" });

    expect(html).toContain("<form");
    expect(html).toContain("Revisá los datos");
  });
});
