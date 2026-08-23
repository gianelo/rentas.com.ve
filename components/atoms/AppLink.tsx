import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { isInternalPath } from "@/shared/navigation/internal-path";

/**
 * Un enlace del producto: **el mismo marcado sin JavaScript, y navegación de
 * cliente cuando lo hay.**
 *
 * **Existe porque hicimos la mitad de la F14.** El documento del fundador dice
 * que buscar, filtrar y navegar funcionan con el script apagado, *«y con
 * JavaScript disponible se agregan encima, como mejora»*. Se construyó el piso
 * y nunca el techo: cada filtro tocado era una recarga completa de documento —
 * pantalla en blanco, todo de nuevo — sobre un teléfono con 3G.
 *
 * Y se pagaba igual: **el runtime de React y Next ya viaja en las 103 kB
 * compartidas de cada ruta**. Las anclas peladas lo tiraban a la basura en cada
 * clic. Era lo peor de los dos mundos.
 *
 * **`next/link` renderiza un ancla de verdad**, así que sin JavaScript se
 * comporta exactamente igual que antes: la dirección se pega en un grupo de
 * WhatsApp, Google la indexa, y el botón de volver del navegador hace lo suyo.
 * Con JavaScript, la navegación no recarga el documento y la ruta se precarga.
 * No se pierde nada.
 *
 * **La decisión de cuál es cuál no se toma acá**: `isInternalPath` la resuelve
 * parseando, porque `//otro-sitio` empieza con barra y no es una ruta. Este
 * átomo pregunta y dibuja.
 */
export interface AppLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string;
}

export function AppLink({ href, ...rest }: AppLinkProps) {
  // `wa.me`, `tel:`, `mailto:` y los anclas de la misma página salen como
  // ancla pelada: el router no las acelera, y precargar una dirección que no
  // es una página es trabajo tirado.
  if (!isInternalPath(href)) {
    // biome-ignore lint/a11y/useAnchorContent: el contenido llega por `rest.children`, igual que en la rama de arriba.
    return <a href={href} {...rest} />;
  }

  return <Link href={href} {...rest} />;
}
