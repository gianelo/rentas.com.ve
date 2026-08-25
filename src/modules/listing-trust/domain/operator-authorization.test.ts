import { describe, expect, it } from "vitest";
import { isAuthorizedOperatorRequest } from "./operator-authorization";

/**
 * The restore route's gate (tasks.md 8.6). Same shape and the same seven
 * malformed-header cases as `cron-authorization.test.ts` — this is the
 * repo's precedent for an auth check living in the domain instead of a
 * route's own `===`, applied to the operator-only restore action.
 */
const SECRET = "el-secreto-del-operador";

describe("isAuthorizedOperatorRequest", () => {
  it("acepta el portador exacto", () => {
    expect(isAuthorizedOperatorRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["sin encabezado", null],
    ["vacío", ""],
    ["sin el esquema", SECRET],
    ["con otro esquema", `Basic ${SECRET}`],
    ["con el secreto equivocado", "Bearer otro"],
    ["con el secreto casi correcto", `Bearer ${SECRET}x`],
    ["con espacios de más", `Bearer  ${SECRET}`],
  ])("rechaza un encabezado %s", (_name, header) => {
    expect(isAuthorizedOperatorRequest(header, SECRET)).toBe(false);
  });

  // Falla CERRADO — un despliegue sin `OPERATOR_SECRET` no abre la ruta de
  // restauración al mundo.
  it.each([
    ["ausente", undefined],
    ["vacío", ""],
  ])("rechaza todo cuando el secreto del servidor está %s", (_name, secret) => {
    expect(isAuthorizedOperatorRequest(`Bearer ${secret ?? ""}`, secret)).toBe(false);
    expect(isAuthorizedOperatorRequest("Bearer lo-que-sea", secret)).toBe(false);
  });
});
