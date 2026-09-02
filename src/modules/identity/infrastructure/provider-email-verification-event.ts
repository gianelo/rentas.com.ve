import type { Adapter, AdapterUser } from "next-auth/adapters";
import { recordProviderEmailVerification } from "../application/record-provider-email-verification";

/**
 * tasks.md 19.14 — **el asiento donde se escribe la fecha que Google deja y
 * Auth.js tira.**
 *
 * De los tres sitios posibles éste es el único que sirve, y las razones son
 * estructurales y no de gusto (`@auth/core` 0.41.3):
 *
 * - **El callback `signIn` no puede**: corre ANTES de crear la cuenta
 *   (`lib/actions/callback/index.js:63`, contra `:70`), así que en el caso
 *   que importa —la primera entrada por Google— todavía no hay fila que
 *   actualizar, y lo que se escribiera lo pisaría después el
 *   `createUser({ ...profile, emailVerified: null })` de `handle-login.js:260`.
 *   Además es la compuerta de acceso: lo que tira desde ahí lo envuelve
 *   `AccessDenied`, de modo que un fallo de base dejaría a la persona sin
 *   entrar.
 * - **`events.createUser` no puede**: recibe `{ user }` y nada más
 *   (`handle-login.js:77` y `:262`), sin `account` ni `profile`. No tiene con
 *   qué saber por qué puerta entró ni qué afirmó el proveedor, así que sólo
 *   podría adivinar «`emailVerified` vino vacío, luego fue OAuth, luego
 *   Google lo verificó» — inventar el instante, que es justo lo prohibido. Y
 *   corre una sola vez, al crear: las cuentas de Google que ya existen no
 *   pasarían nunca por ahí.
 * - **`events.signIn` sí**: corre en `index.js:114`, después de que
 *   `handleLoginOrRegister` devolvió la fila persistida, y lleva `user` (con
 *   su id real), `account` —de donde sale el proveedor— y `profile`, que es
 *   el perfil CRUDO del proveedor y por lo tanto la afirmación
 *   `email_verified` misma. Y corre en TODAS las entradas, no sólo en la
 *   primera, que es lo que le da su fecha a una cuenta de Google ya
 *   existente: no rellenándole el pasado, que nadie conoce, sino anotando la
 *   afirmación del día que vuelve.
 *
 * **Se escribe por `updateUser` del adaptador y no por una consulta nueva**,
 * que es exactamente lo que hace la puerta del enlace por correo
 * (`handle-login.js:69`). La misma escritura, por el mismo camino, para la
 * puerta que verifica mejor.
 */
export interface ProviderSignInEvent {
  readonly user: { id?: string; email?: string | null };
  readonly account?: { provider: string } | null;
  readonly profile?: Record<string, unknown> | null;
}

export function buildProviderEmailVerificationEvent(
  adapter: Adapter,
  now: () => Date = () => new Date(),
): (message: ProviderSignInEvent) => Promise<void> {
  return async ({ user, account, profile }) => {
    if (!user?.id || !account) return;

    await recordProviderEmailVerification(
      {
        userId: user.id,
        providerId: account.provider,
        profile,
        accountEmail: user.email,
      },
      {
        accounts: {
          markEmailVerified: async ({ userId, verifiedAt }) => {
            await adapter.updateUser?.({ id: userId, emailVerified: verifiedAt } as AdapterUser);
          },
        },
        now,
      },
    );
  };
}
