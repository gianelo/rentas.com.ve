import { describe, expect, it } from "vitest";
import { isAuthorizedJobRequest } from "./cron-authorization";

const SECRET = "el-secreto-del-cron";

describe("isAuthorizedJobRequest", () => {
  it("acepta el portador exacto", () => {
    expect(isAuthorizedJobRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
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
    expect(isAuthorizedJobRequest(header, SECRET)).toBe(false);
  });

  // Falla CERRADO. Un despliegue sin `CRON_SECRET` no puede convertir la ruta
  // del trabajo en una ruta pública que cualquiera dispare.
  it.each([
    ["ausente", undefined],
    ["vacío", ""],
  ])("rechaza todo cuando el secreto del servidor está %s", (_name, secret) => {
    expect(isAuthorizedJobRequest(`Bearer ${secret ?? ""}`, secret)).toBe(false);
    expect(isAuthorizedJobRequest("Bearer lo-que-sea", secret)).toBe(false);
  });
});
