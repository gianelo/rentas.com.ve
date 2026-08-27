"use client";

import { useId, useRef, useState } from "react";
import { AppLink } from "../../components/atoms/AppLink";
import { ActionButton } from "../../components/atoms/buttons";
import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROW_COUNT,
} from "../../src/modules/broker-bulk-import/domain/csv-import-bounds";
import { REQUIRED_IMPORT_COLUMNS } from "../../src/modules/broker-bulk-import/domain/csv-import-columns";
import styles from "./importar.module.css";
import type { ResultadoImportacion, VistaPreviaResultado } from "./preview";
import { VistaPrevia } from "./VistaPrevia";

/**
 * Láminas 14e (antes de elegir archivo), 14f (los rechazos) y 14h (después de
 * importar), más 14g a través de `VistaPrevia`.
 *
 * ## Por qué esta pantalla puede usar JavaScript, y hasta dónde
 *
 * AGENTS.md §2 exime a **la vista previa del archivo** del piso "funciona sin
 * JavaScript", con el motivo escrito: el trabajo pasa en el dispositivo. La
 * exención es angosta y este componente la respeta en tres puntos:
 *
 * 1. **La autorización no depende del script.** `page.tsx` corre
 *    `authorizeBulkImport` en el servidor y `/api/bulk-import` la corre otra
 *    vez por su cuenta. Esta pieza no mira ninguna bandera: si se dibuja, es
 *    porque el servidor ya decidió (AGENTS.md §1 — "renderizan decisiones que
 *    llegan ya tomadas").
 * 2. **La plantilla —el paso 1— es un `<a href>` real** a
 *    `/importar/plantilla`. Sigue funcionando con el script apagado.
 * 3. **Sin script la puerta queda cerrada, y dice por qué.** El botón de
 *    revisar exige un archivo EN MEMORIA, y meterlo ahí es lo único que sólo
 *    el script puede hacer: sin él nunca se habilita — no por una comprobación
 *    extra, sino porque su condición no se puede cumplir. El `<noscript>`
 *    explica el cierre en vez de dejar la pantalla muda (AGENTS.md §7).
 *
 * ## Por qué el archivo se sube dos veces
 *
 * Porque previsualizar no escribe NADA (spec: "previsualizar sin confirmar no
 * crea nada"), así que del lado del servidor no queda ningún lote a medio
 * hacer que "confirmar" pueda retomar. El archivo se queda acá y se vuelve a
 * mandar al confirmar; `runImportValidation` es la misma función en los dos
 * caminos, que es lo que hace verdadero por construcción que confirmar cree
 * exactamente las filas que la vista previa dio por válidas.
 */

const MAX_MB = Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024));

async function enviar(archivo: File, accion: "revisar" | "crear"): Promise<ResultadoImportacion> {
  const cuerpo = new FormData();
  cuerpo.set("archivo", archivo);
  cuerpo.set("accion", accion);

  const respuesta = await fetch("/api/bulk-import", { method: "POST", body: cuerpo });
  const datos = (await respuesta.json()) as ResultadoImportacion & { error?: string };

  if (datos.error) {
    // 401/403 no deberían pasar acá — el servidor ya cerró la puerta antes de
    // dibujar la pantalla. Si pasan, la sesión venció mientras se llenaba el
    // formulario: se dice, no se ignora.
    return {
      estado: "rechazado",
      motivo: datos.error,
      mensaje:
        "Tu sesión ya no permite importar. Volvé a entrar y probá de nuevo desde «Mis avisos».",
    };
  }
  return datos;
}

export function ImportarCartera() {
  const campoId = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function correr(accion: "revisar" | "crear") {
    if (!archivo) return;
    setEnviando(true);
    try {
      setResultado(await enviar(archivo, accion));
    } catch {
      setResultado({
        estado: "rechazado",
        motivo: "red",
        mensaje: "No pudimos subir el archivo. Revisá la conexión y probá de nuevo.",
      });
    } finally {
      setEnviando(false);
    }
  }

  function volverAEmpezar() {
    setResultado(null);
    setArchivo(null);
    if (entrada.current) entrada.current.value = "";
  }

  const previa = resultado?.estado === "vista-previa" ? (resultado as VistaPreviaResultado) : null;

  return (
    <div className={styles.flujo}>
      <section className={styles.paso}>
        <p className={styles.pasoNumero}>Paso 1</p>
        <h2 className={styles.tituloSeccion}>Bajá la plantilla</h2>
        <p className={styles.explicacion}>
          Trae las {REQUIRED_IMPORT_COLUMNS.length} columnas obligatorias con los nombres exactos y
          una fila de ejemplo. Pegá tus datos debajo y guardá como CSV.
        </p>
        {/* Un enlace, no un botón: es lo único de esta pantalla que tiene que
            seguir funcionando con el script apagado. */}
        <AppLink className={styles.bajarPlantilla} href="/importar/plantilla">
          Bajar plantilla CSV
        </AppLink>
      </section>

      <section className={styles.paso}>
        <p className={styles.pasoNumero}>Paso 2</p>
        <h2 className={styles.tituloSeccion}>Subí tu archivo</h2>

        <label className={styles.etiquetaArchivo} htmlFor={campoId}>
          Elegir archivo
        </label>
        <input
          id={campoId}
          ref={entrada}
          className={styles.campoArchivo}
          type="file"
          accept=".csv,text/csv"
          onChange={(evento) => {
            setResultado(null);
            setArchivo(evento.currentTarget.files?.[0] ?? null);
          }}
        />

        <ul className={styles.limites}>
          <li>
            Máximo <strong>{MAX_IMPORT_ROW_COUNT} filas</strong> por archivo
          </li>
          <li>
            Máximo <strong>{MAX_MB} MB</strong>
          </li>
          <li>
            CSV codificado en <strong>UTF-8</strong>
          </li>
        </ul>

        <ActionButton disabled={archivo === null || enviando} onClick={() => correr("revisar")}>
          Revisar el archivo
        </ActionButton>

        <noscript>
          <p className={styles.sinScript}>
            Esta pantalla necesita JavaScript para leer el archivo en tu computadora antes de
            subirlo. Activalo y recargá; la plantilla de arriba se baja igual sin él.
          </p>
        </noscript>

        <p className={styles.aviso}>
          Las fotos no van en el CSV. Los avisos entran como borradores y cada uno necesita al menos
          una foto para activarse.
        </p>

        <h3 className={styles.tituloColumnas}>Columnas obligatorias</h3>
        <ul className={styles.columnas}>
          {REQUIRED_IMPORT_COLUMNS.map((columna) => (
            <li key={columna}>
              <code>{columna}</code>
            </li>
          ))}
        </ul>
      </section>

      {previa ? (
        <VistaPrevia
          preview={previa}
          archivo={archivo?.name ?? ""}
          enviando={enviando}
          onCrear={() => correr("crear")}
          onCorregir={volverAEmpezar}
        />
      ) : null}

      {resultado?.estado === "rechazado" ? (
        <section className={styles.rechazo} role="alert">
          <h2 className={styles.tituloSeccion}>No pudimos usar ese archivo</h2>
          {/* El mensaje del dominio, entero: es el que dice QUÉ HACER —"volvé
              a exportar como CSV UTF-8", "partilo en dos"— y la lámina 14f
              pide exactamente eso, no una explicación de qué pasó. */}
          <p className={styles.explicacion}>{resultado.mensaje}</p>
        </section>
      ) : null}

      {resultado?.estado === "creado" ? (
        <section className={styles.creado}>
          {/* 14h: "no dice «listo»: dice «ninguna se ve todavía»". */}
          <h2 className={styles.tituloSeccion}>
            Se crearon {resultado.creadas} propiedades. Ninguna se ve todavía.
          </h2>
          <p className={styles.explicacion}>
            Les falta lo único que no venía en el archivo: al menos una foto cada una. Hasta
            entonces quedan como borradores y no aparecen en las búsquedas.
          </p>
          {resultado.yaEstaban.length > 0 ? (
            <p className={styles.explicacion}>
              {resultado.yaEstaban.length} ya las habías importado antes y no se duplicaron:{" "}
              {resultado.yaEstaban.map((fila) => fila.referencia).join(", ")}.
            </p>
          ) : null}
          <AppLink className={styles.bajarPlantilla} href="/mis-avisos">
            Ir a mis avisos
          </AppLink>
        </section>
      ) : null}
    </div>
  );
}
