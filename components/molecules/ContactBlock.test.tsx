import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ContactPresentation } from "@/modules/contact-reveal/domain/revealable-contact";
import { ContactBlock, type ContactBlockProps } from "./ContactBlock";

const css = readFileSync("components/molecules/ContactBlock.module.css", "utf-8");

/** Una acción de servidor de mentira: acá se prueba el formulario, no el efecto. */
async function reveal() {}

function render(contact: ContactPresentation, overrides: Partial<ContactBlockProps> = {}) {
  return renderToStaticMarkup(
    <ContactBlock
      contact={contact}
      publisherType="owner"
      publisherName="María F."
      listingId="listing-1"
      listingTitle="Apartamento 2 habitaciones en Chacao"
      signInHref="/signin?callbackUrl=%2Falquiler%2Fcaracas%2Fchacao%2Fapartamento-listing-1"
      revealAction={reveal}
      verifiedAt={null}
      expiresAt={new Date("2026-09-12T12:00:00.000Z")}
      zoneName="Chacao"
      zoneHref="/alquiler/caracas/chacao"
      {...overrides}
    />,
  );
}

/** Lo que se ve en la línea del contacto, sin las clases del CSS Module. */
function contactValue(markup: string): string | null {
  return /data-testid="contact-value">([^<]*)</.exec(markup)?.[1] ?? null;
}

const LOCKED: ContactPresentation = { state: "locked", method: "whatsapp" };
const REVEALED: ContactPresentation = {
  state: "revealed",
  method: "whatsapp",
  value: "+58 412 555 0134",
};

describe("sin cuenta", () => {
  /**
   * **La máscara es una cadena literal, dibujada sin mirar el valor
   * guardado.** Ahí está la garantía entera: no se filtra ni un carácter y a
   * la vez se ve que el contacto existe. Derivarla del número real —
   * reemplazar dígitos, cortar el final — parece más honesto y es justo lo que
   * la rompe: cada dígito conservado es un dígito publicado, y el largo del
   * valor ya dice de qué tipo de número se trata.
   */
  it("dibuja una máscara fija, la misma para cualquier aviso", () => {
    // Dos avisos con métodos distintos dan la MISMA cadena, carácter por
    // carácter: si saliera del valor guardado no podrían coincidir.
    expect(contactValue(render(LOCKED))).toBe("+58 ••• ••• ••••");
    expect(contactValue(render({ state: "locked", method: "telefono" }))).toBe("+58 ••• ••• ••••");
    expect(contactValue(render({ state: "locked", method: "email" }))).toBe("•••••@•••••.•••");
  });

  /**
   * **Un enlace no ejecuta nada, y eso era el agujero.** El botón iba a
   * `/signin` y nunca llamaba a la revelación: se podía entrar y volver a la
   * ficha, y el número seguía tapado. Un `form` con una acción de servidor es
   * lo único que registra el evento — que además es la métrica norte del
   * producto — y sigue funcionando sin JavaScript.
   */
  it("manda un formulario, no un enlace a entrar", () => {
    const markup = render(LOCKED);

    expect(markup).toContain("<form");
    expect(markup).toContain('type="submit"');
    // El id del aviso viaja en el formulario porque la acción es un endpoint
    // HTTP como cualquier otro: la sesión la pone el servidor, el aviso lo
    // pone quien envía.
    expect(markup).toContain('name="listingId"');
    expect(markup).toContain('value="listing-1"');
    expect(markup).not.toContain('href="/signin');
  });

  /**
   * La vuelta a esta misma ficha (F19). Va en el formulario y no en el
   * servidor porque la ficha es la única que conoce su URL canónica — la
   * acción sólo la usa si hace falta mandar a entrar.
   */
  it("lleva la vuelta a esta ficha para cuando la acción tenga que mandar a entrar", () => {
    expect(render(LOCKED)).toContain(
      "/signin?callbackUrl=%2Falquiler%2Fcaracas%2Fchacao%2Fapartamento-listing-1",
    );
  });

  /**
   * "Ver WhatsApp" sobre una dirección de correo es una promesa que el
   * producto no cumple (publishable-listing.ts). El sustantivo lo da el
   * dominio; lo que se prueba acá es que la frase lo use en vez de escribir
   * un canal a mano.
   */
  it("nombra el canal que el aviso realmente guarda", () => {
    expect(render(LOCKED)).toContain("WhatsApp");
    expect(render({ state: "locked", method: "email" })).toContain("email");
    expect(render({ state: "locked", method: "email" })).not.toContain("WhatsApp");
    expect(render({ state: "locked", method: "telefono" })).toContain("teléfono");
  });
});

describe("con cuenta", () => {
  it("muestra el valor completo", () => {
    expect(render(REVEALED)).toContain("+58 412 555 0134");
  });

  /**
   * **La acción sale del método.** Tres métodos, tres aplicaciones distintas:
   * un `mailto:` sobre un teléfono, o un `tel:` sobre un correo, abre la
   * aplicación equivocada con un dato que no entiende — y no falla en ningún
   * lado, sólo no pasa nada.
   */
  it.each([
    ["whatsapp", "+58 412 555 0134", "https://wa.me/584125550134"],
    ["telefono", "0212 555 0134", "tel:+582125550134"],
    ["email", "duenio@ejemplo.com", "mailto:duenio@ejemplo.com"],
  ] as const)("abre la aplicación de %s", (method, value, expected) => {
    expect(render({ state: "revealed", method, value })).toContain(expected);
  });

  /**
   * Lo último que hace el producto antes de que la conversación se vaya a
   * WhatsApp (tasks.md 16.31): el mensaje nombra el aviso, para que quien
   * publicó sepa por cuál de sus propiedades le están escribiendo.
   */
  it("redacta un mensaje que menciona el aviso", () => {
    const markup = render(REVEALED);

    expect(markup).toContain(encodeURIComponent("Apartamento 2 habitaciones en Chacao"));
  });

  /**
   * **Nunca afirma una verificación que no ocurrió.** La columna
   * `phone_verified_at` no existe todavía (tasks.md 16.12) y la verificación
   * por WhatsApp es un stub, así que la ficha pasa `null` — y con `null` la
   * línea no se dibuja. Escrita al revés, con un texto por defecto, la ficha
   * certificaría un número que nadie comprobó.
   */
  it("dice desde cuándo está verificado sólo si lo sabe", () => {
    expect(render(REVEALED)).not.toContain("erificado");

    const conFecha = render(REVEALED, { verifiedAt: new Date("2026-08-19T12:00:00.000Z") });
    expect(conFecha).toContain("Verificado por WhatsApp el 19 ago");
  });

  /**
   * **La única pieza que necesita JavaScript, y degrada.** Sin JS el botón de
   * copiar no aparece: el número queda seleccionable, que es como se copia un
   * teléfono desde siempre. Al revés — un botón dibujado que no hace nada —
   * es peor que no tenerlo: se toca, no pasa nada, y no hay forma de saber si
   * copió.
   */
  it("no dibuja el botón de copiar en el HTML del servidor", () => {
    expect(render(REVEALED)).not.toContain("Copiar");
  });
});

describe("aviso vencido", () => {
  /**
   * Sin contacto en ningún estado de sesión — y el bloque tampoco ofrece la
   * revelación, porque un formulario que se envía para nada es una salida
   * falsa.
   */
  it("no muestra contacto ni ofrece revelarlo", () => {
    const markup = render({ state: "expired" });

    // Ni el valor ni la máscara: el estado vencido no dibuja la línea del
    // contacto en absoluto, así que no hay dónde filtrar nada.
    expect(contactValue(markup)).toBeNull();
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("•••");
  });

  it("explica qué pasó y da una salida a la zona", () => {
    const markup = render({ state: "expired" });

    expect(markup).toContain("Aviso vencido");
    expect(markup).toContain("12 de septiembre");
    // No es un callejón: quien llegó buscando en Chacao sigue buscando en
    // Chacao (nota del diseño, lámina 10c).
    expect(markup).toContain('href="/alquiler/caracas/chacao"');
    expect(markup).toContain("Chacao");
  });
});

describe("la advertencia de la F30", () => {
  it("acompaña al contacto en los dos estados que lo tienen", () => {
    expect(render(LOCKED)).toContain("no participa en la negociación");
    expect(render(REVEALED)).toContain("no participa en la negociación");
  });
});

describe("la hoja de estilos", () => {
  /** Regla transversal: el texto tenue es `--soft`, nunca una opacidad. */
  it("no atenúa nada con opacity", () => {
    expect(css).not.toMatch(/opacity/);
  });

  /** Regla transversal 7: 44px de área táctil en móvil. */
  it("da área táctil a los dos controles del bloque", () => {
    expect(css).toContain("var(--action-h)");
    expect(css).toContain("var(--target-min)");
  });

  /* D16 — ni un literal de color, radio o tamaño de tipografía — no se afirma
     acá: lo verifica `pnpm lint:tokens` sobre `components/` y `app/` enteros.
     Repetirlo en este archivo no agregaba una garantía y sí un choque real:
     el linter lee los `.tsx` con el mismo patrón de declaración CSS, así que
     una expresión regular que contenga `font-size:` se denuncia a sí misma. */
});
