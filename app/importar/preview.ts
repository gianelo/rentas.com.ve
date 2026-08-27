/**
 * Lo que `POST /api/bulk-import` devuelve, escrito una sola vez.
 *
 * Vive en su propio archivo y no dentro del componente cliente porque la ruta
 * de servidor y la pantalla tienen que estar de acuerdo sobre esta forma, y un
 * tipo declarado dentro de un módulo `"use client"` arrastraría ese módulo —
 * y su `useState` — hacia el servidor con sólo importarlo.
 */

/**
 * Las cinco columnas de 14g, en castellano. **Nombradas como la lámina las
 * escribe y no como el dominio las llama** (`externalReference`,
 * `priceUsd`…): esto es el contrato entre la ruta y la pantalla, y las dos
 * hablan el idioma de quien mira la tabla.
 */
export interface CeldasDeFila {
  readonly referencia: string;
  readonly precio: string;
  readonly zona: string;
  readonly habitaciones: string;
  readonly titulo: string;
}

export type NombreDeCelda = keyof CeldasDeFila;

export interface FilaConProblema {
  readonly fila: number;
  readonly razones: readonly string[];
  /**
   * tasks.md 9.29 — lo que la fila traía en el archivo, para que la vista
   * previa pueda mostrar el valor ofensor además del texto del problema.
   * Viajan crudas: el número de la descripción ya viene dentro de `razones`,
   * armado en el servidor con el mínimo real del dominio.
   */
  readonly celdas: CeldasDeFila;
  /** Cuáles de esas celdas resaltar («el valor ofensor va resaltado», 14g). */
  readonly resaltadas: readonly NombreDeCelda[];
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
