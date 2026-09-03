import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildOrderMenu } from "@/modules/listing-search/domain/search-order";
import { OrderMenu } from "./OrderMenu";

/**
 * Lo que se prueba acá es **marcado**, no reglas: cuáles son los tres órdenes,
 * cuál está puesto y a qué dirección lleva cada uno lo decide
 * `listing-search/domain/search-order.ts`, y ahí está su test.
 *
 * Acá se ata lo único que este componente puede romper solo, y es el piso del
 * D13: **las tres opciones son enlaces de verdad**. Un `<select onchange>` se
 * dibujaría igual y no navegaría con el script apagado, que es como este
 * producto tiene que funcionar.
 */
const BASE = "/alquiler/distrito-capital/chacao";

function render(query: Record<string, string | undefined>) {
  return renderToStaticMarkup(<OrderMenu model={buildOrderMenu(BASE, query)} />);
}

describe("el menú de orden (14.47)", () => {
  it("las tres opciones son anclas con `href`, no controles de formulario", () => {
    const html = render({});

    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<button");
  });

  it("se abre sin una línea de JavaScript: es un `<details>` nativo", () => {
    // Sin script no hay estado en memoria. `<details>` es el único
    // desplegable que el navegador abre solo, y si algún navegador no lo
    // soportara las tres opciones quedan a la vista — que es la única
    // degradación que no borra una función.
    const html = render({});

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
  });

  it("cerrado muestra el orden puesto, que es lo que la lámina dibuja", () => {
    expect(render({})).toContain("Recientes");
    expect(render({ orden: "precio-desc" })).toContain("Precio: mayor a menor");
  });

  it("el orden puesto se anuncia, y no sólo se pinta", () => {
    // `aria-current` y no una clase: quien no ve el color tiene que poder
    // saber cuál está puesto.
    expect(render({ orden: "precio-asc" })).toContain('aria-current="true"');
  });
});
