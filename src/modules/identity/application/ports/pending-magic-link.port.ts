/**
 * Los enlaces por correo todavía vivos de un buzón, como HUELLAS (tasks.md
 * 15.14).
 *
 * **Un puerto de lectura al lado del adaptador de Auth.js, no adentro de él**
 * (AGENTS.md §3). `verificationToken` la escribe y la consume la librería por
 * su propio `Adapter`; esto sólo mira. Meterle un `find` a ese contrato sería
 * ampliar una escritura ajena para poder leer.
 *
 * **Devuelve huellas y nunca tokens**, y ésa es la garantía entera: un token
 * en claro fuera del adaptador es un enlace de entrada, y quien lo tuviera
 * entraría. El sha256 contesta «¿es éste?» sin poder contestar «¿cuál es?»,
 * que es exactamente lo que el sondeo necesita — la misma asimetría que el
 * estado bloqueado de la ficha, que conserva el método y no el valor.
 */
export interface PendingMagicLinkQuery {
  /** El buzón, tal como Auth.js lo guarda: normalizado y en minúsculas. */
  readonly identifier: string;
  /** El reloj entra; el puerto no tiene uno. */
  readonly now: Date;
}

export interface PendingMagicLinkPort {
  /**
   * Las huellas de los enlaces sin vencer de ese buzón, **de la más nueva a la
   * más vieja**. El orden es parte del contrato: quien acaba de pedir un
   * enlace se queda con la primera, y así el comprobante apunta al suyo y no
   * al que quedó de un pedido anterior.
   */
  findPendingFingerprints(query: PendingMagicLinkQuery): Promise<readonly string[]>;
}
