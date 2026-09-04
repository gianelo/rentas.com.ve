/**
 * Los escalones del control de baños, y qué significa el último (14.45).
 *
 * **`3` significa «tres o más», no «exactamente tres»**, y ésa es la decisión
 * que cambia la consulta y el conteo. El criterio detrás es
 * `SearchCriteria.minBathrooms`, un **mínimo**, así que la faceta cuenta
 * `bathrooms >= 3` y el botón dice cuántos avisos tienen tres baños **o más**.
 * Contar exactos daría un número distinto del que el filtro devuelve, y la
 * regla transversal 3 —«si una etiqueta dice 9, hay 9»— no permite que la
 * etiqueta y el resultado discrepen.
 *
 * **Es la misma regla de `room-steps.ts` con otra escala, y por eso es otro
 * archivo.** Lo que difiere es el dato: la lámina 7b dibuja **tres** botones
 * para los baños y **cuatro** para las habitaciones. Meter las dos escalas en
 * una lista llamada `ROOM_STEPS` sería una lista que miente sobre la mitad de
 * lo que guarda; lo que se repite son dos líneas de etiqueta, y repetirlas
 * cuesta menos que un nombre falso.
 *
 * Vive en `domain/` y no en el componente por la regla permanente del fundador,
 * con la razón mecánica al lado: el suelo de cobertura del 90 % llega acá y no
 * llega a `components/`, así que un «3+» decidido en JSX es una regla de
 * producto que ninguna corrida de tests puede poner en rojo.
 */

/** Los tres que dibuja la lámina 7b: 1 / 2 / 3+. */
export const BATHROOM_STEPS = [1, 2, 3] as const;

export type BathroomStep = (typeof BATHROOM_STEPS)[number];

/**
 * El escalón que significa "o más", derivado de la lista y no escrito a mano:
 * sumar un cuarto escalón mueve el «+» solo. El `as` es por
 * `noUncheckedIndexedAccess`; que siga siendo el último lo sostiene el test.
 */
export const LAST_BATHROOM_STEP = BATHROOM_STEPS[BATHROOM_STEPS.length - 1] as BathroomStep;

/** Lo que el escalón dice en pantalla. El «+» es la regla, no adorno. */
export function bathroomStepLabel(step: BathroomStep): string {
  return step === LAST_BATHROOM_STEP ? `${step}+` : `${step}`;
}

/**
 * Si un número es uno de los escalones ofrecidos.
 *
 * `minBathrooms: 4` es un criterio válido — el control sólo no tiene un botón
 * para pedirlo. Esto responde por el control, no por el criterio.
 */
export function isBathroomStep(value: unknown): value is BathroomStep {
  return BATHROOM_STEPS.some((step) => step === value);
}
