import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "../_lib/require-session";
import { readPublicationContext } from "./publication-context";

export const metadata: Metadata = {
  title: "Publicar — Rentas",
};

/**
 * La entrada al flujo de nueve pasos.
 *
 * No dibuja nada: **manda a donde la persona quedo.** Un formulario largo
 * puede empezar siempre arriba; nueve pantallas no — quien volvio al dia
 * siguiente con el borrador vivo tiene que caer en el paso que le falta, no en
 * el primero que ya contesto.
 *
 * La sesion se pide antes de leer nada. Publicar es una accion protegida, y
 * `/publicar` es la URL que el resto del sitio enlaza, asi que es la que tiene
 * que llevar el callback: entrar devuelve aca en vez de dejar a alguien en la
 * home habiendo perdido lo que venia a hacer.
 */
export default async function PublishPage() {
  const session = await requireSession("/publicar");

  const { currentStep } = await readPublicationContext(session.userId);

  redirect(`/publicar/paso/${currentStep}`);
}
