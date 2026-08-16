const POOLED_HOST_MARKER = "-pooler.";

/**
 * The narrowest guarantee for D2 (design.md): the runtime is serverless, so
 * the Neon *direct* connection endpoint is the predictable way to exhaust
 * Postgres connections under concurrency. Neon's pooled endpoint (PgBouncer,
 * hostname carries `-pooler.`) is the only one this app is allowed to use.
 *
 * This is enforced here — the narrowest point any connection string passes
 * through — rather than left as a deployment convention a caller has to
 * remember, per the design's guiding principle: "a rule a caller can forget
 * is not a guarantee".
 */
export function assertPooledConnectionString(connectionString: string): string {
  let host: string;

  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string.");
  }

  if (!host.includes(POOLED_HOST_MARKER)) {
    throw new Error(
      `DATABASE_URL must target Neon's pooled endpoint (hostname containing "${POOLED_HOST_MARKER}"), ` +
        `got "${host}". The direct endpoint exhausts connections under serverless concurrency (design.md D2).`,
    );
  }

  return connectionString;
}
