/**
 * Qué municipios forman cada **área**, que es la unidad que el inquilino elige
 * primero y la que protege el aislamiento de D5.
 *
 * **El área es una invención del producto, no un nivel oficial**, y por eso
 * vive acá y no en `docs/territorio/`. Lo que la gente llama «Caracas» cruza
 * dos entidades federales — Distrito Capital más cuatro municipios de Miranda,
 * según la Gaceta Oficial 36.906 y su derogación en la 41.308 — así que ningún
 * nivel del INE puede expresarla. Separarlas es lo que permite reimportar el
 * dato oficial más adelante sin pisar una decisión de producto.
 *
 * **Cada agrupación de acá abajo tiene su razón en los propios documentos, y
 * ninguna inventa un nombre.** Aun así es una decisión de producto y no técnica:
 * si el fundador quiere San Francisco como área propia, o Cabimas y Santa Rita
 * juntas bajo un nombre común, se cambia acá y en ningún otro lugar.
 */
export interface AreaDefinition {
  /** Como la busca la gente. Es lo que se muestra y lo que va en la URL. */
  readonly name: string;
  /** Municipios, con el nombre exacto que declara `docs/territorio/`. */
  readonly municipalities: readonly string[];
  /** Por qué estos municipios y no otros. */
  readonly rationale: string;
}

export const AREAS: readonly AreaDefinition[] = [
  {
    name: "Caracas",
    municipalities: ["Bolivariano Libertador", "Baruta", "Chacao", "El Hatillo", "Sucre"],
    rationale:
      "Los cinco municipios del extinto Distrito Metropolitano. Cuatro son Miranda y uno " +
      "es Distrito Capital, así que ningún nivel oficial los agrupa — pero es lo que la " +
      "gente escribe y lo que Google indexa. Nombrada «Caracas» y no «Distrito Capital», " +
      "que es factualmente incorrecto para cuatro de los cinco.",
  },
  {
    name: "La Guaira",
    municipalities: ["Vargas"],
    rationale:
      "Área propia y no parte de Caracas: es otra entidad federal y, para alquiler de " +
      "larga estadía, otro mercado. Quien busca en Caracas difícilmente quiera Catia La " +
      "Mar o Macuto, que están a una autopista. Unirlas después es trivial; separarlas " +
      "una vez que se mezclaron, no.",
  },
  {
    name: "Maracaibo",
    municipalities: ["Maracaibo", "San Francisco"],
    rationale:
      "San Francisco es un municipio propio desde 1995, y el documento lo aclara — pero " +
      "está conurbado con Maracaibo por el sur, y quien alquila ahí busca «Maracaibo». " +
      "La separación administrativa se conserva en el árbol; el área las junta.",
  },
  {
    name: "Cabimas",
    municipalities: ["Cabimas"],
    rationale:
      "Orilla oriental del lago, NO conurbada con Maracaibo — el documento lo dice " +
      "explícitamente. Meterla en el área de Maracaibo devolvería resultados al otro " +
      "lado del lago, que es exactamente lo que el aislamiento de ciudad evita.",
  },
  {
    name: "Santa Rita",
    municipalities: ["Santa Rita"],
    rationale: "Misma razón que Cabimas: orilla oriental, sin conurbación.",
  },
];

/** El área a la que pertenece un municipio, o `null` si no está mapeado. */
export function areaForMunicipality(municipality: string): string | null {
  for (const area of AREAS) {
    if (area.municipalities.includes(municipality)) return area.name;
  }
  return null;
}
