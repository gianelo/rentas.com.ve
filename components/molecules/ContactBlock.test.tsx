import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ContactPresentation } from "@/modules/contact-reveal/domain/revealable-contact";
import { lockedContactNotice } from "@/modules/contact-reveal/domain/sign-in-door";
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
      doorHref="/alquiler/caracas/chacao/apartamento-listing-1?entrar=si"
      revealAction={reveal}
      verificationNotice={null}
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

/**
 * **Quién publica, dicho con palabras** (14.54).
 *
 * Esta línea no tenía una sola prueba, y la 14.54 la convirtió en la ÚNICA que
 * lo dice dentro de la ficha: la decisión del fundador sacó la placa del
 * encabezado —la mudanza que la 14.43 había construido— con el argumento de que
 * «la ficha ya lo dice adentro». Sin esta prueba, ese argumento se apoyaba en
 * un renglón que cualquiera podía borrar con todos los gates en verde; medido
 * con una mutación antes de escribirla, y daba **cero rojos**.
 *
 * Se comprueba con las DOS palabras porque el ternario tiene dos ramas y la
 * mitad de los avisos son de inmobiliaria: una sola rama deja la otra sin quien
 * la mire.
 */
describe("quién publica se dice con palabras, no sólo con un tono (14.54)", () => {
  it("dice «publica como dueño» y «publica como inmobiliaria»", () => {
    expect(render(LOCKED)).toContain("publica como dueño");
    expect(render(LOCKED, { publisherType: "broker" })).toContain("publica como inmobiliaria");
  });

  /**
   * Sin nombre no hay a quién atribuirle nada, y un «publica como dueño» suelto
   * describiría a nadie. Es la misma guarda que el marcado ya tiene, afirmada
   * desde afuera para que sacarla se note.
   */
  it("un aviso sin nombre de publicante no dibuja la línea", () => {
    expect(render(LOCKED, { publisherName: null })).not.toContain("publica como");
  });
});

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
   * **El campo arranca VACÍO, y eso es la función entera.**
   *
   * `design.md` descartó el modelo de bid con un argumento concreto: revelar
   * pasa a costar "a message per listing instead of a click". Un `defaultValue`
   * cumpliría la spec al pie de la letra — se envía un mensaje, no está en
   * blanco, se guarda — y vaciaría ese argumento, porque revelar seguiría
   * costando exactamente un clic. La redacción sugerida tiene que GUIAR sin
   * contestar por quien busca.
   *
   * Se prueba acá y no en el dominio porque el dominio ya hace su parte
   * (`requireRevealMessage` rechaza el blanco) y no puede ver esto: un campo
   * precargado le llega como un mensaje legítimo. La única capa que distingue
   * "lo escribió una persona" de "se lo escribimos nosotros" es la que dibuja
   * el formulario.
   */
  it("deja el campo del mensaje vacío: la sugerencia es pista, no respuesta", () => {
    const markup = render(LOCKED);
    const textarea = /<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(markup);

    if (!textarea) throw new Error("falta el campo del mensaje en el estado bloqueado");

    // Lo que se envía si nadie escribe: nada. Un `defaultValue` pondría acá
    // adentro la redacción sugerida y este `toBe("")` se pondría rojo.
    expect(textarea[1]).toBe("");

    // La sugerencia sigue estando, como atributo y no como contenido.
    expect(textarea[0]).toContain("placeholder=");
    expect(textarea[0]).toContain("Apartamento 2 habitaciones en Chacao");

    // Y el campo es obligatorio: vacío no se puede enviar, ni con el navegador
    // sin JavaScript ni en el servidor.
    expect(markup).toContain('name="message"');
    expect(textarea[0]).toContain("required");
  });

  /**
   * La vuelta a esta misma ficha (F19, 15.8). Va en el formulario y no en el
   * servidor porque la ficha es la única que conoce su URL canónica — la
   * acción sólo la usa si hace falta abrir la puerta. **Y el destino ya no es
   * `/signin`**: la puerta se abre sobre el aviso, no en su lugar.
   */
  it("lleva la puerta sobre esta misma ficha, no una pantalla aparte", () => {
    const markup = render(LOCKED);

    expect(markup).toContain(
      'name="doorHref" value="/alquiler/caracas/chacao/apartamento-listing-1?entrar=si"',
    );
    expect(markup).not.toContain("/signin");
  });

  /**
   * "Ver WhatsApp" sobre una dirección de correo es una promesa que el
   * producto no cumple (publishable-listing.ts). El sustantivo lo da el
   * dominio; lo que se prueba acá es que la frase lo use en vez de escribir
   * un canal a mano.
   */
  /**
   * **La frase que la F20 pide, en el sitio donde se lee** (tasks.md 15.11).
   * Que `lockedContactNotice` conteste bien y que el bloque la dibuje son dos
   * afirmaciones distintas, y hasta ahora no existía ninguna de las dos: la
   * frase estaba escrita a mano en este componente y no la nombraba ninguna
   * prueba.
   */
  it("dice qué falta para ver el número y que la cuenta no cuesta nada", () => {
    const html = render(LOCKED);

    expect(html).toContain(lockedContactNotice("whatsapp"));
    expect(html).toContain("Pedimos la cuenta para frenar avisos falsos");
  });

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
   * **El mensaje del inquilino le gana a la plantilla, y esa es la función.**
   *
   * La verificación de la capacidad (2026-08-24) encontró que el fixture
   * `REVEALED` nunca traía `message`, así que `contact.message ??
   * defaultRevealMessage(...)` sólo ejercitaba su rama DERECHA: el dominio y la
   * aplicación probaban que el mensaje guardado viaja, y el componente nunca lo
   * dibujaba con uno. Un `??` al revés —o borrado— dejaba todo en verde
   * mientras cada inquilino mandaba la misma plantilla.
   *
   * El respaldo sigue teniendo su caso y es el de arriba: una revelación
   * anterior a la migración tiene `message` en `NULL` y el enlace no puede
   * quedar sin texto.
   */
  it("lleva el mensaje que escribió el inquilino, no la plantilla", () => {
    const suyo = "Hola, ¿se puede ver el sábado por la mañana?";
    const markup = render({ ...REVEALED, message: suyo });

    expect(markup).toContain(encodeURIComponent(suyo));
    // Y la plantilla NO viaja: si las dos estuvieran, el `??` estaría
    // resolviéndose en algún lado que no es el href.
    expect(markup).not.toContain(encodeURIComponent("y me interesa."));
  });

  /**
   * `null` es la revelación anterior a la migración (el `message` de
   * `contact_reveal_event` es anulable a propósito, tasks.md 6.11). Tiene que
   * caer al respaldo igual que `undefined`, o el enlace sale con el texto
   * `null` adentro.
   */
  it("cae a la plantilla cuando la revelación es anterior al requisito", () => {
    const markup = render({ ...REVEALED, message: null });

    expect(markup).toContain(encodeURIComponent("Apartamento 2 habitaciones en Chacao"));
    expect(markup).not.toContain("null");
  });

  /**
   * **Nunca afirma una verificación que no ocurrió** (tasks.md 16.12/16.34).
   * `null` es la respuesta normal —sin fila en `verified_contact` no hay nada
   * que decir— y con `null` la línea NO SE DIBUJA. Escrita al revés, con un
   * texto por defecto, la ficha certificaría un contacto que nadie comprobó.
   *
   * **Y la frase le llega hecha.** Qué afirma la pantalla sobre un contacto es
   * producto y lo decide `contactVerificationNotice`, donde el piso del 90%
   * llega; acá se prueba que se dibuja y dónde, que es lo único que este
   * componente puede equivocar.
   */
  it("dibuja la frase de verificación que le llega, y nada cuando no le llega ninguna", () => {
    const sinFrase = render(REVEALED);
    expect(sinFrase).not.toContain("erificado");
    // Y NI SIQUIERA el envase vacío: sin fila no hay línea, no una línea sin
    // texto. Un `<p>` vacío con el estilo de la verificación es una insignia
    // en blanco, que es justo lo que la ausencia de fila tiene que evitar.
    expect(sinFrase).not.toContain('data-testid="contact-verification"');

    const conFrase = render(REVEALED, {
      verificationNotice: "verificado por WhatsApp el 19 ago.",
    });
    expect(conFrase).toContain("verificado por WhatsApp el 19 ago.");
    expect(conFrase).toContain('data-testid="contact-verification"');
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
