"use client";

import { useEffect, useRef, useState } from "react";
import {
  type SearchChoice,
  searchChoices,
} from "@/modules/listing-catalogue/domain/search-destination";
import type { SuggestionVocabulary } from "@/modules/listing-catalogue/domain/suggest-filters";
import styles from "./SearchSuggestions.module.css";

/** Cómo se anuncia la lista a quien navega con lector de pantalla. */
const PANEL_LABEL = "Sugerencias";

/**
 * **Las sugerencias mientras se escribe** (tasks.md 14.51 — la 14.35 con la
 * forma que sí entra).
 *
 * ## Es una mejora, y el piso está intacto debajo
 *
 * AGENTS.md §2 y SISTEMA.md §14i, textual: *"la pastilla es un
 * `<form method="get">` de verdad — sin script sigue buscando, y las
 * sugerencias al escribir son una mejora encima, nunca el mecanismo"*. Acá eso
 * es literal: este componente **no dibuja nada** hasta que alguien escribe, no
 * toca el campo, no toca el `submit` y no reemplaza una sola pieza de la
 * pastilla. Con el bundle caído no falta nada — falta la lista, y el
 * formulario sigue enviando a `/`, donde `resolveSearchDestination` traduce y
 * redirige **sobre el vocabulario completo, alias incluidos**.
 *
 * ## La misma función de las dos partes, nunca una segunda copia
 *
 * `searchChoices` es la lista que `resolveSearchDestination` colapsa cuando el
 * servidor recibe el envío. La 14.35 y la 14.51 lo piden con esas palabras, y
 * la razón es que «la etiqueta dice 9» y «la lista trae 9» tienen que seguir
 * siendo la misma pregunta: dos implementaciones del mismo criterio son dos que
 * se separan, y la que se separa es siempre la del cliente, que ninguna corrida
 * de tests puede poner en rojo (el suelo del 90 % llega a `src/modules/` y no
 * llega a `components/`).
 *
 * ## Ni una regla de producto en este archivo
 *
 * La regla permanente del fundador (AGENTS.md §1). Qué se ofrece, en qué orden,
 * con qué ámbito, con qué número al lado y a qué dirección lleva: todo lo
 * decidió el dominio y llega en `SearchChoice`. Acá hay un `map` y un `if` sobre
 * si la lista está vacía — que es *qué muestra este pixel*, no *qué hace el
 * producto*.
 *
 * ## Cero viajes de red, y ése era el requisito duro
 *
 * La 14.35 lo escribió al revés y la 14.51 lo arregló: la taxonomía entera son
 * 89,8 KB gzip y no entra, y un `fetch` por tecla es un viaje real por pulsación
 * desde Venezuela — lo mismo que la 14.11 existe para no pagar. El vocabulario
 * acotado ya viajó con la página, dentro de la MISMA consulta que trajo las
 * filas y las facetas.
 *
 * ## Por qué se lee el campo por el DOM y no por `value`
 *
 * Volver controlado el `<input>` lo convertiría en estado de cliente: con el
 * script caído dejaría de tener el `defaultValue` que el servidor escribe, y
 * perder lo escrito al volver del servidor es lo que hace que alguien abandone
 * (`homeSearchForm` deja esa razón escrita). Un oyente sobre el campo que el
 * servidor ya dibujó no le quita nada a nadie — es el mismo camino que
 * `LiveResultCount` tomó con un solo oyente delegado en vez de diez manejadores.
 */
export function SearchSuggestions({ vocabulary }: { readonly vocabulary: SuggestionVocabulary }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [choices, setChoices] = useState<readonly SearchChoice[]>([]);
  /** Espejo de `choices` para los oyentes, que no se vuelven a crear por render. */
  const abierto = useRef(false);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    const field = form?.querySelector<HTMLInputElement>('input[type="search"]');
    if (!form || !field) return;

    const mostrar = (next: readonly SearchChoice[]) => {
      abierto.current = next.length > 0;
      setChoices(next);
    };

    const onType = () => mostrar(searchChoices(field.value, vocabulary));

    /**
     * **Escape cierra la lista, y el `preventDefault` no es una precaución.**
     * Chromium borra un `<input type="search">` entero al apretar Escape —
     * medido, no supuesto: la primera versión de
     * `tests/measure/sugerencias.spec.ts` encontró el campo vacío. Con la lista
     * abierta, Escape significa «cerrá esto», no «tirá lo que escribí»; el
     * segundo Escape ya no encuentra lista y el navegador hace lo suyo.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (abierto.current) event.preventDefault();
      mostrar([]);
    };

    // **Cerrar al salir del foco, y sólo cuando el foco fue a otra parte de
    // verdad.** Con `relatedTarget` nulo —que es lo que varios navegadores
    // reportan al apretar el ratón sobre un enlace— cerrar acá desmontaría la
    // sugerencia entre el `mousedown` y el `click`, y el toque no llegaría a
    // navegar a ninguna parte. Ante la duda no se cierra: falla del lado de
    // dejar la lista puesta, nunca del de tragarse el toque.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !form.contains(next)) mostrar([]);
    };

    // El toque fuera de la pastilla, que es la otra forma de irse. `pointerdown`
    // y no `click`: pasa antes, y como es FUERA del formulario no puede
    // cancelar el toque sobre una sugerencia.
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !form.contains(target)) mostrar([]);
    };

    field.addEventListener("input", onType);
    field.addEventListener("keydown", onKeyDown);
    form.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      field.removeEventListener("input", onType);
      field.removeEventListener("keydown", onKeyDown);
      form.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [vocabulary]);

  return (
    <div ref={anchor} className={styles.anchor} data-search-suggestions>
      {/* Sin esto el cambio existe sólo para quien lo ve. La lista aparece sin
          que nadie navegue, así que hay que decir que apareció y cuántas trae. */}
      <p className={styles.srOnly} role="status">
        {choices.length === 0 ? "" : `${choices.length} ${PANEL_LABEL.toLowerCase()}`}
      </p>

      {choices.length === 0 ? null : (
        <ul className={styles.panel} aria-label={PANEL_LABEL}>
          {choices.map((choice) => (
            <li key={choice.href}>
              {/* Un `<a>` pelado y no `AppLink`: el destino es la búsqueda de
                  otro lugar, y llegar con una navegación de documento es lo
                  mismo que hace la lupa. Además el panel se desmonta al
                  navegar, así que no hay nada que preservar del cliente. */}
              <a className={styles.option} href={choice.href}>
                <span>{choice.label}</span>
                <span className={styles.scope}>{choice.scope}</span>
                {/* El número, o nada. Un «0» pegado a una opción se lee como un
                    conteo roto, y el dominio ya contestó `null` por eso. */}
                {choice.countLabel === null ? null : (
                  <span className={styles.count}>{choice.countLabel}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
