import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDotEnvWithoutOverriding } from "./seed";

/**
 * `pnpm db:seed` failed on every developer machine with "DATABASE_URL
 * environment variable is not set" while the value sat in `.env`, because
 * `tsx` does not read `.env` — it only ever sees `process.env`. The command
 * could therefore only work where the variable already came from the
 * environment, which is to say: on a deploy. `drizzle-kit` carries its own
 * .env loading, so `pnpm db:migrate` worked and hid the asymmetry.
 *
 * The precedence rule is the dangerous half and the reason this is tested
 * rather than trusted: if `.env` won over the real environment, a deploy
 * that supplies the real connection string through its environment could be
 * silently redirected to whatever a local file happens to name. Loading
 * `.env` is a convenience; not overriding the environment is a guarantee.
 */
describe("loadDotEnvWithoutOverriding", () => {
  beforeEach(() => {
    // The real `.env` is irrelevant here — what is under test is the
    // precedence applied to whatever the loader produced.
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => {
      process.env.SEED_TEST_FROM_DOTENV = "from-dotenv";
      process.env.SEED_TEST_CONTESTED = "from-dotenv";
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.SEED_TEST_FROM_DOTENV = undefined;
    process.env.SEED_TEST_CONTESTED = undefined;
  });

  it("fills in a value the environment does not have", () => {
    const env: Record<string, string | undefined> = {};
    loadDotEnvWithoutOverriding(env);

    expect(process.env.SEED_TEST_FROM_DOTENV).toBe("from-dotenv");
  });

  it("never overrides a value the real environment already set", () => {
    const env: Record<string, string | undefined> = {
      SEED_TEST_CONTESTED: "from-real-environment",
    };
    loadDotEnvWithoutOverriding(env);

    expect(env.SEED_TEST_CONTESTED).toBe("from-real-environment");
  });

  it("is a no-op rather than a failure when no .env exists", () => {
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory, open '.env'");
    });

    const env: Record<string, string | undefined> = { DATABASE_URL: "from-real-environment" };

    // A deploy has no `.env` at all. Throwing here would break the one
    // environment where the values are already correct.
    expect(() => loadDotEnvWithoutOverriding(env)).not.toThrow();
    expect(env.DATABASE_URL).toBe("from-real-environment");
  });
});
