/**
 * Los escalones del control de habitaciones, y qué significa el último.
 *
 * **Esto vivía dentro de `components/molecules/SearchFilters.tsx`**, como un
 * `const ROOM_STEPS` y un ternario que decidía que el «4» se dibuja «4+». Era
 * una regla de producto en un componente, que es exactamente lo que la regla
 * permanente del fundador prohíbe — y tenía una consecuencia mecánica: el
 * suelo de cobertura del 90 % llega a `src/modules/<módulo>/domain/` y no
 * llega a `components/`, así que ninguna corrida de tests podía ponerse roja al
 * cambiarla. Acá sí.
 *
 * El criterio detrás es `SearchCriteria.minRooms`, un **mínimo**, así que en
 * rigor todos los escalones significan "o más". El único que lo dice en la
 * etiqueta es el último, y no es un descuido: es el borde del control. Con un
 * «4+» al lado, el «3» se lee como "tres"; un «4» pelado al final se leería
 * como "exactamente cuatro" y escondería cada apartamento más grande
 * justamente de quien más lo busca.
 */

/** Los cuatro que dibuja el artboard 2a: 1 / 2 / 3 / 4+. */
export const ROOM_STEPS = [1, 2, 3, 4] as const;

export type RoomStep = (typeof ROOM_STEPS)[number];

/**
 * El escalón que significa "o más", nombrado en vez de escrito a mano.
 * Derivado de la lista y no fijado en un `4` aparte: sumar un quinto escalón
 * mueve el «+» solo, en lugar de dejarlo colgado del cuarto.
 *
 * El `as` es por `noUncheckedIndexedAccess`, que ensancha todo índice a
 * `| undefined`. Que siga siendo el último de la lista lo sostiene el test,
 * no esta línea.
 */
export const LAST_ROOM_STEP = ROOM_STEPS[ROOM_STEPS.length - 1] as RoomStep;

/** Lo que el escalón dice en pantalla. El «+» es la regla, no adorno. */
export function roomStepLabel(step: RoomStep): string {
  return step === LAST_ROOM_STEP ? `${step}+` : `${step}`;
}

/**
 * Si un número es uno de los escalones ofrecidos.
 *
 * `minRooms: 5` es un criterio perfectamente válido — el filtro sólo no tiene
 * un botón para pedirlo. Esto responde por el control, no por el criterio.
 */
export function isRoomStep(value: unknown): value is RoomStep {
  return ROOM_STEPS.some((step) => step === value);
}
