"use client";

import { useEffect, useRef, useState } from "react";

/**
 * **El número del botón, adelantado al instante en que se toca un filtro**
 * (tasks.md 14.34 — *"baja de 70 a 9 mientras se filtra"*).
 *
 * ## Es una mejora, y el piso está intacto debajo
 *
 * AGENTS.md §2, en las palabras que el fundador usó para cambiar la regla:
 * *"queremos un MVP pero no que no tenga dinamismo, porque eso queda
 * horrible"*, con la condición que la resuelve — **la base no puede depender de
 * que el script llegue**. Acá eso es literal y verificable: el servidor ya
 * escribe la etiqueta correcta en el marcado (`SearchPanel.test.tsx` →
 * *"el botón sale del servidor con su número escrito, sin ejecutar una línea de
 * script"*), cada opción sigue siendo un enlace de verdad, y este componente
 * sólo **adelanta** lo que ese enlace va a producir mientras el servidor
 * contesta. Con el bundle caído no falta nada: falta la instantaneidad.
 *
 * ## Cero viajes de red, y ése era el requisito duro
 *
 * La 14.11 dejó **una sola consulta** que devuelve las filas y todas las
 * facetas, y cada faceta se cuenta ignorando su propio filtro. O sea que el
 * total resultante de cada opción **ya viajó** con la página. `search-preview.ts`
 * es quien lo sabe; acá no se calcula nada. Un `fetch` por tecla habría sido un
 * viaje real por cada toque desde Venezuela, que es exactamente lo que la 14.11
 * existe para no pagar.
 *
 * ## Ni una regla de producto en este archivo
 *
 * La regla permanente del fundador (AGENTS.md §1). Qué número corresponde a qué
 * opción lo decidió el dominio y llegó escrito en `data-preview`; este
 * componente lee un atributo y lo pone en pantalla. Si decidiera algo, esa
 * decisión quedaría fuera del suelo de cobertura del 90 %.
 *
 * ## Por qué un oyente y no diez manejadores
 *
 * Un `onClick` por opción convertiría los diez enlaces del panel en componentes
 * de cliente, y el panel entero viajaría al navegador. Un solo oyente sobre el
 * contenedor deja el panel donde está —marcado del servidor— y cobra un
 * componente diminuto. **El teclado entra por la misma puerta**: `Enter` sobre
 * un enlace enfocado dispara `click`, así que no hay un segundo camino que
 * mantener.
 *
 * ## Lo que se anuncia
 *
 * `aria-live="polite"`: el número cambia sin que nadie navegue, y sin esto el
 * cambio existiría sólo para quien lo ve. La lista de opciones que este panel
 * reemplazó ya se leía en voz alta, y una mejora que la empeora es una
 * regresión (AGENTS.md §2).
 */
export function LiveResultCount({ label }: { readonly label: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // **El servidor manda.** En cuanto llega una etiqueta nueva se descarta la
  // vista previa, así que no queda estado de cliente que pueda desfasarse del
  // conteo real — que es lo que `search-confirm.ts` protege desde que existe.
  const [served, setServed] = useState(label);
  if (served !== label) {
    setServed(label);
    setPreview(null);
  }

  useEffect(() => {
    const panel = anchor.current?.closest("[data-search-panel]");
    if (panel === null || panel === undefined) return;

    const onActivate = (event: Event) => {
      const { target } = event;
      if (!(target instanceof Element)) return;
      // Tocar algo que NO adelanta un número —el encabezado de un grupo, el
      // «×»— borra la vista previa en vez de dejarla colgada: mostrar el
      // número de un filtro que nadie aplicó es peor que no mostrar ninguno.
      setPreview(target.closest("[data-preview]")?.getAttribute("data-preview") ?? null);
    };

    panel.addEventListener("click", onActivate);
    return () => panel.removeEventListener("click", onActivate);
  }, []);

  return (
    <span ref={anchor} aria-live="polite">
      {preview ?? label}
    </span>
  );
}
