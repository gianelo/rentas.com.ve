import { describe, expect, it } from "vitest";
import { resolveContactScreen } from "./contact-screen";

/**
 * Mirrors `listing-trust/domain/report-screen.ts`'s reasoning exactly: no
 * JavaScript means the acknowledgement can only arrive by URL, so the shape
 * is POST → redirect → GET that draws whatever the query string says.
 */
describe("resolveContactScreen", () => {
  it("draws the form with no error when neither flag is present", () => {
    const screen = resolveContactScreen(undefined, undefined);

    expect(screen).toEqual({ state: "form", errorNotice: null });
  });

  it("draws the form with an error notice when the error flag is present", () => {
    const screen = resolveContactScreen(undefined, "");

    expect(screen.state).toBe("form");
    expect(screen.state === "form" ? screen.errorNotice : null).not.toBeNull();
  });

  it("draws the sent acknowledgement when the sent flag is present, ignoring the error flag", () => {
    const screen = resolveContactScreen("", "");

    expect(screen.state).toBe("sent");
  });

  it("treats a bare repeated `?enviado` (array form) the same as one present", () => {
    const screen = resolveContactScreen([""], undefined);

    expect(screen.state).toBe("sent");
  });
});
