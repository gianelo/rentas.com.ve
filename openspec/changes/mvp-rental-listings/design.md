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
| `.github/workflows/ci.yml`, `lighthouserc.json`, `scripts/budget-bundle.ts` | Create | CI gates, Lighthouse budgets, build-output budget assertion |
| `design/reference/sistema/` | Create | Design system of record (D14) — `SISTEMA.md`, `tokens.css`, `pantallas-compacto-menta.html` |
| `src/styles/tokens.css` | Create | The shipped subset of the token sets (D16) — `compacto`, `menta`, one dark theme |
| `openspec/config.yaml` | Modify | **Follow-up F1** — not edited by this phase |

## Testing Strategy

| Layer | What | How | Command |
|---|---|---|---|
| Unit | Domain invariants, dHash + Hamming math, expiry/renewal date rules, auto-hide threshold, use cases against in-memory port fakes. **Added:** CSV parsing (delimiter sniffing, BOM, encoding rejection), column allowlist and mass-assignment rejection, per-row validation results, CSV output escaping, image-derivative dimensions and byte budgets, suggestion widening (zone → city → none), contribution destination resolution | Vitest, no I/O | `pnpm test:unit` |
| Integration | Composite-FK city isolation, `bit_count` similarity SQL, reminder idempotency under double-run, `job_run` recording, **unique-pair view** (after N repeat reveals of one pair the view returns exactly one row, with `first_revealed_at` = earliest `revealed_at` and `reveal_count = N`, while `contact_reveal_event` still holds all N rows). **Added:** import idempotency via the unique `(publisher_id, external_reference)` index, draft state excluded from search/reveal/expiry, reveal rate limit across requests, sitemap contents after expiry | Vitest + Dockerised Postgres matching Neon's major version | `pnpm test:integration` |
| E2E | Publish → search → gated reveal; anonymous cannot see WhatsApp; duplicate photo rejected across accounts but accepted for the same publisher. **Added:** enabled broker imports → preview → confirm → attach photos → activate → appears in search; disabled account refused server-side; expired listing page shows same-city suggestions with no contact leaked; invitation dismisses and never precedes a reveal | Playwright | `pnpm test:e2e` |
| Crawlability | Zone landing pages and search results contain listings **with JavaScript execution disabled**; expired pages carry `noindex` and are absent from the sitemap | Playwright with scripting off | `pnpm test:e2e` |
| Budget | Read-path first-load JS, page transfer weight, LCP on a throttled 3G profile | Build-output assertion + Lighthouse CI | `pnpm budget:bundle`, `pnpm budget:lighthouse` |

Ports as interfaces make the domain and application layers fully testable with zero infrastructure — this is what makes strict TDD viable for a part-time founder.

**Integration tests must use real Postgres, not an emulator**, because `bit_count` semantics and composite-FK enforcement are precisely what is under test. The same reasoning now extends to bulk import: its idempotency guarantee is a unique index, not application code, so a fake would verify the fake.

**Crawlability is tested with scripting disabled, not asserted by inspection.** D11 makes organic search the distribution channel, and "renders without JavaScript" is the kind of property that silently breaks the first time someone reaches for a client component. If it is not executed as a test, it is not a guarantee.

### Coverage policy

No global percentage target. A repository-wide number rewards testing whatever is cheapest to cover, which is rarely what carries risk.

Instead: a **90% floor on `src/modules/*/domain/` and `src/modules/*/application/`**, and **no target** on `infrastructure/` or `app/`. Those two pure layers hold every invariant, have zero dependencies, and cost almost nothing to cover — a gap there is a real gap. Infrastructure and delivery are covered by the integration and E2E layers instead, where a percentage would measure nothing useful.

## Continuous Integration

No pipeline exists today. These gates run on every pull request and block merge:

| Gate | Command | Needs |
|---|---|---|
| Lint + format | `pnpm biome ci` | — |
| Types | `pnpm tsc --noEmit` | — |
| Unit | `pnpm test:unit` | — |
| Coverage floor | `pnpm test:coverage` | domain + application ≥ 90% |
| Integration | `pnpm test:integration` | Postgres service container, Neon's major version |
| Build | `pnpm build` | — |
| Bundle budget | `pnpm budget:bundle` | build output |
| Token contract (D16) | `pnpm lint:tokens` | — |
| E2E + crawlability | `pnpm test:e2e` | preview deployment URL |
| Lighthouse budget | `pnpm budget:lighthouse` | preview deployment URL |

**A budget nobody measures automatically is a wish.** `budget:bundle` reads the build output and fails when read-path first-load JS exceeds 130 KB — fast, needs no deployment, and catches the most common regression (someone converts a server component to a client component). `budget:lighthouse` runs against the preview deployment and fails on LCP over 2.5 s on a throttled 3G profile, search transfer over 230 KB, or detail transfer over 500 KB. Image derivative budgets are already asserted at generation time in unit tests, so they need no separate gate.

**`build` is a gate because type-checking is not building.** This was learned the expensive way: a production deploy failed on `Module not found: Can't resolve '@/modules/...'` while every gate was green, because nothing in the gate set compiled the application. `tsc --noEmit` resolved the path alias through tsconfig `paths`; the bundler resolved it through a different mechanism and did not. Module resolution, bundler configuration, and server/client boundary violations are all invisible to the other gates and all fatal at deploy. The gate costs one build and no deployment.

**Toolchain constraint discovered at the same time: TypeScript stays on the 5.x line.** TypeScript 7 (the native port) was installed because it was newest, and Next.js 15.5 does not support it — it removed `baseUrl`, which is how Next derives bundler aliases from tsconfig `paths`, and it does not expose the JavaScript compiler API that Next's `next.config.ts` loader calls (`Cannot read properties of undefined (reading 'fileExists')`). This is D1's own reasoning applied to a version number: the scarcest resource is part-time hours, and a toolchain the framework does not support turns every bug into three nights. Re-check Next.js's supported TypeScript versions before raising this ceiling.

**`lint:tokens` is the enforcement half of D16.** It fails when a component stylesheet contains a colour literal, a corner radius, a thumbnail dimension, or a type size written as a value rather than a custom property. It costs no deployment and runs in milliseconds. Without it, D16 is a convention — and a convention that every future component must remember is precisely what this codebase's guiding principle rejects.

**CI minutes are a metered resource here.** The repository is private, so Actions minutes come out of a monthly quota rather than being free as they would be on a public repository. Accordingly: lint, types, unit, coverage, the token contract and integration run on every push; E2E, crawlability and both budget gates run **on pull requests only**, since they require a deployment and are the expensive half. This is the same free-tier discipline applied to Neon, R2 and Resend — see F2, which must now re-verify the Actions quota as well.

### D9 — Bulk import is a loader, not a second publication path

The CSV import parses, validates, and creates **drafts**, then hands every listing to the existing `listing-publication` use cases. It gets no repository write path of its own into `listing`.

The reason is the one that always applies here: *a rule the caller can forget is not a guarantee.* If import owned its own inserts, every publication invariant — publisher type, curated zone, USD-only price, min content — would have to be re-implemented and would silently drift the first time one of them changed. `publisher_type` in particular is derived from the importing account and is **unreadable from the file**; a broker who writes `owner` in a column must not become an owner, because that single claim is the product's core trust signal.

**Two phases, because the CSV cannot carry images.** Phase A creates drafts from the file. Phase B attaches photos through the presigned PUT to R2 already designed for the single-listing flow. This reuses the existing trust pipeline unchanged, and keeps image bytes off the serverless function entirely — Vercel caps a function request body at ~4.5 MB, which a real portfolio would blow past instantly. Server-side URL fetching was rejected: it buys nothing and adds an SSRF surface.

**Access is granted per account by the operator.** With 5–10 seed brokers, an operator-set `bulk_import_enabled` flag caps blast radius, removes any need for rate-limiting or anti-abuse machinery in v1, and doubles as the exact bargaining chip the broker alliance was promised.

### D10 — Contribution stays outside the system

Voluntary contribution is a dismissible invitation and an external link. No payment rail is integrated, no contributor state is stored, and no capability is gated. Processing payments in-app would add compliance, reconciliation, and financial-data handling — the precise capability the MVP excluded on purpose.

The destination is server configuration, never request input. A contribution page that accepts a destination parameter lets an attacker phish under our own domain, and this product's entire value proposition is *you do not get scammed here*.

### D11 — SEO is the distribution channel, not a polish task

After the influencer launch, organic search is the only channel this product has. Tenants type "alquiler apartamento chacao" into Google, and paid portals own those results today. SEO is therefore a first-class architectural concern, not something to retrofit.

**Public content, gated contact — these do not conflict.** The listing body (title, description, price, city, zone, photos) is public and indexable; only the WhatsApp number is gated behind registration, and it is already omitted server-side for anonymous requests. Google indexes everything that ranks without the contact ever leaking. This falls out of a decision already made, and it must not be undone by moving listing content behind the session gate.

**Curated zones are a keyword asset.** Because zones are a finite, operator-maintained list, the set of (city, zone) pairs is known ahead of time and each pair becomes a statically generated landing page. This is the highest-leverage SEO surface in the project: long-tail queries with commercial intent and near-zero competition from portals that do not structure their catalog this way.

**URLs carry the keywords and the city guarantee**: `/alquiler/<ciudad>/<zona>/<slug>-<id>`. Search filters live in query parameters so a filtered search is linkable and shareable — which matters more than usual here, because listings circulate by WhatsApp.

**Expiry is an SEO liability, and the fix is also a conversion win.** A 30-day lifecycle means indexed URLs die continuously. An expired listing MUST NOT 404. It returns **200 with `noindex`**, states plainly that the listing expired, and shows active listings from the same zone. Rationale: someone arriving from Google on an expired listing typed the exact zone and the exact intent — they are the highest-value visitor the site receives. Throwing a 404 at them discards a tenant who was ready to reveal a contact. Index hygiene is handled by dropping the URL from the sitemap immediately, which is the signal that actually governs crawl budget; `410` would clean the index marginally faster while destroying the visitor.

**Suggestions never cross city.** The same absolute city-isolation guarantee that governs search governs the suggestion block. Widen zone → city, never city → country.

**Thin and duplicate content is now a real risk.** Bulk import lets one broker create forty near-identical listings. Minimum description length is enforced at publication, and listings below a content threshold carry `noindex` so a thin portfolio cannot drag the whole domain down.

### D12 — Image derivatives generated at upload, not optimized on demand

`sharp` is already in the publication pipeline to produce the dHash source buffer. It also generates the display derivatives there, which are stored in R2 alongside the listing. The platform's on-demand image optimizer is **not** used.

Two reasons, and the second is a hard product ceiling:

**Egress.** R2 charges zero egress; the hosting platform's image optimization is a metered resource on the free tier. Serving derivatives from R2 stays free at any traffic level, and traffic is precisely what success looks like.

**Storage.** Originals are discarded after hashing and normalization. A phone photo is 3–8 MB; six per listing is roughly 30 MB, which against R2's 10 GB free tier caps the catalog at **~330 listings**. Storing only derivatives (a card thumbnail and a ~200 KB detail image per photo) puts the same tier at **~7,000 listings** — an order of magnitude more, for free. Nothing needs the original: the dHash is computed at upload and persisted as 64 bits, and no view renders above the detail size.

**The `compacto` structure (D14) shrinks the thumbnail derivative.** The row thumbnail is 44 × 34 CSS px on mobile and 64 × 48 on desktop, so one derivative at **128 × 96** covers both at 2× device pixel ratio. The earlier figure was sized for a 96 × 72 row (192 × 144 at 2×) — 2.25× the pixels. The consequence is that the search-results byte budget stops being tight and the storage ceiling moves further out. This is the clearest case of a visual choice paying for itself in the performance budget rather than costing against it, and it is the real return on `compacto` — see the density note in D14, which explains why the return does *not* show up as more listings per screen.

### D13 — Spartan density over visual identity

The reference point is a classifieds board, not a design showcase: information-dense, single column on mobile, system font stack, no carousel, no hero, no animation. Justified by the audience (mobile on metered, often expensive data), the product (people come for the catalog), and the team (one part-time founder).

**But deliberately not retro.** Craigslist looks like 1996 because it never changed, not because ugliness causes speed. This product is new, unknown, and operating in a market where users already fear being scammed — a site that looks abandoned confirms that fear. The target is spartan and current, not spartan and dated.

**The read path ships no JavaScript.** Browsing, searching, and filtering are server-rendered with URL parameters — no client-side filter layer. Client components are restricted to genuine interaction: photo upload, contact reveal, contribution dismissal, bulk import preview. This is what makes the classifieds feel and the mobile performance the same decision rather than two competing ones.

### D14 — Visual language, decided in HTML rather than a design tool

The visual reference is built as real HTML under `design/reference/`, versioned with the repository, not as mockups in a design tool. The reason is D12/D13: this product's binding design constraint is transfer weight, and a mockup cannot be weighed. Designing in a medium that cannot measure the budget is designing blind. Building the reference in HTML is also the honest test of the "no webfonts" decision, since it ships the same system stack the product does.

**The reference is not a specification.** Verifiable requirements live in the capability specs; the reference is the visual source of truth that the components in PR1b, PR2, PR3, and PR5 are built against. It exists so the type scale, spacing rhythm, and component inventory are settled *before* the first UI is written, rather than being invented three times and reconciled later.

**The surface inventory is settled: 22 screens** across five flows — discovery (8), publishing (5), publisher management (2), bulk import (4), and trust/contribution/email (3). This matters more than it sounds: the bulk-import preview with per-row errors is the most complex screen in the product, and the empty, rejected, and expired states are the ones that get improvised at midnight when nobody drew them.

**Durable constraints on any visual direction**, independent of palette:

- **Results are a dense list, not a card grid.** With a catalogue still being seeded, showing that options exist outweighs showing one photograph well, and the small row thumbnail is what keeps the search page inside its transfer budget: many small thumbnails fit, many detail images do not. **Density is enforced as a bound on the row (≤ 96px at 360px), not as a count of listings above the fold.** The count is a proxy: it shifts with the system font, the chrome height, and the length of a title, so a test asserting it fails for reasons that have nothing to do with the regression it was meant to catch. The bound holds the thing that actually matters.

  Worth recording, because it is counter-intuitive and will be re-litigated: **`compacto` buys bytes, not rows.** The row's height is driven by its text stack — price line, two-line title clamp, metadata — which is taller than either thumbnail size. Shrinking the thumbnail from 96 × 72 to 44 × 34 changes the row's height barely at all. It changes the transfer weight a great deal. Anyone who later wants materially more listings per screen has to cut a line of text, not a thumbnail, and that is a product decision about what a listing must say to be worth tapping — not a token change.
- **Price outranks the title.** It is what people scan in classifieds, and it earns its emphasis typographically rather than through colour.
- **`publisher_type` is distinguished by form, not colour alone** — filled versus outlined. It survives colour blindness and a cheap screen in daylight, and it is the product's central trust claim rather than a decorative tag.
- **Semantic colour is reserved for meaning** — error and expiry — and is never spent on decoration.
- Type is the system stack across eight named roles (list price, detail price, page title, listing title in detail, listing title in list, body, metadata, badge). Separation comes from borders and whitespace. Under `compacto` the price role resolves to the monospace member of the system stack with `tabular-nums`, so prices align as a column down the list — a scanning aid, not a stylistic flourish.
- Dark tokens are defined so a later dark mode is a swap rather than a rewrite; **v1 ships light only**.

**The breakpoint is 768px**, and it is stated here because nothing else stated it. `SISTEMA.md` names the two design widths (360 and 1280) and says there is "one relevant breakpoint" without giving a number; the reference HTML shows fixed artboards with no media queries at all, so it could not supply one either. 768 is the value the earlier `BRIEF-PANTALLAS.md` already specified and the conventional tablet threshold — below it the single-column mobile layout, at or above it the sidebar layout. A value that only exists inside an implementation is a value that gets changed by accident.

**Two viewports, and desktop is not the mobile layout stretched.** Discovery is designed mobile-first at 360px, but the product is not mobile-only, and one flow is desktop-first by nature: **nobody uploads a 40-row CSV from a phone**. At 1280px the surplus width goes to placing things alongside — filters as a persistent sidebar, listing detail as photos plus a sticky data column, import preview as a full table with every column visible and no horizontal scroll. It does not go to enlarging everything: the publish form stays a single ~600px column, because a wide form loses the relationship between label and field, and results stay a list rather than becoming a grid. Requirements stated at 360px are floors, not a declaration that desktop is out of scope.

**The palette and visual tone are RESOLVED: `menta` + `compacto`.** After a pine/teal direction and a graphite, accent-free direction were both built and rejected, the founder explored the space as two independent axes and selected the combination **structure `compacto` + theme `menta`**: deep blue `#272343` on a cool grey field `#F0F5F9`, white surfaces, 12px corner radius, pill badges, and a 44 × 34 row thumbnail on mobile.

The approved reference lives at `design/reference/sistema/`:

| File | Role |
|---|---|
| `SISTEMA.md` | The design system of record — tokens, button hierarchy, component anatomy, per-screen layout, content register |
| `tokens.css` | All 13 token sets (9 themes × 4 structures) as CSS custom properties |
| `pantallas-compacto-menta.html` | Six of the 22 surfaces rendered at 360px and 1280px in the chosen combination |

**Six screens are drawn; the other sixteen are derived, not improvised.** The reference covers search results, listing detail, publish step 1, zone landing, my listings, and bulk import preview — the load-bearing ones. The remaining surfaces (empty, rejected, expired, auth, contribution, email) are built from the same tokens, the same three-level button hierarchy, and the same row anatomy. What was adopted is the *system*; the six screens are its worked examples. A surface that needs a value the system does not define is a signal to extend the system, not to invent a local one.

The rejected graphite exploration was removed on 2026-08-17: it was kept "as a comparison point" and never once consulted, while the comparison that actually matters — implementation against the adopted system — is served by `design/reference/sistema/`. `design/reference/BRIEF.md` and `BRIEF-PANTALLAS.md` were the inputs that produced this system and are now **historical** — superseded by `SISTEMA.md` wherever they disagree, and they do disagree: both were written against the `estandar` structure (96 × 72 thumbnail, five listings above the fold). They stay for provenance: `design.md` cites the brief as the source of the 768px breakpoint, and a citation whose source has been deleted cannot be checked.

`design/README.md` maps every file in that folder to what it is and to its original Claude Design name. It exists because these files were moved and renamed out of the exported handoff structure, which later made the design system look absent from the repository when it was merely elsewhere.

### D15 — Accessibility baseline

Not previously specified anywhere. Three reasons it is cheap here and expensive to retrofit: semantic HTML is exactly what D11's crawlability requires, the no-JavaScript read path removes most of the usual failure modes for free, and the audience is on constrained devices and connections where these properties are not an edge case.

Baseline, enforced as testable requirements in the capability specs rather than as aspiration: text contrast meets WCAG AA, every form control has an associated label (never a placeholder standing in for one), interactive targets are at least 44px, keyboard focus is always visible, every listing photo carries alternative text, and page structure uses real headings and landmarks.

### D16 — Two-axis token contract: no component writes a literal visual value

The design system separates two independent axes, both declared on the `<html>` element:

- **`data-theme`** — colour roles, corner radius, control fill. Nine values; `menta` is shipped.
- **`data-layout`** — row density, thumbnail geometry, price scale, title typography. Four values; `compacto` is shipped.

**The rule, which is the whole point: no component writes a hex, a corner radius, a thumbnail dimension, or a type size as a literal.** Every one reads a CSS custom property. This is the same principle the rest of this design runs on — *guarantees live in the narrowest API*. A convention that every component author must remember to follow is not a guarantee; a value that only exists in one place cannot be contradicted in another.

**The acceptance criterion is falsifiable and takes ten seconds.** Change the two attributes in the browser inspector. The entire application must repaint, correctly, with no exceptions. Anything that does not change is a literal that leaked in. This is a CI-checkable property, not a code-review opinion: a lint rule rejecting hex literals and hard-coded px in component styles is added to the existing gate set.

**Why keep the axes at all when the combination is already chosen.** Three concrete reasons, none of them "in case we change our minds":

1. **Dark mode is already a committed direction.** D14 says dark tokens are defined so a later dark mode is a swap rather than a rewrite. `violeta` and `oscuro` are exactly that — complete dark token sets, already authored. Without the theme axis, D14's promise would have to be built from scratch later.
2. **Density is a plausible user preference.** `compacto` at ten rows per screen is right for scanning a catalogue and wrong for someone on a phone in bright sun; `estandar` is the same content at five rows. If that preference is ever offered, it is a stored attribute value, not a second stylesheet.
3. **The tokens already exist, fully written.** Adopting all thirteen sets costs a file copy. Discarding twelve of them and reconstructing one later costs a refactor.

**What actually ships, however, is three token sets — not thirteen.** D13 does not permit shipping CSS that no user renders. Production carries `compacto`, `menta`, and the one dark theme wired to `prefers-color-scheme`; the remaining ten stay in `design/reference/sistema/tokens.css` as the library. The inspector-flip criterion is then evaluated across the shipped sets, which is enough to prove no literal leaked — a value that correctly follows one theme swap follows all of them.

**Structure changes are not free and must be re-measured.** Only `compacto` and `estandar` meet the byte budget with margin. `editorial` shows four listings per screen, which reads as empty in a catalogue still being seeded. Any change to `data-layout` re-opens the above-the-fold count in D14 and the thumbnail derivative size in D12.

### Performance Budget

Hard numbers, verified on the preview deployment before each user-facing PR merges. A budget without a number is a wish.

| Surface | Budget |
|---|---|
| Search results page | ≤ 230 KB total transfer (was 150 — see the revision note below) |
| Listing detail page | ≤ 500 KB total transfer including photos |
| Row thumbnail (128 × 96 derivative, serves 44 × 34 mobile and 64 × 48 desktop at 2×) | ≤ 10 KB |
| Detail photo | ≤ 200 KB |
| JavaScript on the read path | ≤ 130 KB (was 30 — see the revision note below) |
| LCP on a throttled 3G profile | ≤ 2.5 s |

**Revision, 2026-08-16 — two of these numbers were unreachable and are now measured rather than assumed.**

Building the budget gates surfaced it immediately: **Next.js 15 App Router plus React 19 ship ~102 KB gzip of shared framework runtime on every route, before a single line of this application's code exists.** Verified against Next's own build output, not estimated. The original 30 KB was set by analogy and never checked against the framework floor — the same failure as the review forecast that omitted the cost of proof, and caught the same way: by building the thing that measures.

The knock-on was the page budget. 102 KB of JavaScript plus HTML, CSS and ten row thumbnails does not fit inside 150 KB, so that number was unreachable too.

Revised: **read-path JavaScript ≤ 130 KB** (the measured ~102 KB floor plus ~28 KB of headroom, preserving the original intent — roughly 30 KB is what *this codebase* may add on top) and **search results ≤ 230 KB** cold transfer.

**The weakness, recorded rather than buried.** Because 102 of those 130 KB are a constant nobody controls, the JavaScript gate carries far less signal than its number implies: 15 KB of genuinely bad client code still passes. The stricter design — budget the delta above the framework baseline, and separately assert the baseline has not grown — was considered and set aside in favour of the simpler absolute. If this gate ever fires and the cause turns out to be a framework version bump rather than application code, that is the signal to switch to measuring the delta.

Rejected outright: lowering the gate until it passed, which makes a check into decoration; and reconsidering the framework, which D1 chose deliberately on the argument that part-time hours are the scarce resource and an unfamiliar toolchain turns every bug into three nights. That argument still holds.

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

**F2** — confirm current free-tier limits (Vercel cron, Neon storage, R2, Resend daily cap, **GitHub Actions monthly minutes for private repositories**) at implementation time; provider tiers change.

**F2 — re-verified 2026-08-16 (PR0a), against each provider's live pricing/docs pages:**

| Provider | Limit | Confirmed value | Delta vs. this design |
|---|---|---|---|
| Vercel Hobby | Cron schedule | Once per day only; execution window ±59 min; 100 cron jobs/project | Matches D3's "best-effort timing, drift up to ~1 hour" — no delta |
| Vercel Hobby | Data transfer | 100 GB/mo Fast Data Transfer, up to 10 GB Fast Origin Transfer | Not previously stated numerically — recorded for reference, no delta |
| Neon Free | Storage | **0.5 GB per project** | **Delta.** This design never states a Neon storage number, but 0.5 GB is a materially tight ceiling for *all* relational data combined — not only `contact_reveal_event`. At realistic MVP row sizes this still comfortably covers thousands of listings/users/reveals, but it sharpens the existing open question on `contact_reveal_event` retention and unbounded draft rows (see Open Questions) into a near-term concern rather than a distant one |
| Neon Free | Compute | 100 CU-hours/project/month (≈400 hrs at 0.25 CU); 5-minute autosuspend, cannot be disabled on Free | New information — no prior claim to compare against |
| Neon Free | Egress | 5 GB/month | New information — no prior claim to compare against |
| Cloudflare R2 Free | Storage | 10 GB-month/month | Matches D2/D12's "10 GB" — no delta |
| Cloudflare R2 Free | Egress | Free for all storage classes, always | Matches D2/D12's "$0 egress" — no delta |
| Cloudflare R2 Free | Requests | 1M Class A ops/month, 10M Class B ops/month | New information — no prior claim to compare against |
| Resend Free | Send caps | 3,000 emails/month, 100 emails/day | Matches design table's "3k/mo, 100/day" — no delta |
| GitHub Actions (Free plan, private repo) | Minutes | 2,000 minutes/month (Linux-minute equivalent; Windows runners bill 2x, macOS 10x) | New confirmation of the number the CI push/PR-only split (design.md, Continuous Integration) was already designed against — validates that split as necessary, not merely cautious |

No provider tier is tighter than this design assumed, with the exception of Neon storage, which the design never quantified in the first place. The most actionable consequence: the existing open question "Retention for `contact_reveal_event`" and "Draft lifetime" should be revisited before the 0.5 GB ceiling, not the 10 GB R2 ceiling, becomes the operative constraint on how long the MVP can run unattended.

## Tracked Debt

| Debt | Trigger to repay | Cost | Decision |
|---|---|---|---|
| Vercel Hobby non-commercial licensing (D8) | **Fired**, and **resolved by deferral.** Soliciting voluntary contributions is money solicited from a Hobby deployment | ~$20/mo (Vercel Pro) | **Decided: the Pro migration happens last.** Launch on Hobby without the contribution invitation |

**D8 — decided.** The original trigger was "first listing fee, featured-placement fee, or advertising". A Wikipedia-style contribution ask is not a fee, but it does solicit money from a deployment whose plan is licensed for personal, non-commercial use. Of the two honest exits, the founder chose the second: **launch on Hobby without the contribution invitation, and migrate to Pro at the end.**

**The binding consequence: PR10 may be built, but its invitation MUST NOT be enabled in production before the Pro migration.** This is the one place where a completed, merged, passing work unit is still not allowed to be live. It therefore needs a switch rather than a memo — the invitation ships behind an environment flag that is off by default, so shipping the code and soliciting the money are two separate acts. A guarantee that depends on remembering not to deploy something is not a guarantee.

## Open Questions

- [ ] Hamming threshold: `<= 8` is the proposed hard-block distance. Needs calibration against real Venezuelan listing photos before launch — too loose blocks honest publishers, too tight lets re-encoded scams through.
- [ ] Retention for `contact_reveal_event` beyond the 6-month go/pivot decision (personal-data exposure). Note that pruning the log also changes the view — there is no separate copy to fall back on.
- [ ] **Vercel Pro before launch, or contribution invitation deferred?** See tracked debt D8. Founder decision, blocking for the contribution capability.
- [ ] **Contribution payment rail.** Stripe does not operate in Venezuela and PayPal is restricted. Candidates: Binance Pay, Zelle, Pago Móvil, a USDT address. Founder decision; it changes nothing architecturally since the destination is a server-side constant, but the page cannot ship without it.
- [ ] **Contact-reveal rate limit threshold.** Must be loose enough that a genuine tenant comparing twenty listings is never blocked, tight enough that draining the catalog is impractical. Needs a number before implementation.
- [ ] **CSV bounds.** Maximum row count and file size. Should be sized against the largest real seed-broker portfolio, not guessed.
- [ ] **Optional CSV columns.** Whether `habitaciones`, `banos`, and `metros2` are accepted depends on whether those fields exist on `listing`; confirm against the schema when the publication module is written rather than inventing columns the model cannot store.
- [ ] **Draft lifetime.** An imported draft that never receives photos lives forever today. Decide whether drafts expire, and whether the broker is reminded — otherwise the table accumulates dead rows against the Neon free-tier ceiling.
- [x] **Palette and visual tone (D14).** **RESOLVED: `compacto` + `menta`.** The design system of record is `design/reference/sistema/SISTEMA.md`, with tokens at `design/reference/sistema/tokens.css` and six worked surfaces at `design/reference/sistema/pantallas-compacto-menta.html`. PR1b is unblocked. See D16 for the token contract that carries the system to the sixteen surfaces the reference does not draw.
