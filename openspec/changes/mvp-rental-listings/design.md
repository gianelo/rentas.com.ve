# Design: MVP Rental Listings

Greenfield. This design carries the **blocking stack decision** for the whole project, and encodes the MVP's two hard guarantees (city isolation, cross-publisher photo dedup) structurally rather than by caller discipline.

## Decision at a glance

| Concern | Choice | Free tier at launch |
|---|---|---|
| Language / runtime | TypeScript, Node 22 | — |
| Framework | Next.js 15 App Router + React 19 | — |
| Hosting | Vercel (Hobby) | Yes — see D8, tracked debt |
| Database | Neon Postgres (pooled endpoint) | Yes |
| Data access | Drizzle ORM + `@neondatabase/serverless` | — |
| Object storage | Cloudflare R2 (S3 API, presigned PUT) | 10 GB, $0 egress |
| Auth | Auth.js v5, Google provider, Drizzle adapter | Yes |
| Email | Resend + React Email | 3k/mo, 100/day |
| Scheduler | Vercel Cron → authenticated HTTP job route | Yes — see D3 |
| Image processing | `sharp` (resize + dHash source buffer) | — |
| Test / lint | Vitest, Playwright, Biome, pnpm | — |

**`test_command`: `pnpm test`** (`vitest run`).

## Technical Approach

Screaming architecture: one folder per capability, each internally hexagonal. The Next.js `app/` tree is a thin delivery adapter that only translates HTTP/RSC into a use case call — no business rule lives there.

```
src/
  modules/
    identity/            listing-publication/   listing-search/
    contact-reveal/      listing-lifecycle/     listing-trust/
    broker-bulk-import/  voluntary-contribution/
      domain/            entities, value objects, invariants (zero deps)
      application/       use cases + ports (interfaces only)
      infrastructure/    Drizzle repos, R2, Resend, sharp adapters
  shared/                db client, config, result type, errors
app/                     routes, server actions, RSC containers
components/              atomic design; presentational only, no data fetching
```

UI follows container-presentational: RSC server components are the containers (they call use cases and fetch), client components are presentational and receive props.

**Guiding principle — guarantees live in the narrowest API.** A rule that can be forgotten by a caller is not a guarantee. Both hard rules below are enforced by making the unsafe query unrepresentable.

## Architecture Decisions

### D1 — TypeScript / Next.js / Vercel over anything else

| Option | Verdict |
|---|---|
| **Next.js + Vercel** | **Chosen.** Founder is TS full-stack; one repo, one deploy, one language across UI, use cases, and the job. Part-time hours are the scarcest resource — familiarity beats theoretical fit. |
| Python/Django, Go, Rails | Rejected. Objectively fine, but every bug becomes three nights instead of one. |
| Remix / SvelteKit / Astro | Rejected. Comparable fit, smaller ecosystem gain, no reason to trade away the founder's strongest tooling. |
| Split SPA + separate API | Rejected. Doubles deploys, CORS, and auth surface for a solo maintainer. |

### D2 — Neon + Cloudflare R2 over Supabase all-in-one

Supabase is the tempting "one service" answer and was seriously considered. It loses on **egress**: its free tier caps bandwidth at ~5 GB/month, and a listing page with 6 photos is ~2 MB, so the catalog would throttle at roughly 2,500 detail views/month — before the product has an audience.

R2 charges **zero egress** and gives 10 GB free, which is decisive for a photo-heavy marketplace. Once storage leaves Supabase, its remaining advantage is Auth, and Auth.js covers that inside the app with sessions in our own Postgres — which also keeps `user`, `listing`, `photo_hash`, and `reveal_event` joinable in one database with no cross-service reads.

Rejected: Vercel Postgres/Blob (thinner free tier, deeper lock-in), Railway/Render/Fly (no meaningful free tier remains), SQLite/Turso (weaker for the ad-hoc metric queries the north star needs).

### D3 — The scheduled job: dumb trigger, idempotent job

This is the constraint that breaks naive serverless designs, so it is designed to survive any scheduler.

**The trigger never does the work.** `POST /api/jobs/expiry-reminders` is an ordinary authenticated route that runs `SendExpiryRemindersUseCase`. Vercel Cron calls it daily. Because the entry point is plain authenticated HTTP, the scheduler is swappable in minutes — Cloudflare Worker cron, GitHub Actions, or a founder running `curl` by hand — with no code change. That is the real mitigation for platform risk.

The use case is **idempotent, batched, and self-recording**:

- Selects listings where `expires_at` falls in the 5-day window and status is `active`.
- Processes in bounded batches, so a platform execution timeout truncates rather than corrupts, and the next run resumes.
- `listing_reminder` carries `UNIQUE (listing_id, expires_at)`, so a re-run, retry, or double-trigger cannot double-send.
- Every run writes a `job_run` row: `started_at`, `finished_at`, `status`, `candidates_found`, `reminders_sent`, `failures`, `error`. **The job failing silently is the single highest-likelihood MVP risk; recorded runs from day one are the answer.**

Vercel Hobby crons fire once per day with best-effort timing (drift up to ~1 hour). At day granularity for a 5-day-ahead reminder, drift is irrelevant. Cron staleness is still detectable: a "no successful `job_run` in 48h" check is a follow-up, not MVP scope.

### D4 — Perceptual hashing: dHash + Hamming in Postgres

**Approach:** `sharp` normalizes each upload to a 9×8 grayscale buffer; a **64-bit dHash** (difference hash — each bit compares a pixel to its right neighbour) is computed in the publication use case. Cryptographic hashes are explicitly not used: they cannot see a re-encoded or resized copy of the same photo, which is exactly the scam pattern.

**Where the comparison runs:** server-side at publish time, inside `PublishListingUseCase`, **before** the listing becomes `active`. The hash is stored as Postgres `bit(64)`; similarity is `bit_count(hash # $candidate) <= 8` (Hamming distance), using the native `bit_count` available on Postgres 14+.

**The same-publisher exemption is structural.** The photo-hash port exposes exactly one lookup:

```ts
interface PhotoHashPort {
  // No "findAllMatches" exists. The exemption cannot be forgotten.
  findMatchesFromOtherPublishers(
    hash: PerceptualHash,
    excludePublisherId: PublisherId,
    maxDistance: number,
  ): Promise<PhotoHashMatch[]>;
}
```

The publisher exclusion is a required argument on the only available query, pushed into the SQL `WHERE publisher_id <> $2`. An honest owner republishing their own property after expiry passes by construction — the renewal flow cannot be broken by this rule.

*Scale note:* a sequential scan is correct and fast at MVP volume (thousands of photos). Past ~100k photos, split the hash into four 16-bit buckets with an exact-match prefilter, or move to a BK-tree. Not MVP work.

### D5 — City isolation enforced by schema and signature

Two layers, no runtime filter to forget:

1. `zone` has `UNIQUE (id, city_id)`; `listing` carries a **composite foreign key** `(zone_id, city_id) → zone(id, city_id)`. A Maracaibo listing physically cannot hold a Distrito Capital zone.
2. `ListingSearchPort.search(criteria)` takes `cityId` as a **required non-nullable** field. There is no "search all cities" method to call by accident.

Zones are a curated seed table maintained by the founder; no free text.

### D6 — North star: one event table, one view

The metric has **two definitions that must both survive**: every reveal action, and the count of unique `(tenant, listing)` pairs. They are served by **one table and one view** — a single write, no second copy of the truth.

**`contact_reveal_event` — the single source of truth.**
`id, listing_id, publisher_id, tenant_user_id, city_id, revealed_at`. Append-only, **never deduplicated**. Every reveal action is one row, including a tenant revealing the same listing five times. Nothing is ever collapsed or deleted. `RevealContactUseCase` performs exactly one insert.

`city_id` is **copied at write time**, not joined. This keeps the metric intact even if a listing is later edited, expired, hidden, or deleted — a metric that a `JOIN` can erase is not a metric. The view inherits that property for free.

**`contact_reveal_unique_pair` — the headline go/pivot number, as a view.**

```sql
CREATE VIEW contact_reveal_unique_pair AS
SELECT DISTINCT ON (tenant_user_id, listing_id)
       tenant_user_id,
       listing_id,
       publisher_id,
       city_id,
       revealed_at AS first_revealed_at,
       count(*) OVER (PARTITION BY tenant_user_id, listing_id) AS reveal_count
FROM contact_reveal_event
ORDER BY tenant_user_id, listing_id, revealed_at, id;
```

`DISTINCT ON` keeps the earliest row per pair — which is what makes `first_revealed_at`, `publisher_id`, and `city_id` first-reveal values — while the window `count(*)` carries the repeat count. Exactly one row per `(tenant_user_id, listing_id)`, by construction.

**Why a view rather than a maintained projection.** The headline query stays a plain `COUNT(*)` over a name that is already deduplicated, so the correct number remains the easy number and no analyst has to remember `COUNT(DISTINCT …)`. That guarantee is the point, and a view delivers it identically. A maintained table would buy latency at the price of three real correctness risks: silent divergence the moment the second write ever leaves the transaction, hot-row lock contention on popular listings, and a `reveal_count` cache that can drift from the authoritative log. At MVP scale the aggregation runs over a few thousand rows, so that trade buys speed the project does not need with correctness it cannot spare.

**Escalation path (the reason deferring is safe):** if the aggregation ever becomes slow, `contact_reveal_unique_pair` can be promoted to a `MATERIALIZED VIEW` with a scheduled refresh, or to a maintained projection table, **without changing a single calling query** — callers only ever reference the view name. The decision is reversible at any time, which is precisely why it can be deferred now.

| Question | Query | Supporting index on `contact_reveal_event` |
|---|---|---|
| Unique tenant-listing pairs, per city, over time | `COUNT(*)` on `contact_reveal_unique_pair` filtered by `city_id`, `first_revealed_at` | `(tenant_user_id, listing_id, revealed_at, id)` — supplies the `DISTINCT ON` ordering and the window partition with no sort step |
| Unique pairs for one listing | `COUNT(*)` on the view with `listing_id = $1` | `(listing_id, revealed_at)`; `listing_id` is a `DISTINCT ON` key so the predicate pushes down to the base table |
| Total reveal actions, per city, over time | `COUNT(*)` on `contact_reveal_event` | `(city_id, revealed_at)` |
| Reveal actions for one listing | `COUNT(*)` on `contact_reveal_event` | `(listing_id, revealed_at)` |

*Plan note:* `city_id` and `first_revealed_at` are derived inside the view, so predicates on them cannot push down to the base table — the view aggregates first, then filters. Adding `city_id` to the grouping key would enable pushdown but would split a pair into two rows if a listing's city ever changed, so correctness wins. This is exactly the cost the escalation path above is there to absorb.

**Cohort semantics:** a pair is counted once, in the period of its `first_revealed_at`. A tenant who first revealed a listing in month 1 and returns in month 3 adds nothing to month 3's unique-pair count — it shows up in `reveal_count` and in the raw log instead. State this next to the 6-month go/pivot number so it is never read as monthly-active behaviour.

### D7 — Phone verification: port with no adapter

`identity/application/ports/phone-verification.port.ts` defines the contract. The only shipped implementation is `DisabledPhoneVerificationAdapter`, returning `{ enabled: false }`, wired behind `PHONE_VERIFICATION_ENABLED=false`. The domain never branches on the flag; registration simply never awaits verification in the MVP. The future WhatsApp inbound-code adapter drops in with zero domain change.

### D8 — Vercel Hobby accepted as tracked debt, with a hard trigger

**Resolved — this is not an open risk.** Rentas launches and operates on Vercel Hobby while the product is entirely free and produces no revenue. That is legitimate use under the Hobby terms: no listing fee, no featured placement, no advertising, no paid tier of any kind in v1.

**Trigger condition (binding):** migrating to Vercel Pro (~$20/month) is a **required precondition of the first monetization step**, not a follow-up to it. Any of the following may not ship until the account is on Pro:

- a listing fee of any kind,
- a featured-placement or promoted-listing fee,
- advertising.

| Item | Value |
|---|---|
| Debt | Hosting plan is licensed for non-commercial use only |
| Accepted because | v1 is free forever by product decision; cost at launch must be zero |
| Trigger | First monetization step of any kind |
| Cost when triggered | ~$20/month, Vercel Pro |
| Migration effort | Plan upgrade only — same project, no code, config, or data change |

The debt is cheap precisely because it is a billing change, not an architectural one. Nothing in this design depends on Hobby-tier behaviour, and D3 already keeps the scheduler swappable, so even a full move off Vercel stays bounded.

## Data Flow

**Publish (with duplicate rejection)**

```
Publisher ─→ RSC form ─→ presigned PUT ──────────────→ R2 (temp prefix)
                │
                └─→ PublishListingUseCase
                      ├─ sharp → 9x8 grayscale → dHash(64)
                      ├─ PhotoHashPort.findMatchesFromOtherPublishers(...)
                      │     match  → REJECT, listing never becomes active
                      │     none   → persist hash + promote object
                      └─ listing.status = active, expires_at = now + 30d
```

**Expiry reminder (the only background process)**

```
Vercel Cron ─(Bearer CRON_SECRET)─→ POST /api/jobs/expiry-reminders
                                      └─→ SendExpiryRemindersUseCase
                                            ├─ find active, expires_at in 5d window
                                            ├─ per batch: insert listing_reminder
                                            │    (UNIQUE listing_id+expires_at ⇒ idempotent)
                                            ├─ EmailPort.send(renewal link w/ signed token)
                                            └─ job_run: counts, failures, error
Publisher ─→ GET /renew/{token} → confirmation page → POST → +30 days, token burned
```

Renewal is deliberately **GET-renders / POST-mutates**. Email security scanners prefetch links; a mutating GET would silently burn every renewal token before the publisher ever clicked.

## Data Model (core tables)

`user`, `account`, `session` (Auth.js) · `city` · `zone` · `listing` · `listing_photo` · `listing_photo_hash` · `contact_reveal_event` · `listing_report` · `moderation_action` · `listing_reminder` · `job_run` · `bulk_import_batch`

Added for this revision: `user.bulk_import_enabled` (boolean, default false, operator-set) · `listing.status` gains a `draft` state excluded from search, from contact reveal, and from the expiry clock · `listing.external_reference` (nullable) with a **unique index on (`publisher_id`, `external_reference`)** — that composite is what makes re-importing the same file idempotent, so it is a database constraint rather than an application check.

Views: `contact_reveal_unique_pair` (D6), created in a Drizzle migration alongside `contact_reveal_event`.

`listing.status`: `draft | active | expired | hidden_by_reports | removed`. `listing.publisher_type`: `owner | broker`, NOT NULL, no default — it is the core trust claim and must never be inferred. `listing.price_usd`: single `numeric(10,2)`, no currency column, no conversion.

Auto-hide: three rows in `listing_report` for one listing sets `hidden_by_reports`; operator restore writes a `moderation_action` and returns the listing to `active`.

## File Changes

| Path | Action | Description |
|---|---|---|
| `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `playwright.config.ts` | Create | Toolchain |
| `drizzle/` + `src/shared/db/schema.ts` | Create | Schema, migrations, and the `contact_reveal_unique_pair` view |
| `src/modules/*/{domain,application,infrastructure}/` | Create | Six capabilities |
| `app/`, `components/` | Create | Delivery + atomic-design UI |
| `app/api/jobs/expiry-reminders/route.ts`, `vercel.json` | Create | Job route + cron schedule |
| `openspec/config.yaml` | Modify | **Follow-up F1** — not edited by this phase |

## Testing Strategy

| Layer | What | How | Command |
|---|---|---|---|
| Unit | Domain invariants, dHash + Hamming math, expiry/renewal date rules, auto-hide threshold, use cases against in-memory port fakes | Vitest, no I/O | `pnpm test:unit` |
| Integration | Composite-FK city isolation, `bit_count` similarity SQL, reminder idempotency under double-run, `job_run` recording, **unique-pair view** (after N repeat reveals of one pair the view returns exactly one row, with `first_revealed_at` = earliest `revealed_at` and `reveal_count = N`, while `contact_reveal_event` still holds all N rows) | Vitest + Dockerised Postgres matching Neon's major version | `pnpm test:integration` |
| E2E | Publish → search → gated reveal; anonymous cannot see WhatsApp; duplicate photo rejected across accounts but accepted for the same publisher | Playwright | `pnpm test:e2e` |

Ports as interfaces make the domain and application layers fully testable with zero infrastructure — this is what makes strict TDD viable for a part-time founder.

**Integration tests must use real Postgres, not an emulator**, because `bit_count` semantics and composite-FK enforcement are precisely what is under test.

### D9 — Bulk import is a loader, not a second publication path

The CSV import parses, validates, and creates **drafts**, then hands every listing to the existing `listing-publication` use cases. It gets no repository write path of its own into `listing`.

The reason is the one that always applies here: *a rule the caller can forget is not a guarantee.* If import owned its own inserts, every publication invariant — publisher type, curated zone, USD-only price, min content — would have to be re-implemented and would silently drift the first time one of them changed. `publisher_type` in particular is derived from the importing account and is **unreadable from the file**; a broker who writes `owner` in a column must not become an owner, because that single claim is the product's core trust signal.

**Two phases, because the CSV cannot carry images.** Phase A creates drafts from the file. Phase B attaches photos through the presigned PUT to R2 already designed for the single-listing flow. This reuses the existing trust pipeline unchanged, and keeps image bytes off the serverless function entirely — Vercel caps a function request body at ~4.5 MB, which a real portfolio would blow past instantly. Server-side URL fetching was rejected: it buys nothing and adds an SSRF surface.

**Access is granted per account by the operator.** With 5–10 seed brokers, an operator-set `bulk_import_enabled` flag caps blast radius, removes any need for rate-limiting or anti-abuse machinery in v1, and doubles as the exact bargaining chip the broker alliance was promised.

### D10 — Contribution stays outside the system

Voluntary contribution is a dismissible invitation and an external link. No payment rail is integrated, no contributor state is stored, and no capability is gated. Processing payments in-app would add compliance, reconciliation, and financial-data handling — the precise capability the MVP excluded on purpose.

The destination is server configuration, never request input. A contribution page that accepts a destination parameter lets an attacker phish under our own domain, and this product's entire value proposition is *you do not get scammed here*.

## Security Boundaries

Full threat matrix is **N/A** — no routing/shell/subprocess/VCS-automation/executable-classification boundary exists. The following boundaries require RED tests:

| Boundary | Requirement | RED test |
|---|---|---|
| Cron job route | Constant-time `Bearer CRON_SECRET` check; unauthenticated request must not send email | Unauthenticated POST returns 401 and `reminders_sent = 0` |
| Renewal token | HMAC-signed, listing-scoped, single-use, expiring; GET never mutates | Replayed token rejected; GET leaves `expires_at` unchanged |
| Photo upload | MIME + magic-byte + size validation via `sharp` before persistence | Non-image and oversized payloads rejected |
| Contact reveal rate | Per-account limit per window; the catalog and its WhatsApp numbers must not be drainable by one registered account | Account exceeding the window is throttled and reveals stop |
| Bulk import access | `bulk_import_enabled` checked server-side on every import endpoint; hiding the UI is not a control | Enabled-flag-less account POSTing directly returns 403 and creates no draft |
| Presigned upload scope | Key derived server-side with a per-account prefix; short TTL; `content-length-range`; fixed content-type | Client-supplied key rejected; oversized PUT rejected |
| Draft ownership | Photo attachment authorised against the draft's owner | Broker B attaching to broker A's draft returns 403 |
| CSV input bounds | Max file size and max row count enforced before parsing; streaming parse, never load-all | Oversized file refused without being parsed |
| Generated CSV output | Leading `=`, `+`, `-`, `@` neutralised in every emitted field | Formula-like value exports inert |
| Contribution destination | Resolved from server config only; never from a query parameter, path segment, or body | Crafted destination parameter is ignored; configured destination is served |
| CSV column mapping | Unrecognised columns ignored, never mapped; `publisher_type`, `status`, `expires_at`, ownership never sourced from the file | File carrying those columns produces drafts with system-derived values |

WhatsApp numbers are never included in anonymous RSC payloads — the field is omitted server-side, not hidden with CSS.

Session handling and CSRF come from Auth.js, query parameterisation from Drizzle, and output escaping from React defaults. These are inherited from the stack choice, not re-implemented — but the boundaries above are not covered by any of them.

## Migration / Rollout

No migration — greenfield. Ship in capability slices, each independently deployable: identity → publication (+trust) → search → reveal → lifecycle. Each slice is sized against the 400-line review budget; publication+trust is the likeliest to need splitting.

## Required Follow-up Actions

**F1 — `openspec/config.yaml` (this phase does NOT edit it; `sdd-tasks` must sequence it as an early task):**

```yaml
context: |
  Stack: TypeScript / Next.js 15 App Router / React 19 on Vercel.
  Data: Neon Postgres + Drizzle ORM. Storage: Cloudflare R2. Auth: Auth.js v5 (Google).
  Email: Resend. Architecture: hexagonal per capability under src/modules/, screaming layout.
  Testing: Vitest (unit + integration), Playwright (e2e). Style: Biome. Package manager: pnpm.
testing:
  runner: vitest
  command: pnpm test
  layers: { unit: true, integration: true, e2e: true }
  coverage: { available: true, command: pnpm test:coverage }
  quality: { linter: biome, type_checker: tsc, formatter: biome }
  status: resolved
rules:
  apply:
    test_command: pnpm test
  verify:
    test_command: pnpm test
    build_command: pnpm build
```

**F2** — confirm current free-tier limits (Vercel cron, Neon storage, R2, Resend daily cap) at implementation time; provider tiers change.

## Tracked Debt

| Debt | Trigger to repay | Cost | Decision |
|---|---|---|---|
| Vercel Hobby non-commercial licensing (D8) | **Fired.** Soliciting voluntary contributions is money solicited from a Hobby deployment. Previously scoped to a listing fee or advertising; the contribution invitation reaches the same clause | ~$20/mo (Vercel Pro) | **Open — founder decision required before launch** |

**D8 is no longer deferred.** The original trigger was "first listing fee, featured-placement fee, or advertising". A Wikipedia-style contribution ask is not a fee, but it does solicit money from a deployment whose plan is licensed for personal, non-commercial use. Two honest exits: move to Vercel Pro before launch, or launch without the contribution invitation and add it with the Pro migration. Guessing here means discovering it at invoicing time, which is exactly what this table exists to prevent.

## Open Questions

- [ ] Hamming threshold: `<= 8` is the proposed hard-block distance. Needs calibration against real Venezuelan listing photos before launch — too loose blocks honest publishers, too tight lets re-encoded scams through.
- [ ] Retention for `contact_reveal_event` beyond the 6-month go/pivot decision (personal-data exposure). Note that pruning the log also changes the view — there is no separate copy to fall back on.
- [ ] **Vercel Pro before launch, or contribution invitation deferred?** See tracked debt D8. Founder decision, blocking for the contribution capability.
- [ ] **Contribution payment rail.** Stripe does not operate in Venezuela and PayPal is restricted. Candidates: Binance Pay, Zelle, Pago Móvil, a USDT address. Founder decision; it changes nothing architecturally since the destination is a server-side constant, but the page cannot ship without it.
- [ ] **Contact-reveal rate limit threshold.** Must be loose enough that a genuine tenant comparing twenty listings is never blocked, tight enough that draining the catalog is impractical. Needs a number before implementation.
- [ ] **CSV bounds.** Maximum row count and file size. Should be sized against the largest real seed-broker portfolio, not guessed.
- [ ] **Optional CSV columns.** Whether `habitaciones`, `banos`, and `metros2` are accepted depends on whether those fields exist on `listing`; confirm against the schema when the publication module is written rather than inventing columns the model cannot store.
- [ ] **Draft lifetime.** An imported draft that never receives photos lives forever today. Decide whether drafts expire, and whether the broker is reminded — otherwise the table accumulates dead rows against the Neon free-tier ceiling.
