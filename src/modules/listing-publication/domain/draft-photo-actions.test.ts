import { describe, expect, it } from "vitest";
import {
  movePhotoBy,
  offersDragReorder,
  photoActionsFor,
  planPhotoRemoval,
  promoteToCover,
  reorderPhotoTo,
} from "./draft-photo-actions";
import { MIN_PHOTOS_FOR_ACTIVATION } from "./publishable-listing";

const CUATRO = ["a", "b", "c", "d"] as const;

describe("qué acciones ofrece una foto", () => {
  it("la portada no ofrece «mover arriba» ni «hacer portada»: ya es la portada", () => {
    const acciones = photoActionsFor(CUATRO, "a");

    expect(acciones).not.toContain("moveUp");
    expect(acciones).not.toContain("makeCover");
    expect(acciones).toContain("moveDown");
  });

  it("la última no ofrece «mover abajo», y la del medio ofrece las cuatro", () => {
    expect(photoActionsFor(CUATRO, "d")).not.toContain("moveDown");
    expect(photoActionsFor(CUATRO, "b")).toEqual(["moveUp", "moveDown", "makeCover", "remove"]);
  });

  it("una foto que no está en la lista no ofrece ninguna acción", () => {
    expect(photoActionsFor(CUATRO, "z")).toEqual([]);
  });

  it("«quitar» se ofrece incluso en la única foto — la negativa se dice al tocar, no escondiendo el renglón", () => {
    // El renglón es donde vive la frase «no borra la foto de tu teléfono».
    // Esconderlo cuando queda una sola foto esconde también la aclaración,
    // que es exactamente lo que la especificación pide que no pase.
    expect(photoActionsFor(["a"], "a")).toEqual(["remove"]);
  });
});

describe("quitar una foto del aviso", () => {
  it("quitar la portada asciende a la siguiente, y la nombra en vez de dejarlo al orden", () => {
    const plan = planPhotoRemoval(CUATRO, "a");

    expect(plan).toEqual({ ok: true, ids: ["b", "c", "d"], coverChangedTo: "b" });
  });

  it("quitar una foto que no es la portada no toca la portada", () => {
    const plan = planPhotoRemoval(CUATRO, "c");

    expect(plan).toEqual({ ok: true, ids: ["a", "b", "d"], coverChangedTo: null });
  });

  it("quitar la única foto se rechaza, y la respuesta no trae lista para que nadie la aplique igual", () => {
    const plan = planPhotoRemoval(["a"], "a");

    expect(plan).toEqual({ ok: false, refusal: "lastPhoto" });
  });

  it("el piso que rechaza es MIN_PHOTOS_FOR_ACTIVATION, no un 1 suelto escrito acá", () => {
    const justo = Array.from({ length: MIN_PHOTOS_FOR_ACTIVATION }, (_, i) => `p${i}`);
    const unaMas = [...justo, "extra"];

    expect(planPhotoRemoval(justo, "p0").ok).toBe(false);
    expect(planPhotoRemoval(unaMas, "p0").ok).toBe(true);
  });

  it("quitar una foto que no está en la lista se rechaza en vez de devolver la lista entera", () => {
    expect(planPhotoRemoval(CUATRO, "z")).toEqual({ ok: false, refusal: "notFound" });
  });
});

describe("reordenar con acciones nombradas", () => {
  it("«mover abajo» intercambia con la siguiente y deja el resto quieto", () => {
    expect(movePhotoBy(CUATRO, "b", 1)).toEqual(["a", "c", "b", "d"]);
  });

  it("«mover arriba» desde la portada devuelve el mismo orden", () => {
    expect(movePhotoBy(CUATRO, "a", -1)).toEqual(["a", "b", "c", "d"]);
  });

  it("«mover abajo» desde la última devuelve el mismo orden", () => {
    expect(movePhotoBy(CUATRO, "d", 1)).toEqual(["a", "b", "c", "d"]);
  });

  it("«hacer portada» pone la foto primera y conserva el orden relativo del resto", () => {
    expect(promoteToCover(CUATRO, "c")).toEqual(["c", "a", "b", "d"]);
  });

  it("«hacer portada» sobre la portada no reordena nada", () => {
    expect(promoteToCover(CUATRO, "a")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("reordenar arrastrando, que es lo mismo dicho con el mouse", () => {
  it("soltar sobre una posición anterior INSERTA ahí, no intercambia", () => {
    // Intercambiar daría ["a","d","c","b"]. Insertar es lo que hace un
    // arrastre: la foto entra en el hueco y las demás corren.
    expect(reorderPhotoTo(CUATRO, "d", 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("soltar sobre una posición posterior también inserta, contando ya sin la foto movida", () => {
    expect(reorderPhotoTo(CUATRO, "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("soltar fuera de la lista devuelve el mismo orden en vez de recortarlo", () => {
    expect(reorderPhotoTo(CUATRO, "a", 9)).toEqual(["a", "b", "c", "d"]);
    expect(reorderPhotoTo(CUATRO, "a", -1)).toEqual(["a", "b", "c", "d"]);
  });

  it("arrastrar una foto que no está en la lista devuelve el mismo orden", () => {
    expect(reorderPhotoTo(CUATRO, "z", 0)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("a quién se le ofrece arrastrar", () => {
  it("con mouse y más de una foto, sí", () => {
    expect(offersDragReorder({ pointerIsFine: true, photoCount: 2 })).toBe(true);
  });

  it("con el pulgar no se ofrece, aunque haya seis fotos", () => {
    // La razón está en la especificación y no es preferencia: arrastrar con
    // el pulgar en un teléfono lento no es confiable.
    expect(offersDragReorder({ pointerIsFine: false, photoCount: 6 })).toBe(false);
  });

  it("con mouse y una sola foto tampoco: un arrastre que no puede cambiar nada promete que sí", () => {
    expect(offersDragReorder({ pointerIsFine: true, photoCount: 1 })).toBe(false);
  });
});
