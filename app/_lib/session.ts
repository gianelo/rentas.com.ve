import { cache } from "react";
import type { SessionPort } from "@/modules/identity/application/ports/session.port";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";

/**
 * **Una lectura de sesión por petición, no una por quien la necesite.**
 *
 * Auth.js está en estrategia `database` (`identity/infrastructure/auth.ts`),
 * así que cada `auth()` con cookie es un viaje HTTP a Neon. Desde que el `Nav`
 * se dibuja en toda pantalla (14g), la ficha necesita la sesión **dos veces**:
 * una para el bloque de contacto y otra para el control de cuenta de la barra.
 * Sin esto, abrir un aviso con sesión costaría dos consultas idénticas en la
 * pantalla más visitada del sitio.
 *
 * `cache` de React deduplica dentro de una misma petición, que es exactamente
 * el alcance del problema: varias llamadas, un render. Es el mismo mecanismo
 * —y la misma razón— que la ficha ya usa para `findDetail`.
 *
 * **Sin cookie no cuesta nada, ni siquiera la primera vez.** `@auth/core` corta
 * en `if (!sessionToken) return response` antes de llamar al adaptador
 * (`lib/actions/session.js`), así que el visitante anónimo —casi todo el
 * tráfico de `/` y `/alquiler/**`— no paga ninguna consulta por tener una
 * barra que sabe si hay sesión.
 *
 * **Es un adaptador de entrega, no una regla.** No decide nada: memoiza. Quién
 * cuenta como autenticado lo sigue decidiendo `requireAuthenticatedSession` y
 * qué dibuja la barra lo sigue decidiendo `resolveNavAccount`.
 */
export const readSession = cache(() => nextAuthSessionPort.getSession());

/** El mismo puerto, memoizado, para los casos de uso que reciben uno. */
export const requestSessionPort: SessionPort = { getSession: readSession };
