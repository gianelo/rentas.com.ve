import { ImageResponse } from "next/og";
import { AREAS } from "@/modules/listing-catalogue/infrastructure/territorio-areas";
import {
  SOCIAL_CARD,
  SOCIAL_CARD_PALETTE,
  SOCIAL_CARD_SIZE,
  socialCardAreas,
} from "@/modules/listing-discovery/domain/social-card";

/**
 * La tarjeta que se ve cuando alguien pega un enlace del sitio (tarea 26.12).
 *
 * **Se genera, no se sube.** SISTEMA.md dice «Assets: ninguno propio», así que
 * un PNG versionado en el repositorio sería el primer archivo binario de la
 * marca — y quedaría desactualizado el día que la paleta cambie, sin que nada
 * lo note. `next/og` la dibuja en cada despliegue desde los mismos valores que
 * pinta el sitio.
 *
 * **Vale para TODAS las rutas.** Por convención de archivo, Next.js adjunta
 * este `opengraph-image` a cada página que cuelga del layout raíz, así que no
 * hace falta nombrarlo en ningún `metadata`. Es genérica a propósito: una
 * tarjeta por aviso —con su foto y su precio— es otra tarea, y adivinarla acá
 * costaría una consulta a Neon por cada enlace que alguien pegue en WhatsApp.
 *
 * **La desviación del sistema, escrita y no escondida.** SISTEMA.md fija la
 * marca «en el stack del sistema», y `tokens.css:508` declara
 * `--disp: var(--mono)` — es decir, el stack monoespaciado
 * (`ui-monospace, SFMono-Regular, Menlo, monospace`). `next/og` dibuja **fuera
 * de un navegador**: no hay stack del sistema que resolver, y reproducirlo
 * exigiría versionar un archivo de tipografía, que es exactamente el «ningún
 * asset propio» que el sistema prohíbe. Se usa la tipografía que `next/og`
 * trae. Se pierde el carácter monoespaciado de la marca en **una** superficie
 * que nadie navega y que ninguna pantalla del producto comparte; agregar un
 * asset propio para arreglarla contradiría el sistema en todas las demás.
 *
 * Los colores no se escriben acá: salen de `social-card.ts`, donde
 * `social-card.test.ts` los ata al bloque `[data-theme="menta"]` de
 * `src/styles/tokens.css`. `scripts/lint-tokens.mjs` escanea este archivo pero
 * no puede ver un literal escrito como objeto de JavaScript —lo dice su propia
 * cabecera—, así que el gate de esta pantalla es esa prueba.
 */
export const size = SOCIAL_CARD_SIZE;
export const contentType = "image/png";
export const alt = SOCIAL_CARD.alt;

export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: SOCIAL_CARD_PALETTE.bg,
        color: SOCIAL_CARD_PALETTE.ink,
        padding: 80,
      }}
    >
      {/* La marca sobre la placa de acento: es la misma relación
          fondo/tinta que `--accent` / `--accent-ink` tienen en el producto,
          y la única forma que el sistema le da a la marca. */}
      <div style={{ display: "flex" }}>
        <div
          style={{
            display: "flex",
            background: SOCIAL_CARD_PALETTE.accent,
            color: SOCIAL_CARD_PALETTE.accentInk,
            borderRadius: 12,
            padding: "18px 34px",
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          {SOCIAL_CARD.mark}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ fontSize: 62, lineHeight: 1.15, maxWidth: 900 }}>{SOCIAL_CARD.tagline}</div>
        {/* La regla es el `--line` del sistema, y el punto medio el `·` que
            SISTEMA.md ya usa como glifo de texto. */}
        <div style={{ display: "flex", height: 2, background: SOCIAL_CARD_PALETTE.line }} />
        <div style={{ display: "flex", fontSize: 32, color: SOCIAL_CARD_PALETTE.soft }}>
          {socialCardAreas(AREAS.map((area) => area.name))}
        </div>
      </div>
    </div>,
    { ...SOCIAL_CARD_SIZE },
  );
}
