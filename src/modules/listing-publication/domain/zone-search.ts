import type { SuggestionVocabulary } from "../../listing-catalogue/domain/suggest-filters";
import { slugify } from "../../listing-discovery/domain/listing-url";

/**
 * El buscador de zona del paso 2.
 *
 * ## Por que no hay servicio externo
 *
 * Google Places se evaluo y se descarto por dos razones, y la segunda es la
 * que decide: aunque se pagara la consulta, **seguiria haciendo falta la lista
 * cerrada**. Google devuelve una direccion formateada, no la taxonomia del
 * producto — y la zona es la unidad sobre la que se apoyan el filtro de
 * busqueda, los conteos por zona, la URL `/alquiler/<ciudad>/<zona>/…` y las
 * paginas de zona para SEO. Con zona de texto libre el filtro se vuelve
 * infinito, los conteos desaparecen y no hay pagina que indexar.
 *
 * ## Que se reusa, y que hubo que escribir
 *
 * Se reusa el **vocabulario** (`SuggestionVocabulary`, con sus 3.547 alias
 * del indice de toponimos) y el **normalizador** (`slugify`, el mismo que
 * arma la URL de un aviso). Escribir un segundo normalizador aca es como dos
 * partes del sistema empiezan a discrepar sobre si «Chacao» y «chacao» son la
 * misma palabra.
 *
 * **No se reusa `suggestFilters`, y conviene saber por que.** Esa funcion
 * compara en una sola direccion: pregunta si el nombre de la zona esta DENTRO
 * de lo escrito, que es lo correcto para traducir una frase entera
 * («apartamento en altamira») a filtros. El paso 2 necesita la direccion
 * contraria — lo escrito dentro del nombre — porque autocompletar es contestar
 * «alta» con Altamira. Con `suggestFilters` a secas, escribir «alta» no
 * devuelve nada y el buscador parece roto.
 *
 * Aca se comparan las dos direcciones, asi que la frase completa sigue
 * funcionando y el autocompletado tambien.
 *
 * La otra regla propia es la unica que esta capa agrega al vocabulario: **una
 * sugerencia que no sea una zona no puede llegar al control de zona.** El
 * vocabulario tambien traduce tipos, precios y atributos, porque del lado del
 * inquilino todos ellos SON filtros. Aca no: el campo pregunta una cosa, y
 * ofrecer "Apartamento" donde se elige un lugar aplica un dato en el campo
 * equivocado sin que quien publica tenga como notarlo. Recorriendo unicamente
 * `vocabulary.zones` y `vocabulary.aliases`, eso deja de ser posible.
 */

export interface PublicationZoneOption {
  readonly zoneId: string;
  /** Derivada, nunca preguntada (criterio de aceptacion 7). */
  readonly cityId: string;
  /** Lo que se muestra: el nombre o el alias por el que se la encontro. */
  readonly label: string;
  /** "Municipio Chacao · Distrito Capital". Es lo unico que desambigua. */
  readonly scope: string;
}

/** El artboard dibuja cuatro resultados; ocho deja aire sin volverse indice. */
const DEFAULT_LIMIT = 8;

function scopeOf(parentName: string | null, cityName: string): string {
  // Sin municipio declarado se muestra solo la ciudad. Concatenar igual
  // dejaria un " · " colgando, que se lee como un dato que falto de cargar.
  return parentName ? `${parentName} · ${cityName}` : cityName;
}

/**
 * Las dos direcciones, y ninguna es opcional.
 *
 * - `name.includes(query)` es el autocompletado: «alta» encuentra Altamira, y
 *   «florida» encuentra Alta Florida — quien escribe eso conoce el lugar y no
 *   la taxonomia.
 * - `query.includes(name)` es la frase entera: «apartamento en altamira»
 *   sigue encontrando Altamira, que es lo que ya hacia `suggestFilters`.
 *
 * Lo que deliberadamente NO hay es coincidencia difusa. «Altos de Sucre» no
 * aparece al escribir «alta», y esa ausencia es la decision: sobre una lista
 * cerrada, un resultado difuso ofrece un vecino que nadie escribio, y en un
 * campo obligatorio eso publica el aviso en la zona equivocada. La salida
 * para lo que no aparece es «¿No esta la tuya? Avisanos», no una adivinanza.
 */
function matchesQuery(name: string, query: string): boolean {
  const target = slugify(name);
  if (target === "") return false;

  return target.includes(query) || query.includes(target);
}

export function searchPublicationZones(
  text: string,
  vocabulary: SuggestionVocabulary,
  limit: number = DEFAULT_LIMIT,
): readonly PublicationZoneOption[] {
  const query = slugify(text);
  if (query === "") return [];

  const cityById = new Map(vocabulary.cities.map((city) => [city.id, city]));
  const zoneById = new Map(vocabulary.zones.map((zone) => [zone.id, zone]));

  const options: PublicationZoneOption[] = [];
  const seen = new Set<string>();

  const consider = (zoneId: string, label: string): void => {
    if (options.length >= limit || seen.has(zoneId)) return;

    const zone = zoneById.get(zoneId);
    const city = zone ? cityById.get(zone.cityId) : undefined;
    // Una zona cuya ciudad no esta curada no se puede publicar: la clave
    // foranea compuesta de `listing` rechaza el par, asi que ofrecerla seria
    // mandar a alguien a un error de base de datos por elegir de una lista
    // que el producto le puso adelante.
    if (!zone || !city) return;

    seen.add(zoneId);
    options.push({
      zoneId: zone.id,
      cityId: zone.cityId,
      label,
      scope: scopeOf(zone.parentName, city.name),
    });
  };

  // Los alias primero, igual que en `suggestFilters`: son el nombre por el que
  // la gente busca, y encontrarlos antes hace que la zona aparezca aunque su
  // nombre publicado sea otro.
  for (const { zoneId, alias } of vocabulary.aliases) {
    if (matchesQuery(alias, query)) consider(zoneId, alias);
  }

  for (const zone of vocabulary.zones) {
    if (matchesQuery(zone.name, query)) consider(zone.id, zone.name);
  }

  return options;
}

/**
 * La ciudad de una zona ya elegida.
 *
 * **Esto es "la ciudad nunca se pregunta" escrito como funcion.** El paso 2
 * guarda ciudad y zona a la vez porque la primera se deriva de la segunda; si
 * el formulario las pidiera por separado volveria el caso borde que la
 * especificacion da por resuelto: cambiar la ciudad despues de la zona.
 */
export function resolveZoneCity(
  zoneId: string | undefined,
  vocabulary: SuggestionVocabulary,
): { readonly zoneId: string; readonly cityId: string } | null {
  if (!zoneId) return null;

  const zone = vocabulary.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) return null;
  if (!vocabulary.cities.some((city) => city.id === zone.cityId)) return null;

  return { zoneId: zone.id, cityId: zone.cityId };
}
