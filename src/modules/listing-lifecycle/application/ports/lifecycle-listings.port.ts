/**
 * Lo único que el ciclo de vida necesita del catálogo (tasks.md 7.7/7.9).
 *
 * **`renew` devuelve un booleano y no el aviso, y eso es la garantía de un
 * solo uso.** La firma obliga a que la renovación sea un `UPDATE`
 * condicionado — «mové `expires_at` sólo si todavía vale lo que el token
 * firmó» — en vez de leer, decidir en TypeScript y después escribir. Entre esa
 * lectura y esa escritura entran dos clics del mismo enlace, y los dos
 * renovarían. Acá el segundo afecta cero filas y se lee como «ya se usó».
 */

export interface LifecycleListing {
  readonly id: string;
  readonly title: string;
  readonly expiresAt: Date;
  /**
   * A dónde escribirle. `null` cuando la cuenta no tiene correo — pasa con
   * las cuentas creadas por importación de cartera. Un aviso sin destino no
   * es una falla del trabajo: es alguien a quien no se le puede avisar, y el
   * caso de uso lo cuenta aparte en lugar de romper la corrida.
   */
  readonly publisherEmail: string | null;
}

export interface RenewableListing {
  readonly id: string;
  readonly title: string;
  readonly status: "active" | "expired" | "hidden";
  readonly expiresAt: Date;
}

export interface RenewRequest {
  readonly listingId: string;
  /** El `expires_at` que el token firmó. Es la cerradura del compare-and-swap. */
  readonly expectedExpiresAt: Date;
  readonly newExpiresAt: Date;
  readonly renewedAt: Date;
}

export interface LifecycleListingsPort {
  /**
   * Marca como `expired` los avisos `active` cuya fecha ya pasó, y devuelve
   * cuántos.
   *
   * **Marca, no borra** (7.10, 19c). La fila se conserva entera: la URL sigue
   * resolviendo al estado vencido que el diseño ya dibuja, Google no se topa
   * con un muro de 404 en páginas indexadas, y `contact_reveal_event` —que
   * lleva `ON DELETE restrict` justamente para esto— conserva la evidencia de
   * la métrica.
   *
   * Es lo que hace verdadero «sale de la búsqueda»: la búsqueda filtra por
   * `status = 'active'` incondicionalmente, así que el estado es la única
   * palanca que la saca, y vive acá y no en un filtro nuevo del buscador.
   */
  markExpired(now: Date): Promise<number>;

  /** Avisos con algún correo del ciclo de vida pendiente hoy. */
  noticeCandidates(now: Date): Promise<readonly LifecycleListing[]>;

  /** Lectura pura, para la pantalla de confirmación. NUNCA muta. */
  findRenewable(listingId: string): Promise<RenewableListing | null>;

  /** `true` si afectó una fila; `false` si el token ya se había usado. */
  renew(request: RenewRequest): Promise<boolean>;
}
