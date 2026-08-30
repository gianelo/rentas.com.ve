import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PhotoUploader, type UploadedPhoto } from "./PhotoUploader";

// La acción de servidor arrastra la sesión y el cliente de base de datos por
// sus importaciones de nivel superior. Nada de eso participa del marcado que
// este archivo mide, y sin el doble el módulo ni siquiera carga.
vi.mock("./actions", () => ({ requestUploadTargets: vi.fn() }));

const uploaderSource = readFileSync("app/publicar/fotos/PhotoUploader.tsx", "utf-8");

const TRES: readonly UploadedPhoto[] = [
  { key: "k1", name: "Sala", bytes: 40_000 },
  { key: "k2", name: "Cocina", bytes: 41_000 },
  { key: "k3", name: "Balcón", bytes: 42_000 },
];

/**
 * El paso 8 es un componente de cliente, y `vitest.config.ts` corre en
 * `environment: "node"`: no hay DOM, no hay eventos, no hay `useEffect`.
 *
 * **Lo que este archivo NO puede ver, dicho antes de las afirmaciones**: el
 * clic que abre el menú, el que reordena, el arrastre, y el efecto que
 * consulta `(pointer: fine)`. Eso lo prueba `tests/e2e/` o una mano.
 *
 * **Lo que sí puede ver, y es exactamente el riesgo de esta tarea**: el
 * marcado que el navegador recibe ANTES de que corra un solo script — que es
 * donde tienen que estar las cuatro acciones nombradas y las dos frases que
 * la especificación marca como no decorativas. Si aparecieran sólo después
 * de hidratar, o sólo dentro de un atributo, este archivo no las vería, y
 * ese es el punto.
 */
describe("PhotoUploader — las acciones nombradas, antes de cualquier mejora", () => {
  it("las cuatro acciones salen como texto visible, no escondidas en un atributo", () => {
    const html = renderToStaticMarkup(<PhotoUploader initial={TRES} />);

    // `>texto<` y no `toContain("texto")`: un `title` o un `aria-label` que
    // lo lleve adentro no cuenta — es justo lo que había antes.
    expect(html).toContain(">Mover arriba<");
    expect(html).toContain(">Mover abajo<");
    expect(html).toContain(">Hacer portada<");
    expect(html).toContain(">Quitar del aviso<");
  });

  it("las dos frases no decorativas se leen, no se adivinan", () => {
    const html = renderToStaticMarkup(<PhotoUploader initial={TRES} />);

    expect(html).toContain(">no borra la foto de tu teléfono<");
    expect(html).toContain(">se ve en la lista y arriba del aviso<");
  });

  it("el botón nombra la foto y repite la consecuencia, porque se lee solo", () => {
    const html = renderToStaticMarkup(<PhotoUploader initial={TRES} />);

    expect(html).toContain(
      'aria-label="Quitar del aviso: Cocina. No borra la foto de tu teléfono"',
    );
  });

  it("la portada no ofrece hacerse portada ni moverse arriba, y con una sola foto sólo queda quitar", () => {
    const html = renderToStaticMarkup(<PhotoUploader initial={[TRES[0] as UploadedPhoto]} />);

    expect(html).toContain(">Quitar del aviso<");
    expect(html).not.toContain(">Hacer portada<");
    expect(html).not.toContain(">Mover arriba<");
    expect(html).not.toContain(">Mover abajo<");
  });

  it("el menú de cada foto dice de cuál es, porque «⋯» solo no dice nada", () => {
    const html = renderToStaticMarkup(<PhotoUploader initial={TRES} />);

    expect(html).toContain('aria-label="Acciones de Balcón"');
  });

  it("lo que el paso 8 envía sigue siendo clave, nombre y tamaño en el mismo orden", () => {
    const html = renderToStaticMarkup(<PhotoUploader initial={TRES} />);

    expect(html).toContain('name="photoKey" value="k1"');
    expect(html).toContain('name="photoName" value="Sala"');
    expect(html).toContain('name="photoBytes" value="40000"');
    expect(html.indexOf('value="k1"')).toBeLessThan(html.indexOf('value="k2"'));
  });
});

describe("PhotoUploader — el arrastre es una mejora encima, nunca el mecanismo", () => {
  it("el marcado que llega antes de hidratar no ofrece ningún arrastre", () => {
    // `useEffect` no corre en el servidor, así que `(pointer: fine)` todavía
    // no se consultó: el primer marcado es el de un teléfono, y ya trae las
    // cuatro acciones.
    const html = renderToStaticMarkup(<PhotoUploader initial={TRES} />);

    expect(html).not.toContain('draggable="true"');
    expect(html).toContain(">Mover arriba<");
  });

  it("la única cosa que el puntero decide es el atributo `draggable`", () => {
    // Ancla el MECANISMO en el código fuente, que es lo único que el entorno
    // node alcanza. Si `dragEnabled` empieza a condicionar un botón, este
    // conteo sube y la prueba cae: sería un reordenar que desaparece para
    // quien usa teclado o lector de pantalla.
    expect(uploaderSource.split("dragEnabled").length - 1).toBe(2);
    expect(uploaderSource).toContain("draggable={dragEnabled}");
    expect(uploaderSource).toContain("offersDragReorder");
  });
});

describe("PhotoUploader — las reglas no viven acá", () => {
  it("el orden, la portada y la negativa los decide el dominio, no el componente", () => {
    expect(uploaderSource).toContain(
      "../../../src/modules/listing-publication/domain/draft-photo-actions",
    );
    expect(uploaderSource).toContain("photoActionsFor(");
    expect(uploaderSource).toContain("planPhotoRemoval(");
    // Ni un `splice` suelto: mover, ascender y arrastrar son del dominio.
    expect(uploaderSource).not.toContain(".splice(");
  });

  it("la negativa y el aviso de portada nueva tienen llamador, no sólo copia", () => {
    // La forma de defecto que este cambio ya encontró seis veces: una pieza
    // lista, un dato presente, y nadie que los junte.
    expect(uploaderSource).toContain("PHOTO_REMOVAL_REFUSAL_COPY[");
    expect(uploaderSource).toContain("coverChangedNotice(");
  });
});
