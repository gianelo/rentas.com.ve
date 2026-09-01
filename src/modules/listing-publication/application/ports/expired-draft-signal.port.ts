/**
 * tasks.md 18.34 — **cuándo vence el borrador de esta cuenta**, y nada más.
 *
 * **Un puerto de lectura AL LADO del de la 18.29, no un cuarto método suyo**
 * (AGENTS.md §3). `PublicationDraftStorePort` declara «tres preguntas y ninguna
 * más» sobre el borrador entero; ésta no pregunta por el borrador, pregunta por
 * un instante — y se hace justo cuando aquél ya contestó que no hay ninguno.
 *
 * **Devuelve el HECHO, no la decisión**, que es el idioma de
 * `reveal-rate-limit.ts`: la fecha vuelve cruda y si eso cuenta como vencido lo
 * contesta `hasDraftExpired`. Un `SELECT 1 ... WHERE expires_at <= $ahora`
 * habría sido más corto y habría escrito el borde del vencimiento por TERCERA
 * vez en SQL — `load` lo tiene con `>`, el barrido con `<=`, y el dominio ya lo
 * razona entero con su `>=`.
 *
 * **No lleva `now`**, y por eso mismo: un parámetro que la consulta no usa sería
 * la insinuación de que acá se decide algo.
 */
export interface ExpiredDraftSignalPort {
  /** El vencimiento de la fila de esta cuenta, o `null` cuando no hay fila. */
  findExpiry(publisherId: string): Promise<Date | null>;
}
