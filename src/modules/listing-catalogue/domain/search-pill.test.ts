import { describe, expect, it } from "vitest";
import { formatListingCount, type ResolveSearchPillInput, resolveSearchPill } from "./search-pill";

/**
 * La pastilla de búsqueda (tasks.md 14.30/14.31, diseño 14i — "contrato para
 * todas las pantallas"). Tres piezas, un borde, sin divisores: el texto, el
 * filtro y la lupa. Este archivo decide QUÉ dice el filtro y qué conteo
 * lleva el texto — el componente sólo dibuja lo que este módulo resuelve
 * (AGENTS.md §1, "no business rules in the front").
 */
describe("resolveSearchPill", () => {
  it("sin zona elegida, el filtro no aparece — sin búsqueda no hay nada que filtrar", () => {
    const input: ResolveSearchPillInput = { zoneLabel: null, resultCount: null, filterCount: 0 };

    expect(resolveSearchPill(input)).toEqual({ kind: "empty" });
  });

  it("una cadena vacía o sólo espacios cuenta como ninguna zona", () => {
    expect(resolveSearchPill({ zoneLabel: "", resultCount: 5, filterCount: 2 })).toEqual({
      kind: "empty",
    });
    expect(resolveSearchPill({ zoneLabel: "   ", resultCount: 5, filterCount: 2 })).toEqual({
      kind: "empty",
    });
  });

  it("con zona y sin filtros, la etiqueta es la palabra «Filtros», sin acento", () => {
    const state = resolveSearchPill({ zoneLabel: "Chacao", resultCount: 12, filterCount: 0 });

    expect(state).toEqual({
      kind: "selected",
      zoneLabel: "Chacao",
      count: 12,
      filterLabel: "Filtros",
      filterAccent: false,
      filterCount: 0,
    });
  });

  it("con filtros, la etiqueta cuenta y pasa a acento — nunca un badge aparte", () => {
    const state = resolveSearchPill({
      zoneLabel: "Chacao, Altamira",
      resultCount: 9,
      filterCount: 3,
    });

    expect(state).toEqual({
      kind: "selected",
      zoneLabel: "Chacao, Altamira",
      count: 9,
      filterLabel: "3 filtros",
      filterAccent: true,
      filterCount: 3,
    });
  });

  it("un solo filtro dice «1 filtro», singular", () => {
    const state = resolveSearchPill({ zoneLabel: "Chacao", resultCount: 5, filterCount: 1 });

    expect(state.kind).toBe("selected");
    expect(state.kind === "selected" && state.filterLabel).toBe("1 filtro");
  });

  it("un conteo ausente (null) se resuelve a cero, nunca a un guión ni a NaN", () => {
    const state = resolveSearchPill({ zoneLabel: "Chacao", resultCount: null, filterCount: 0 });

    expect(state.kind === "selected" && state.count).toBe(0);
  });

  it("un filterCount negativo (dato corrupto) se trata como cero — nunca «-1 filtros»", () => {
    const state = resolveSearchPill({ zoneLabel: "Chacao", resultCount: 5, filterCount: -1 });

    expect(state.kind === "selected" && state.filterLabel).toBe("Filtros");
    expect(state.kind === "selected" && state.filterAccent).toBe(false);
    expect(state.kind === "selected" && state.filterCount).toBe(0);
  });
});

describe("formatListingCount", () => {
  it("pluraliza «avisos», singular en 1", () => {
    expect(formatListingCount(1)).toBe("1 aviso");
    expect(formatListingCount(0)).toBe("0 avisos");
    expect(formatListingCount(12)).toBe("12 avisos");
  });
});
