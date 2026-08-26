/**
 * Las iniciales del avatar de cuenta (diseño 14a/14b: "iniciales sobre el
 * acento, o la foto de Google cuando la hay"). `user.image` queda NULL a
 * propósito en `schema.ts` (Minimal Identity Data) y la puerta de enlace
 * mágico (tasks.md Phase 15) no captura nombre — sólo correo — así que este
 * camino de degradación es real, no un caso hipotético: es la ÚNICA fuente
 * que una cuenta de enlace mágico tiene.
 *
 * **Nombre primero, correo después, nunca los dos juntos.** Dos letras,
 * siempre: la primera y la última palabra del nombre cuando hay más de una,
 * las dos primeras letras cuando hay una sola; el correo usa las dos
 * primeras letras de la parte local, o la única letra que haya si es más
 * corta.
 */
export function initialsFrom(name: string | null, email: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);

  if (words.length > 0) {
    const first = words[0]?.[0] ?? "";
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : (words[0]?.[1] ?? "");
    return `${first}${last}`.toUpperCase();
  }

  const localPart = (email ?? "").trim().split("@")[0] ?? "";
  if (localPart === "") return "?";

  return localPart.slice(0, 2).toUpperCase();
}
