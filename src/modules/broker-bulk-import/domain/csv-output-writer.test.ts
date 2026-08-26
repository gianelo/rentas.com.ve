import { describe, expect, it } from "vitest";
import { neutraliseCsvField, writeCsv } from "./csv-output-writer";

/**
 * broker-bulk-import spec, "Generated CSV Output Is Not Executable" (tasks.md
 * 9.24/9.25) + design.md threat matrix, "Generated CSV output": "Leading
 * `=`, `+`, `-`, `@` neutralised in every emitted field... Formula-like
 * value exports inert."
 *
 * **Shared by construction, not by discipline.** `writeCsv` is the ONE place
 * any downloadable CSV gets written — the template (`generate-import-
 * template.ts`) and the future error report both call it rather than
 * re-escaping fields themselves, which is exactly what the spec's
 * "including the template and any error report" phrase requires.
 */

describe("neutraliseCsvField — leading formula-trigger characters", () => {
  it("prefixes a value beginning with '=' with a single apostrophe", () => {
    expect(neutraliseCsvField('=HYPERLINK("http://evil")')).toBe('\'=HYPERLINK("http://evil")');
  });

  it("prefixes a value beginning with '+' with a single apostrophe", () => {
    expect(neutraliseCsvField("+1+1")).toBe("'+1+1");
  });

  it("prefixes a value beginning with '-' with a single apostrophe", () => {
    expect(neutraliseCsvField("-2+3")).toBe("'-2+3");
  });

  it("prefixes a value beginning with '@' with a single apostrophe", () => {
    expect(neutraliseCsvField("@SUM(1,2)")).toBe("'@SUM(1,2)");
  });

  it("does NOT touch a value that does not begin with a trigger character", () => {
    expect(neutraliseCsvField("Apartamento en Chacao")).toBe("Apartamento en Chacao");
  });

  it("does NOT over-neutralise: a trigger character in the MIDDLE of a value is left alone", () => {
    expect(neutraliseCsvField("Precio 100=descuento")).toBe("Precio 100=descuento");
  });

  it("keeps the neutralised value human-readable — original text still present after the prefix", () => {
    const neutralised = neutraliseCsvField("-Vista al mar, tres habitaciones");
    expect(neutralised).toContain("Vista al mar, tres habitaciones");
  });
});

describe("writeCsv — RFC4180 quoting composed with neutralisation", () => {
  it("joins fields with a comma and rows with a newline", () => {
    const csv = writeCsv([
      ["referencia_externa", "titulo"],
      ["AB1", "Apartamento en Chacao"],
    ]);
    expect(csv).toContain("referencia_externa,titulo\nAB1,Apartamento en Chacao");
  });

  it("quotes a field containing the delimiter, doubling any internal quote", () => {
    const csv = writeCsv([["titulo"], ['Casa, "moderna"']]);
    expect(csv).toContain('"Casa, ""moderna"""');
  });

  it("neutralises a formula-like field before writing it, still inside its own cell", () => {
    const csv = writeCsv([["titulo"], ["=cmd|/C calc!A0"]]);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe("'=cmd|/C calc!A0");
  });
});
