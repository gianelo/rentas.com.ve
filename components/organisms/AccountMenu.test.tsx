import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountMenu } from "./AccountMenu";

const menuSource = readFileSync("components/organisms/AccountMenu.tsx", "utf-8");

const BASE = {
  href: "/mis-avisos",
  triggerLabel: "Mis avisos",
  triggerLabelVisible: true,
  initials: "MF",
  imageUrl: null,
  panelTitle: "María Fernández",
  panelEmail: "maria.f@gmail.com",
  items: [{ label: "Mis avisos", href: "/mis-avisos" }],
};

/**
 * El control de cuenta y su menú (diseño 14a/14b). **Es un enlace real a
 * `/mis-avisos` primero, y una mejora encima segundo** — el orden importa
 * porque es exactamente el orden en que un rastreador y un navegador sin
 * script lo van a ver.
 *
 * Este archivo NO puede probar el clic que abre el panel: `vitest.config.ts`
 * corre en `environment: "node"`, sin DOM ni eventos — la interacción real
 * la prueba `tests/e2e/`. Lo que sí se puede y se debe probar acá,
 * determinísticamente y en cada corrida, es el marcado que un rastreador
 * recibe ANTES de que cualquier script corra: exactamente el riesgo que
 * este trabajo existe para cerrar.
 */
describe("AccountMenu — el piso, antes de cualquier mejora", () => {
  it('es un <a href="/mis-avisos"> de verdad — nunca href="#"', () => {
    const html = renderToStaticMarkup(<AccountMenu {...BASE} />);

    expect(html).toMatch(/<a[^>]*href="\/mis-avisos"/);
    expect(html).not.toContain('href="#"');
  });

  it("el nombre visible del control llega ya resuelto, nunca se recompone acá", () => {
    const html = renderToStaticMarkup(<AccountMenu {...BASE} />);

    expect(html).toContain("Mis avisos");
    expect(html).toContain("MF");
  });

  it("el panel no está en el documento antes del primer clic", () => {
    const html = renderToStaticMarkup(<AccountMenu {...BASE} />);

    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain("María Fernández");
  });

  it("con foto de Google, dibuja la imagen en vez de las iniciales", () => {
    const html = renderToStaticMarkup(
      <AccountMenu {...BASE} imageUrl="https://lh3.googleusercontent.com/x" />,
    );

    expect(html).toContain('src="https://lh3.googleusercontent.com/x"');
    expect(html).not.toContain(">MF<");
  });

  /**
   * tasks.md 14.56 — «Mis avisos» sólo se dice si de verdad hay avisos.
   *
   * **La decisión llega tomada** (`resolveNavAccount` -> `hasListings`): acá
   * no hay un `if` sobre datos, sólo una prop que dice si esas palabras se
   * dibujan. **Y el nombre accesible no se pierde nunca**: sin palabras
   * visibles sigue habiendo `aria-label`, así que el control se sigue
   * anunciando «Mis avisos» a un lector de pantalla y sigue siendo el mismo
   * enlace real a `/mis-avisos`.
   */
  it("sin palabras visibles, queda el círculo — y el nombre accesible sigue ahí", () => {
    const html = renderToStaticMarkup(<AccountMenu {...BASE} triggerLabelVisible={false} />);

    expect(html).not.toMatch(/>Mis avisos</);
    expect(html).toContain('aria-label="Mis avisos"');
    expect(html).toMatch(/<a[^>]*href="\/mis-avisos"/);
    expect(html).toContain("MF");
  });

  it("con palabras visibles, el nombre accesible es el MISMO texto y no una segunda copia", () => {
    const html = renderToStaticMarkup(<AccountMenu {...BASE} />);

    expect(html).toMatch(/>Mis avisos</);
    expect(html).toContain('aria-label="Mis avisos"');
  });

  it("es un componente de cliente — la mejora vive encima del enlace, nunca lo reemplaza", () => {
    expect(menuSource).toContain('"use client"');
  });

  it("el clic que abre el panel llama a preventDefault, nunca reemplaza el href", () => {
    // Ancla el MECANISMO en el código fuente en vez de simular el clic (que
    // el entorno node no puede hacer): si alguien borra el
    // `preventDefault` para "simplificar", el enlace pasa a navegar SIEMPRE
    // con JavaScript encendido, y el menú deja de abrir — un defecto
    // visible de inmediato en cualquier prueba manual, así que lo que este
    // test protege es el caso inverso y silencioso: que alguien quite el
    // `href` real pensando que el `onClick` ya resuelve la navegación.
    expect(menuSource).toContain("preventDefault");
    expect(menuSource).toMatch(/href=\{href\}/);
  });
});
