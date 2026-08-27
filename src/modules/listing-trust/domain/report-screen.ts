/**
 * Qué dibuja y qué dice la pantalla de reportar un aviso (tasks.md 8.7,
 * F31 — «enlace discreto al pie» que abre un formulario de reporte).
 *
 * **Vive en el dominio y no en la página por la regla permanente del
 * fundador**: una regla de negocio nunca vive en el frente. Y por la razón
 * práctica que va al lado — el suelo de cobertura del 90 % llega a
 * `src/modules/` y no llega a `app/`, así que una decisión escrita en la
 * página es una decisión que nada protege.
 *
 * Puro y sin E/S, como `resolveReportOutcome`: recibe lo que la URL trae y
 * contesta una sola pregunta.
 */

/**
 * La marca con la que la acción de servidor redirige después de reportar.
 *
 * **Sin JavaScript el acuse sólo puede llegar por una URL.** Un POST no puede
 * devolver estado a la pantalla sin `useActionState`, que es cliente; el
 * camino de lectura no depende de que el script llegue (AGENTS.md §2), así que
 * la respuesta es la de siempre: POST → redirección → GET que dibuja el acuse.
 *
 * Que alguien escriba `?enviado` a mano dibuja el acuse sin haber reportado
 * nada. Es inofensivo a propósito y se prefiere a la alternativa: firmar un
 * token para un cartel de agradecimiento sería criptografía para proteger a
 * alguien de mentirse a sí mismo, y no registra ni oculta nada — el único
 * camino a `listing_report` sigue siendo el POST.
 */
export const REPORT_SENT_PARAM = "enviado";

export interface ReportFormScreen {
  readonly state: "form";
  readonly heading: string;
  readonly body: string;
  readonly submitLabel: string;
}

/**
 * **No lleva el resultado encima, y ahí está la garantía entera.**
 *
 * `reportListing` devuelve `{ autoHidden }`, y decir «este aviso quedó oculto»
 * le entrega a quien ataca el dato exacto que le falta: cuántas cuentas más
 * necesita. Decir nada, en cambio, no le enseña a nadie que el reporte llegó.
 *
 * La salida elegida es la misma forma que AGENTS.md §7 ya usa para el contacto
 * bloqueado —el estado sin la propiedad `value`, así un render no puede
 * filtrarla—: este tipo no tiene ningún campo donde el resultado quepa, y
 * `resolveReportScreen` no tiene ningún parámetro por donde recibirlo. El
 * acuse es literalmente el mismo objeto para el primer reportante y para el
 * tercero.
 */
export interface ReportSentScreen {
  readonly state: "sent";
  readonly heading: string;
  readonly body: string;
}

export type ReportScreen = ReportFormScreen | ReportSentScreen;

const FORM: ReportFormScreen = {
  state: "form",
  heading: "Reportar este aviso",
  body:
    "Contanos que algo no está bien con este aviso y lo revisamos. " +
    "Contamos un solo reporte por cuenta, así que no hace falta insistir.",
  submitLabel: "Enviar el reporte",
};

const SENT: ReportSentScreen = {
  state: "sent",
  heading: "Recibimos tu reporte",
  body:
    "Gracias por avisarnos. Revisamos los avisos reportados y damos de baja " +
    "los que no corresponden. No hace falta que hagas nada más.",
};

/**
 * **Presencia y no valor.** `?enviado` pelado llega como cadena vacía, y
 * repetido llega como arreglo; un `if (flag)` habría tratado el primero como
 * ausente y el acuse no se habría dibujado nunca — el caso normal, además,
 * porque una redirección no necesita inventarle un valor a la marca.
 */
export function resolveReportScreen(
  sentFlag: string | readonly string[] | undefined,
): ReportScreen {
  return sentFlag === undefined ? FORM : SENT;
}
