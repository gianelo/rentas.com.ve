import { defineConfig } from "vitest/config";

// Integration layer (design.md, "Testing Strategy"): Drizzle queries and
// Postgres-specific behaviour (composite FKs, bit_count Hamming distance,
// the contact_reveal_unique_pair view) run against a real Postgres
// container — never an emulator (see CI's `integration` job). Specs live
// under tests/integration/, not src/, so vitest.config.ts's
// src/**/*.test.ts glob never picks them up and `pnpm test:unit` never
// silently starts needing a database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
  },
});
