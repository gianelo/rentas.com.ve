"use client";

import { useEffect, useState } from "react";
import { NeutralButton } from "../atoms/buttons";

export interface CopyContactProps {
  readonly value: string;
  readonly label: string;
}

/**
 * **La única pieza del camino de lectura que necesita JavaScript, y por eso
 * vive acá y no en `components/molecules`.**
 *
 * Esa carpeta tiene una garantía puesta a prueba en
 * `components/design-contract.test.tsx`: ningún átomo ni molécula declara
 * `"use client"`. No es una convención de orden — es lo que mantiene el camino
 * de lectura sin runtime, y esconder este botón ahí adentro la convertiría en
 * una regla que nadie puede verificar. Un directorio aparte deja la promesa en
 * pie y dice en voz alta cuál es la excepción.
 *
 * **Degrada, y en el único sentido que sirve.** Sin JavaScript el botón no
 * aparece: el número queda seleccionable, que es como se copia un teléfono
 * desde siempre. Al revés — un botón dibujado en el HTML que no hace nada — es
 * peor que no tenerlo: se toca, no pasa nada, y quien lo tocó no tiene forma
 * de saber si copió. Por eso el estado arranca en "no disponible" y sólo lo
 * levanta un efecto, que es exactamente lo que no corre sin JavaScript.
 *
 * Se comprueba `navigator.clipboard` y no sólo el montaje: en un contexto no
 * seguro la API no existe, y ahí el botón caería en el mismo silencio.
 */
export function CopyContact({ value, label }: CopyContactProps) {
  const [available, setAvailable] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setAvailable(typeof navigator !== "undefined" && Boolean(navigator.clipboard));
  }, []);

  if (!available) return null;

  return (
    <NeutralButton
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // El navegador puede negar el permiso. Sin acuse falso: el número
          // sigue en pantalla y se puede seleccionar, que es la salida que
          // este botón nunca debe tapar.
          setCopied(false);
        }
      }}
    >
      {/* El acuse se anuncia además de dibujarse: quien usa lector de
          pantalla no ve que la palabra cambió. */}
      <span aria-live="polite">{copied ? "Copiado" : label}</span>
    </NeutralButton>
  );
}
