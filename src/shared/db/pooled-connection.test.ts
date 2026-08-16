import { describe, expect, it } from "vitest";
import { assertPooledConnectionString } from "./pooled-connection";

const POOLED_URL =
  "postgresql://user:pass@ep-cool-forest-12345-pooler.us-east-2.aws.neon.tech/rentas?sslmode=require";
const DIRECT_URL =
  "postgresql://user:pass@ep-cool-forest-12345.us-east-2.aws.neon.tech/rentas?sslmode=require";

describe("assertPooledConnectionString", () => {
  it("accepts Neon's pooled endpoint and returns it unchanged", () => {
    expect(assertPooledConnectionString(POOLED_URL)).toBe(POOLED_URL);
  });

  it("rejects Neon's direct endpoint — connection exhaustion is the predictable failure under serverless concurrency (design.md D2)", () => {
    expect(() => assertPooledConnectionString(DIRECT_URL)).toThrow(/pooled endpoint/i);
  });

  it("rejects a value that is not a valid URL at all", () => {
    expect(() => assertPooledConnectionString("not-a-url")).toThrow();
  });
});
