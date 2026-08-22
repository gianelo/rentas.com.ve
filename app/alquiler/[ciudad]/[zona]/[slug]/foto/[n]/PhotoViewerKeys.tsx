"use client";

import { useEffect } from "react";

/**
 * El teclado del visor (16.33): ← → cambian de foto, Escape cierra.
 *
 * **Esto es JavaScript ENCIMA de enlaces que ya funcionan sin él, y ese orden
 * es la regla entera.** El criterio 8 (funciona con el script apagado) y el
 * criterio 9 (se navega con el teclado) sólo son compatibles en esa dirección:
 * primero los enlaces, después la tecla. Al revés — un visor que navega con
 * JavaScript y "además" pone enlaces — las seis fotos quedan inalcanzables en
 * cuanto el script no llega, que en las conexiones para las que este producto
 * está hecho es normal.
 *
 * **No recibe rutas y no calcula ninguna.** Busca el enlace que la página ya
 * dibujó y lo activa. Dos cosas salen gratis de ahí y no habría que
 * programarlas: la tecla no puede llevar a un lugar distinto del que lleva la
 * flecha visible, y en la primera foto ← no hace nada por exactamente la misma
 * razón por la que no hay flecha — porque el enlace no está.
 *
 * Tampoco es un modal: al activar un enlace real la navegación es de verdad,
 * así que el botón "atrás" del navegador sigue retrocediendo una foto.
 */
const KEY_TARGETS: Readonly<Record<string, string>> = {
  ArrowLeft: '[data-viewer-key="previous"]',
  ArrowRight: '[data-viewer-key="next"]',
  Escape: '[data-viewer-key="exit"]',
};

export function PhotoViewerKeys() {
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      // Con modificador la tecla es del navegador o del sistema operativo
      // (abrir en otra pestaña, cambiar de escritorio), y quitársela es peor
      // que no tener atajo.
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      // Escribiendo en un campo, ← y → mueven el cursor. Todavía no hay ninguno
      // en esta pantalla, y ése es justo el motivo de dejarlo escrito: el día
      // que aparezca un buscador acá, esta guarda ya está.
      if (isTyping(event.target)) return;

      const selector = KEY_TARGETS[event.key];
      if (!selector) return;

      const link = document.querySelector<HTMLAnchorElement>(selector);
      // Primera o última foto: no hay enlace, así que la tecla no hace nada.
      if (!link) return;

      event.preventDefault();
      link.click();
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  // No dibuja nada: la pantalla entera ya está en el servidor.
  return null;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
