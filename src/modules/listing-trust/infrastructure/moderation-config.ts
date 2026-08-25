/**
 * El secreto de la ruta de restauración, leído en un solo lugar (mismo
 * patrón que `listing-lifecycle/infrastructure/lifecycle-config.ts`).
 *
 * **Sin valor por defecto y sin lanzar.** Un default convertiría un
 * despliegue al que se le olvidó la variable en uno que acepta un secreto
 * escrito en el repositorio; lanzar tumbaría la ruta con un 500 en vez de
 * contestar 401. Devuelve `undefined` y quien llama decide —
 * `isAuthorizedOperatorRequest` ya falla cerrado con `undefined`.
 */
export function readOperatorSecret(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env.OPERATOR_SECRET || undefined;
}
