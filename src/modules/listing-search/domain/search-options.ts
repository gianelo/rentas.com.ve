import { BATHROOM_STEPS, type BathroomStep, bathroomStepLabel } from "./bathroom-steps";
import { ROOM_STEPS, type RoomStep, roomStepLabel } from "./room-steps";
import { LISTING_ATTRIBUTES, type ListingAttribute } from "./search-criteria";

/**
 * **Cada opción de filtro con su número, y qué se puede tocar.**
 *
 * Los números los produce `FacetedSearchPort` desde las filas reales (regla
 * transversal 3: "todo conteo es real"). Lo que vive acá es lo que se hace con
 * ellos: qué opción queda deshabilitada, cuál muestra su cero y cuál no lo
 * muestra, en qué orden se ofrecen y qué pasa al volver a tocar la que ya está
 * elegida.
 *
 * **Es una regla, no un formateo, y por eso no está en el componente.** «Una
 * opción con cero queda deshabilitada» (F6) es la regla transversal 4 escrita
 * al derecho — "ninguna opción lleva a un vacío" — y decidirla en JSX la deja
 * fuera del suelo de cobertura del 90 %, que llega a `domain/` y no llega a
 * `components/`.
 *
 * **La faceta se cuenta SIN su propio filtro**, y de ahí sale la única razón
 * por la que estos números sirven: con «2 habitaciones» elegido, el número al
 * lado de «3» dice cuántos habría *si se cambiara*. Eso lo resuelve el
 * adaptador; acá se asume y se respeta — por eso la opción elegida nunca se
 * deshabilita aunque su columna diga cero.
 */

/** Lo que este archivo necesita saber de una zona del catálogo. */
export interface OfferedZone {
  readonly id: string;
  readonly name: string;
}

export interface ZoneOption {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  /**
   * El número tal como se dibuja, o `null` para no dibujar ninguno.
   *
   * Una zona sin avisos se **ofrece igual** —así se ve que ahí no hay nada, en
   * vez de que la opción desaparezca— pero **sin un «0» al lado**: un cero
   * pegado a una opción se lee como un conteo roto. Que la opción no se pueda
   * tocar ya dice lo mismo sin escribir un número que nadie necesita.
   */
  readonly countLabel: string | null;
  readonly chosen: boolean;
  readonly disabled: boolean;
}

/**
 * Las zonas ofrecidas, **las elegidas primero**.
 *
 * Suben arriba porque son las que se van a soltar: en una lista de ocho zonas
 * con dos marcadas, buscar las marcadas para desmarcarlas es el movimiento más
 * frecuente del paso 2. Las demás quedan en el orden del catálogo, que es el
 * que la pantalla anterior ya mostró — reordenarlas por conteo haría que la
 * lista se sacuda con cada toque.
 */
export function resolveZoneOptions(
  zones: readonly OfferedZone[],
  byZone: Readonly<Record<string, number>>,
  chosenIds: readonly string[],
): readonly ZoneOption[] {
  const toOption = (zone: OfferedZone): ZoneOption => {
    // Una zona que el conteo no menciona vale cero y no `undefined`: el puerto
    // devuelve una entrada por zona ofrecida, y si alguna faltara, "no sé" y
    // "ninguno" tienen que verse igual de vacíos y no como un `NaN`.
    const count = byZone[zone.id] ?? 0;
    const chosen = chosenIds.includes(zone.id);

    return {
      id: zone.id,
      name: zone.name,
      count,
      countLabel: count === 0 ? null : String(count),
      chosen,
      // La elegida nunca se deshabilita: si no, quedaría marcada para siempre.
      disabled: count === 0 && !chosen,
    };
  };

  const chosen = chosenIds
    .map((id) => zones.find((zone) => zone.id === id))
    .filter((zone): zone is OfferedZone => zone !== undefined);
  const rest = zones.filter((zone) => !chosenIds.includes(zone.id));

  return [...chosen, ...rest].map(toOption);
}

export interface RoomOption {
  readonly step: RoomStep;
  /** «1», «2», «3», «4+». El «+» es la regla de `room-steps.ts`, no adorno. */
  readonly label: string;
  readonly count: number;
  readonly chosen: boolean;
  readonly disabled: boolean;
  /**
   * Qué mandar en la dirección al tocarlo: el escalón, o `null` para soltar el
   * filtro. **Volver a tocar el elegido lo suelta**, y eso es lo que hace que
   * una selección única se pueda deshacer sin un botón «cualquiera» aparte.
   */
  readonly nextValue: string | null;
}

/** Los cuatro escalones con su conteo. La selección es única (F6). */
export function resolveRoomOptions(
  byMinRooms: Readonly<Record<RoomStep, number>>,
  minRooms: number | undefined,
): readonly RoomOption[] {
  return ROOM_STEPS.map((step) => {
    const count = byMinRooms[step] ?? 0;
    const chosen = minRooms === step;

    return {
      step,
      label: roomStepLabel(step),
      count,
      chosen,
      disabled: count === 0 && !chosen,
      nextValue: chosen ? null : String(step),
    };
  });
}

export interface BathroomOption {
  readonly step: BathroomStep;
  /** «1», «2», «3+». El «+» es la regla de `bathroom-steps.ts`, no adorno. */
  readonly label: string;
  readonly count: number;
  readonly chosen: boolean;
  readonly disabled: boolean;
  /** El escalón, o `null` para soltar el filtro al volver a tocar el elegido. */
  readonly nextValue: string | null;
}

/**
 * Los tres escalones con su conteo. **Es la misma forma que las habitaciones y
 * eso no es copiar por comodidad**: las dos son una selección única sobre un
 * mínimo, así que la opción elegida se suelta al volver a tocarla y la de cero
 * queda deshabilitada por la misma regla transversal 4. Lo que difiere es la
 * escala —tres botones contra cuatro— y eso ya vive en `bathroom-steps.ts`.
 */
export function resolveBathroomOptions(
  byMinBathrooms: Readonly<Record<BathroomStep, number>>,
  minBathrooms: number | undefined,
): readonly BathroomOption[] {
  return BATHROOM_STEPS.map((step) => {
    const count = byMinBathrooms[step] ?? 0;
    const chosen = minBathrooms === step;

    return {
      step,
      label: bathroomStepLabel(step),
      count,
      chosen,
      disabled: count === 0 && !chosen,
      nextValue: chosen ? null : String(step),
    };
  });
}

/** Cómo se lee cada atributo. Copia; qué atributos existen lo dice el dominio. */
const ATTRIBUTE_LABELS: Readonly<Record<ListingAttribute, string>> = {
  hasPowerPlant: "Planta eléctrica",
  hasRegularWater: "Agua regular",
  isFurnished: "Amoblado",
  // El rótulo del fundador, entero. «Puesto» solo es lo que dice la tira de
  // datos de la ficha, donde al lado hay un número; acá es una casilla y tiene
  // que decir de qué.
  hasParking: "Puesto de estacionamiento",
  hasSecurity: "Vigilancia 24 h",
  hasAppliances: "Línea blanca",
};

export interface AttributeOption {
  readonly attribute: ListingAttribute;
  readonly label: string;
  readonly count: number;
  /**
   * «9 de 16» — cuántos de los resultados actuales lo declaran.
   *
   * **Acá el cero SÍ se escribe**, al revés que en la zona, y la diferencia es
   * el motivo: la opción está deshabilitada y este número es la respuesta a
   * «¿por qué no puedo tocar esto?». En la zona el número contesta «¿cuánto
   * hay ahí?», y para "nada" la lista ya lo dice sin un cero.
   */
  readonly note: string;
  readonly chosen: boolean;
  readonly disabled: boolean;
  /** `"1"` para pedirlo, `null` para soltarlo. Los atributos se combinan con Y. */
  readonly nextValue: string | null;
}

/**
 * Los seis atributos con su conteo. **Se combinan con Y** (F6): marcar dos
 * pide los dos, así que marcar uno nuevo nunca desmarca al anterior.
 *
 * **El sexto es derivado y acá no se nota, que es el punto** (14.45 rebanada
 * C): «Puesto de estacionamiento» sale de `parking_spots > 0` y el resto de
 * los cinco de una columna booleana, pero las dos cosas llegan como un número
 * en `byAttribute` y se ofrecen con la misma regla. Una rama acá para el
 * derivado sería la derivación escrita dos veces.
 */
export function resolveAttributeOptions(
  byAttribute: Readonly<Record<ListingAttribute, number>>,
  total: number,
  chosen: readonly ListingAttribute[],
): readonly AttributeOption[] {
  return LISTING_ATTRIBUTES.map((attribute) => {
    const count = byAttribute[attribute] ?? 0;
    const isChosen = chosen.includes(attribute);

    return {
      attribute,
      label: ATTRIBUTE_LABELS[attribute],
      count,
      note: `${count} de ${total}`,
      chosen: isChosen,
      disabled: count === 0 && !isChosen,
      nextValue: isChosen ? null : "1",
    };
  });
}
