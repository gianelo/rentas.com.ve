import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { assertPooledConnectionString } from "./pooled-connection";
import * as schema from "./schema";

function getPooledDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  return assertPooledConnectionString(url);
}

// `neon-http` issues one HTTP request per query with no held connection —
// the right shape for a serverless function against Neon's pooled endpoint
// (design.md D2). Interactive multi-statement transactions are not needed by
// anything this app does today (Auth.js adapter calls, single-row use case
// writes); if that changes, `drizzle-orm/neon-serverless` is the documented
// escalation path, not a rewrite.
const sql = neon(getPooledDatabaseUrl());

export const db = drizzle(sql, { schema });
