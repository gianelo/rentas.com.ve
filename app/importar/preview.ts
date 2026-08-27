/**
 * Lo que `POST /api/bulk-import` devuelve, escrito una sola vez.
 *
 * Vive en su propio archivo y no dentro del componente cliente porque la ruta
 * de servidor y la pantalla tienen que estar de acuerdo sobre esta forma, y un
 * tipo declarado dentro de un módulo `"use client"` arrastraría ese módulo —
 * y su `useState` — hacia el servidor con sólo importarlo.
 */

export interface FilaConProblema {
  readonly fila: number;
  readonly razones: readonly string[];
}

export interface VistaPreviaResultado {
  readonly estado: "vista-previa";
  readonly totalFilas: number;
  readonly listas: number;
  readonly errores: readonly FilaConProblema[];
}

export interface CreadoResultado {
  readonly estado: "creado";
  readonly totalFilas: number;
  readonly creadas: number;
  readonly yaEstaban: readonly { readonly fila: number; readonly referencia: string }[];
  readonly errores: readonly FilaConProblema[];
}

export interface RechazadoResultado {
  readonly estado: "rechazado";
  readonly motivo: string;
  readonly mensaje: string;
}

export type ResultadoImportacion = VistaPreviaResultado | CreadoResultado | RechazadoResultado;
