# AGENTS.md

Read this before writing anything in this repository. It is agent-agnostic on purpose — Claude, Codex, Cursor, whatever comes next.

`rentas.com.ve` is a free long-stay residential rental marketplace for Distrito Capital and Maracaibo. Publishing and searching are free; the platform never holds money, writes contracts, or takes a commission. When a tenant finds something, they register and get the publisher's WhatsApp.

---

## 1. The rules that are not negotiable

**No business rules in the front. Ever.** This is the founder's permanent rule, stated in those words. Rules live in `src/modules/*/domain/` (pure) or `src/modules/*/application/` (orchestration). `app/` and `components/` render decisions that arrive already made — they never make one. If you find yourself writing an `if` in a component that decides *what the product does* rather than *what this pixel shows*, it belongs in a domain.

The practical reason sits next to the principle: the 90% coverage floor reaches `src/modules/` and does not reach `app/`. A rule written in a component is a rule nothing protects.

**Strict TDD.** RED before GREEN, literally. Write the failing test, watch it fail, then make it pass. A test you never saw fail is decoration, not coverage.

**Mutation-check what matters.** After a test passes, break its subject on purpose and confirm that test — not another one — turns red. Then restore. This repo has caught real defects this way and the habit is why.

**No `Co-Authored-By` and no AI attribution in commits.** Conventional commits, written in Spanish, matching `git log --oneline -20`.

---

## 2. The design system is the visual source of truth

**Do not invent a screen. Derive it.**

| Where | What |
|---|---|
| `design/reference/sistema/SISTEMA.md` | The system of record. Structure `compacto` + palette `menta` (D14/D16). |
| `design/reference/sistema/tokens.css` | The reference tokens. |
| `src/styles/tokens.css` | The tokens production actually uses. |
| `design/pantallas/*.dc.html` | 9 boards: Entrar, Ficha, Lista y Filtros, Publicar (mobile + desktop), plus Sistema. |
| `design/especificaciones/*.md` | Flows, mobile UX, and per-screen specs. |

**The boards cover 6 of the product's 22 surfaces.** The other 16 — empty states, rejected, expired, sign-up, contribution, emails — are explicitly **derived from the system, never improvised**: same tokens, same three-button hierarchy, same row anatomy. SISTEMA.md says it outright: *"Si una pantalla necesita un valor que el sistema no define, se extiende el sistema; no se inventa un valor local."*

**Tokens are enforced, not suggested.** `pnpm lint:tokens` runs `scripts/lint-tokens.mjs` and is its own CI job. A hardcoded colour, size, or shadow fails the build. If a token is missing, add it to the system — do not write the literal.

**The `.dc.html` boards are references, not code to copy.** They carry the design tool's own `support.js` runtime and inline styles; none of that reaches production. Recreate the design with this codebase's own patterns.

**No JavaScript on the read path (D13).** Search, results, and the listing page must work with scripting disabled. Forms are real `<form method="get">` / native POST. Live suggestions and similar are enhancements layered on top, never requirements. The `crawlability` e2e project runs the suite with scripting off — that is how this stops being a claim.

---

## 3. Architecture

```
src/modules/<capability>/
  domain/          pure rules, no I/O, no Date injected from outside
  application/     use cases + ports (interfaces the domain needs)
  infrastructure/  adapters (Drizzle, R2, Resend, Auth.js)
app/               Next.js routes and pages — render only
components/        atoms / molecules / organisms — render only
```

Ports are narrow on purpose. `ContactRevealEventPort` has only `record()` — no update, no delete — because the table is append-only evidence. When you need to read from a table whose write port is deliberately narrow, **add a read port beside it**; do not widen the write one.

A domain function should take what a port already found and answer one question. `src/modules/contact-reveal/domain/reveal-rate-limit.ts` is the idiom: it receives the listing ids already inside the window and decides one thing, with no `Date` and no I/O.

---

## 4. Commands

```
pnpm test:unit          vitest run
pnpm test:integration   needs: pnpm db:test:up && pnpm db:test:migrate  (Dockerised Postgres)
                        after:  pnpm db:test:down
pnpm test:e2e           playwright — runs against a preview, or a local production build
pnpm typecheck          tsc --noEmit
pnpm lint               biome check .        (your own formatting errors WILL fail the build;
                                              pnpm exec biome check --write <file> fixes them)
pnpm lint:tokens        the design-token gate
pnpm db:generate        drizzle-kit generate
```

Coverage floor: 90% statements/branches/functions over `src/modules/**`. `app/` and `components/` carry none.

CI note: heavy jobs are gated on `github.event_name == 'push'`, so the `pull_request` run shows many `skipping` lines on purpose — it is not a failure.

---

## 5. The plan, and why a checkbox can lie

Planning artifacts live in `openspec/changes/mvp-rental-listings/`: `proposal.md`, `design.md`, `tasks.md`, and per-capability specs under `specs/`.

**`design.md` is where decisions and their reasons live.** Read the relevant section before changing anything it covers — especially "Open Questions", which holds real founder decisions that block real work.

**Before building a task, check whether it already exists.** This has bitten the project more than once: a whole phase sat unmarked in `tasks.md` while its code was merged and tested. An agent that trusts the checkbox writes a second migration for a table that is already there.

When you finish a task, mark it with **the file and the named test that proves it** — not a bare `[x]`. And when the implementation deviates from the task text for a good reason, record it as a correction with the reason. Two examples already in the file: `listing_reminder`'s unique key is `(listing_id, kind, expires_at)` and not the two columns the task named, because one cycle sends two notices; and the auto-hide state is `hidden`, not the `hidden_by_reports` the task text invented.

---

## 6. Delivery

**Branch from `dev`. Open PRs against `dev`, never against `main`.** Work accumulates in `dev` and reaches production through a single `dev → main` PR, because Vercel deploys are rate-limited.

Branch names: `type/description` — `feat/`, `fix/`, `docs/`, `test/`, `chore/`, `refactor/`, `perf/`, `ci/`.

Review budget: **400 changed lines per PR**, counted over reviewable code. Past that, split into stacked PRs. Budget roughly 1.5–2× your implementation estimate once RED tests, GREEN tests and integration coverage are counted — this has been underestimated three times.

PR bodies here are written in Spanish and explain **why**, with the verification evidence at the end. There is no template, no issue-first requirement, and no `type:*` labels.

**Two migrations cannot be generated in parallel.** Drizzle's `_journal.json` collides visibly, but the `000N_snapshot.json` files collide *silently* — each is generated from the schema its author saw, so the second one describes a database without the first one's tables and merges clean. Never run two agents that both touch the schema.

That silent class of defect is this project's most expensive one: PR #103 exists because two branches touched different files, merged without conflict, and the types did not compose. Each branch passed its own gates; neither tested the meeting.

---

## 7. Fail closed

A recurring pattern here, and it is deliberate every time:

- Missing `CRON_SECRET` leaves the job route **closed**, not open.
- Missing mail configuration makes the reminder job answer `500` rather than start a batch it cannot deliver — starting one would burn each listing's ledger reservation with nothing sent, and the next run would not retry.
- The locked contact state has **no `value` property at all**, so a render physically cannot leak it.
- `contact_reveal_event.message` is nullable with a `NOT VALID` check rather than `NOT NULL DEFAULT ''`, because backfilling would write a fact that never happened into an append-only log. **That constraint is never validated**, and the migration says so inside itself.

When you add a guard, prefer the shape where the failure mode is refusal.
