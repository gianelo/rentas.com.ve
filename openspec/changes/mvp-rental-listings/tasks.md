# Tasks: MVP Rental Listings

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~5,600–8,250 total (greenfield, 8 capabilities) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR0a → PR0b → PR0c → PR1 → PR1b → PR2 → PR3 → PR4 → PR5 → PR6 → PR7 → PR8 → PR9 → PR10 → PR11 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Session preflight collected 2026-08-16: execution mode `auto`, artifact store `hybrid`, delivery `auto-chain`, chain `stacked-to-main`, review budget 400 lines.

**Note on the 400-line budget.** It measures *authored* lines — what a human has to read. The native attempt runtime counts generated content too, so a slice that adds dependencies will report a much larger number because of `pnpm-lock.yaml`. Lockfiles are trusted, not reviewed. Where the two disagree, the authored count governs the review decision and the discrepancy is recorded rather than papered over.

### The forecasts below were wrong, and here is why

**Measured on 2026-08-16, after three consecutive slices overran:** these estimates forecast *implementation* and silently omitted *proof*. In a strict-TDD project that is not a rounding error — it is roughly half the diff.

PR1b-b is the clean measurement. Of its 508 authored insertions, **203 were the proof itself** — a 78-line WCAG contrast helper and a 125-line design-contract spec — against ~180 lines of actual components. The remainder was tokens and task bookkeeping. Six of twelve tasks consumed the entire 400-line budget, and the four tasks needing a real layout engine had not been started.

Two consequences, both applied:

1. **The estimates below are revised upward** for every slice not yet built. The old numbers were not pessimistic enough to be useful, and a forecast that is always wrong in the same direction stops being a forecast and becomes a ritual.
2. **A slice whose proof is expensive gets split on the proof boundary, not the feature boundary.** PR1b-b/PR1b-c is the worked example: the tasks provable by computation or static declaration shipped together; the four needing a real browser measurement became their own slice, because building that harness is itself ~130–155 lines before it proves anything.

This is the honest alternative to a third size exception. Granting one more would have made the budget advisory; correcting the forecast keeps it real.

### Per-slice estimate

| Slice | Est. lines | Risk |
|---|---|---|
| PR0a Toolchain + test harness + gate scripts | 250–320 | Low (config) |
| PR0b Persistence + auth scaffold | 200–280 | Medium |
| PR0c Deploy + CI pipeline | 180–280 | Medium |
| PR1 Identity + phone-verification port | 300–450 | Low |
| PR1b-a Tokens, root attributes, token contract, layout primitives | ~~200–300~~ **actual 734** | Shipped, `size:exception` |
| PR1b-b Atoms, button hierarchy, publisher badge, contrast proof | ~~250–350~~ **actual 526** | Shipped at reduced scope |
| PR1b-c Layout-measurement harness + the four measured bounds | 250–350 | Medium — the harness is ~130–155 before it proves anything |
| PR2 City/zone schema + seed + UI | 400–600 | Low |
| PR3 Publication core | 1200–1800 | **High — must be split into 3–4 slices before apply** |
| PR4 Trust: photo-hash dedup | 600–900 | Medium — split into 2 |
| PR5 Search | 700–1000 | Medium — split into 2–3 |
| PR6 Contact reveal | 600–900 | Medium — split into 2 |
| PR7 Lifecycle: reminder job | 1400–2000 | **High — split into 3–4** |
| PR8 Trust: reporting/auto-hide | 500–800 | Low — split into 2 |
| PR9 Broker bulk import | 1300–1900 | **High — split into 3–4** |
| PR10 Voluntary contribution | 250–400 | Low |
| PR11 Discovery & SEO surfaces + budget gates | 1100–1600 | Medium — split into 3 |

Revised figures apply a **~2× multiplier for proof** to the original implementation-only estimates, which is what the three measured slices actually cost. The total moves from ~5,600–8,250 to roughly **9,000–13,000 authored lines**, and the number of slices roughly doubles. That is not scope growth — it is the same product, forecast honestly for the first time.

PR9 depends only on PR3 (publication) and PR4 (trust), not on PR5–PR8. It is placed last to keep the stack linear, but it can be pulled forward if seed brokers need to load portfolios while the rest is still being built. PR10 depends on nothing beyond the app shell and can ship at any point — but see the D8 licensing decision in the design before shipping it.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 0a | Toolchain, test harness, gate scripts, config.yaml F1, F2 re-verify | PR0a | `pnpm test` (empty pass) | `pnpm lint`, `pnpm lint:tokens`, `pnpm tsc --noEmit` all clean | Revert repo to pre-scaffold state |
| 0b | Drizzle config, Neon client, Auth.js v5 + Google + Drizzle adapter | PR0b | `pnpm test` | Migrations apply to a Neon branch | `drizzle/**`, `src/shared/db/**`, auth config |
| 0c | Vercel deploy, CI pipeline, Postgres service container, gate-failure proof | PR0c | `pnpm test` | CI green on a throwaway PR; every gate proven to fail when violated | `.github/**`, `vercel.json` |
| 1 | Google sign-in, session guard, disabled phone-verification port | PR1 | `pnpm test:unit -- identity` | Manual Google OAuth sign-in on deployed preview | `src/modules/identity/**`, `app/(auth)/**` |
| 1b | Design tokens (`compacto` + `menta`), atoms, three-level buttons, result row, a11y baseline, D16 token contract | PR1b | `pnpm test -- design-system` | Render at 360px and 1280px on preview; measure the result row against its 96px height bound; flip `data-theme` in the inspector; contrast and focus audit | `src/styles/tokens.css`, `components/atoms/**` |
| 2 | City/zone schema, seed, cascading select | PR2 | `pnpm test:integration -- zone` | Seed script run against Neon branch | `drizzle/*_zones.sql`, seed script |
| 3 | Listing CRUD, publisher_type, min-content, city-FK, upload guard | PR3 | `pnpm test -- publication` | Publish flow on preview deploy | `src/modules/listing-publication/**` |
| 4 | dHash + publisher-excluding match port wired into publish | PR4 | `pnpm test:integration -- photo-hash` | Publish two accounts, same photo | `src/modules/listing-trust/**` (hash only) |
| 5 | Search port with required cityId, filters, city isolation | PR5 | `pnpm test:integration -- search` | Search UI on preview deploy | `src/modules/listing-search/**` |
| 6 | Reveal event + unique-pair view | PR6 | `pnpm test:integration -- reveal` | Reveal action on preview deploy | `src/modules/contact-reveal/**`, view migration |
| 7 | Expiry, reminder job, renewal token, cron route | PR7 | `pnpm test -- lifecycle` | `curl -X POST` job route with/without Bearer token | `src/modules/listing-lifecycle/**`, `app/api/jobs/**` |
| 8 | Reporting, auto-hide, operator restore | PR8 | `pnpm test -- trust-reporting` | Report flow x3 accounts on preview | `src/modules/listing-trust/**` (reporting only) |
| 9 | Operator-gated CSV import, whole-file validation, preview, drafts, idempotency | PR9 | `pnpm test -- bulk-import` | Import a real broker portfolio on preview deploy | `src/modules/broker-bulk-import/**`, draft-state migration |
| 10 | Dismissible contribution invitation + external destination page | PR10 | `pnpm test -- contribution` | Invitation renders and dismisses on preview | `src/modules/voluntary-contribution/**` |
| 11 | Zone landing pages, URL scheme, expired-listing retention page, sitemap, structured data | PR11 | `pnpm test -- discovery` | Crawl preview with JS disabled; budget check on preview | `app/(discovery)/**`, sitemap/robots routes |

## Phase 0: Bootstrap & Toolchain (PR0a → PR0b → PR0c)

**Split, per the 400-line review budget.** PR0 was forecast at 650–900 lines, so it ships as three stacked slices. The seam is not arbitrary — each slice is independently revertible and each ends with something that demonstrably runs:

| Slice | Tasks | Ends when |
|---|---|---|
| **PR0a** Toolchain & gate scripts | 0.1–0.4, 0.8b, 0.10 | `pnpm test`, `pnpm lint`, `pnpm lint:tokens`, `pnpm tsc --noEmit` all run and pass on an empty project |
| **PR0b** Persistence & auth scaffold | 0.5, 0.6 | Drizzle migrations apply to a Neon branch; the Auth.js tables exist |
| **PR0c** Deploy & CI pipeline | 0.7, 0.8, 0.9, 0.11 | A throwaway PR turns CI green, and every gate is proven to fail the build when violated |

PR0c is deliberately last: a pipeline that runs nothing is not worth reviewing, and the gates can only be proven to *fail* correctly once there is something for them to fail against.

**Note on the pnpm version ceiling (added during PR0c, after the founder's first Vercel deploy failed).** `package.json`'s `packageManager`/`devEngines` and `.github/workflows/ci.yml`'s `PNPM_VERSION` are pinned to **pnpm 10.x**, not the newer 11.x line used earlier in Phase 0. Vercel's build image does not recognize `packageManager: pnpm@11` — it falls back to npm, which then rejects the repo's `devEngines.packageManager` block outright (`EBADDEVENGINES`). The fix is a downgrade, not a Vercel environment variable (`ENABLE_EXPERIMENTAL_COREPACK` was considered and rejected — it would put an experimental flag on the critical path of every deploy). Whoever next bumps pnpm should re-check Vercel's supported package-manager versions before raising this ceiling past 10.x.

- [x] 0.1 `pnpm init`, add Next.js 15 + React 19, TS, `tsconfig.json`
- [x] 0.2 Configure Biome (`biome.json`), Vitest (`vitest.config.ts`), Playwright (`playwright.config.ts`)
- [x] 0.3 Apply follow-up F1: update `openspec/config.yaml` `testing:`/`context:`/`rules` blocks per design
- [x] 0.4 Follow-up F2: re-verify current Vercel/Neon/R2/Resend free-tier limits; record deltas vs design doc
- [x] 0.5 Drizzle config + `src/shared/db/client.ts` (Neon pooled endpoint)
- [x] 0.6 Auth.js v5 + Google provider + Drizzle adapter (`user`, `account`, `session` tables)
- [ ] 0.7 Deploy skeleton to Vercel; confirm live Neon connection
- [x] 0.8 `.github/workflows/ci.yml`: lint, types, unit, coverage, `lint:tokens` and integration on every push; E2E, crawlability and both budget gates on pull requests only (Actions minutes are metered on a private repository)
- [x] 0.8b `pnpm lint:tokens` — fails on a colour literal, corner radius, thumbnail dimension or type size written as a value instead of a custom property in component styles (D16). Passes trivially until PR1b lands components; it exists from PR0 so no component is ever written without it
- [x] 0.9 Postgres service container in CI pinned to Neon's major version — the integration layer must not run against an emulator (pinned to `postgres:18`; the live Neon instance was verified at `server_version 18.4` on 2026-08-16, and the job asserts the container's version at runtime rather than trusting the image tag)
- [x] 0.10 Coverage gate: 90% floor on `src/modules/*/domain/` and `src/modules/*/application/`; no target on `infrastructure/` or `app/`
- [x] 0.11 Confirm every gate fails the build when violated — a gate that only warns is not a gate

**Gate-failure evidence (0.11), measured 2026-08-16.** Each gate was given a deliberate violation, the exit status recorded, the violation reverted, and the clean tree re-checked. A gate is only proven by the failing case; the passing case proves nothing on its own.

| Gate | Deliberate violation | Violated | Clean |
|---|---|---|---|
| `biome ci .` | badly formatted source file | exit 1 | exit 0 |
| `tsc --noEmit` | `const n: number = "not a number"` | exit 1 | exit 0 |
| `vitest run` | a test asserting `expect(1).toBe(2)` | exit 1 | exit 0 |
| `lint:tokens` | `.x { color: #272343; }` in `components/` | exit 1 | exit 0 |
| coverage floor | an uncovered file under `src/modules/*/domain/` | exit 1 | exit 0 |

The coverage failure names the scoped glob explicitly — `Coverage for lines (0%) does not meet "src/modules/*/domain/**" threshold (90%)` — which confirms the floor is the scoped policy from the design and not a repo-wide percentage in disguise.

**Two gates cannot be proven yet, and the workflow says so out loud.** E2E/crawlability has no specs and no preview URL; both budget gates have no script to run. Rather than letting an empty run look green, each emits a GitHub warning stating that it currently cannot fail and must not be read as a passing check. They are re-proven when PR11 lands their implementations.

## Phase 1: Identity + Phone Verification Port (PR1)

- [x] 1.1 RED: unauthenticated protected action redirects to sign-in
- [x] 1.2 GREEN: session-guard helper, `src/modules/identity/application/`
- [x] 1.3 RED: Google sign-in creates one account with only email + display name (implemented in PR0b — `toMinimalGoogleProfile` + `google-profile.test.ts`; verified against this spec scenario during PR1, no change needed)
- [x] 1.4 GREEN: Auth.js callback restricts captured profile fields (implemented in PR0b — wired as the Google provider's `profile()` callback in `auth.ts`; verified during PR1, no change needed)
- [x] 1.5 RED: expired session forces re-auth on protected action
- [x] 1.6 GREEN: expiry handling; sign-in UI at `app/(auth)/signin`
- [x] 1.7 RED: publish succeeds regardless of phone-verification status
- [x] 1.8 GREEN: `PhoneVerificationPort` contract + `DisabledPhoneVerificationAdapter` (`PHONE_VERIFICATION_ENABLED=false`, no domain branch)

## Phase 1b: Design Foundation (PR1b-a → PR1b-b)

Inserted between PR1 and PR2 because PR2 builds the first UI (the cascading city/zone select) and cannot be written before the visual language is settled. Carries D14, D15, and D16.

**Split, per the 400-line review budget.** Forecast at 400–600 lines across 18 tasks, so it ships as two stacked slices:

| Slice | Tasks | Ends when |
|---|---|---|
| **PR1b-a** The system and its guard | 1b.1–1b.4, 1b.13, 1b.17 | Tokens ship, the root carries `data-theme`/`data-layout`, `lint:tokens` rejects literals in real component styles, and a theme swap repaints everything |
| **PR1b-b** Provable atoms | 1b.6, 1b.7, 1b.9, 1b.15, 1b.16, 1b.18 | Button hierarchy, publisher badge, price typography, contrast, and focus visibility — every claim proved by real computation or a static declaration assertion, no fabricated layout proof |
| **PR1b-c** Result row, real layout (not yet started) | 1b.5 (remaining atoms), 1b.8, 1b.10–1b.12, 1b.14 | The result row is composed into a real route and measured with an actual Playwright layout engine at 360px/1280px — the four claims a stylesheet-content assertion cannot honestly prove |

The order is not cosmetic. **The token contract has to land before the first component**, or components get written against literal values and the guard arrives to a codebase it must retroactively clean. A rule that arrives after the code it governs is a migration, not a guarantee.

**PR1b-a shipped at 734 authored lines against the 400 budget — `size:exception`, accepted by the founder on 2026-08-16.** The overage is recorded rather than absorbed silently. Its shape: `scripts/lint-tokens.mjs` 230 lines (real logic — the D16 guard, and where review effort actually belongs), `src/styles/tokens.css` 140 lines (transcription of three token sets from the design reference), five layout primitives ~290 lines across 15 near-identical small files, and ~90 lines of config and docs. The argument accepted was that review burden here is not proportional to line count. **This was the second consecutive exception** (PR0a was the first, 10 lines over on a generated lockfile). A third would mean the budget has become advisory, and the honest response then is to lower the forecast or split earlier — not to keep granting exceptions.

**PR1b-b split itself further, before a third exception could happen.** The original 12-task PR1b-b scope was re-forecast at apply time and found to not fit 400 authored lines even for its cheapest half: the six tasks provable by pure computation or a static-declaration assertion (button hierarchy, badge, price typography, contrast, focus, webfont/JS) alone cost ~490 authored lines (`components/atoms/*`, `components/contrast.ts` — a from-scratch WCAG luminance/contrast implementation kept dependency-free — and one consolidated `components/design-contract.test.tsx`). Rather than take a third exception, or bolt the real Playwright layout-measurement harness for 1b.10–1b.12/1b.14 onto an already-full diff, the remainder ships as **PR1b-c**, not yet started. Estimated cost of that harness alone (a `/measure` route serving real production CSS + a dedicated `playwright.measure.config.ts` + a multi-check spec) is ~130–155 lines before any 1b.5 atoms are added — its own budget, not a top-up on this one. `components/molecules/ResultRow.tsx` is built here structurally (grid, price/badge/title/metadata, correct DOM order — unit-tested) but its three measured claims (1b.10, 1b.11, 1b.12) are explicitly **not proven** and stay unchecked; a CSS-content assertion for `96px` would prove the stylesheet was written, not that the row renders within the bound, which is the entire point of those tasks.

**Source of truth:** `design/reference/sistema/SISTEMA.md` (system), `design/reference/sistema/tokens.css` (token sets), `design/reference/sistema/pantallas-compacto-menta.html` (six worked surfaces at 360px and 1280px). Combination: `data-theme="menta"` + `data-layout="compacto"`. The reference HTML is a prototype, not production code — its inline styles and `support.js` runtime are never ported.

- [x] 1b.1 Port the shipped token subset to `src/styles/tokens.css` — `[data-layout="compacto"]`, `[data-theme="menta"]`, plus one dark set behind `prefers-color-scheme` (D16). The remaining ten sets stay in the reference only
- [x] 1b.2 Set `data-theme` / `data-layout` on the root element in the app shell; no component reads either attribute directly
- [x] 1b.3 RED: **no component style contains a hex literal, a raw corner radius, a thumbnail dimension, or a literal type size** — every one resolves through a custom property (D16). Wire it as a lint rule, not a review habit
- [x] 1b.4 RED: swapping `data-theme` on the root element repaints every rendered atom and molecule, with no element retaining its previous colour (the inspector-flip criterion, automated)
- [ ] 1b.5 Atoms per atomic design, from the system's component anatomy: price, title, metadata, badge, thumbnail, chip, button, input, label, breadcrumb. **Partial**: `Price` and `PublisherBadge` shipped as standalone atoms (PR1b-b); title/metadata/thumbnail built as internal parts of `ResultRow` to control review size (no second consumer yet — promote if one appears); chip/input/label/breadcrumb deferred to PR1b-c/PR3, no task in this slice needs them
- [x] 1b.6 GREEN: the three-level button hierarchy as distinct components — action (filled `--accent`), selection/state (`--tint` fill, `--accent` border and text), neutral (`--strong` border, no fill). They are not variants of one component with a free-form prop, because the levels must not be mixed. `components/atoms/buttons.tsx` + `Button.module.css`; proved by CSS-declaration assertion + a structural check that `Props` carries no `variant` field
- [x] 1b.7 RED: the `publisher_type` badge is distinguishable with colour removed — owner is filled (`--ink` on `--surface`), broker is outlined (`--strong` border, `--soft` text). Asserted against a greyscale render, not by reading the CSS. Proved two ways: structural (fill vs border, survives greyscale by construction) and computed (real WCAG relative-luminance/contrast on the shipped tokens, both themes) — `components/design-contract.test.tsx`, `components/contrast.ts`
- [ ] 1b.8 Molecule: the result row — grid `[thumbnail] 1fr`; price and publisher badge share the first line via `space-between`; title clamped to two lines below; metadata (`zona · N hab · N m²`) below that. Price precedes title in DOM order. **Built** (`components/molecules/ResultRow.tsx`, DOM-order unit test passing) but left unchecked — the row's real measured behaviour (1b.10–1b.12) is not yet proven, and this task's own acceptance criteria (SISTEMA.md "Fila de resultado") are about rendered layout, not just structure
- [x] 1b.9 RED: the price renders in the monospace system stack with `tabular-nums`, so prices align as a column across rows. Static-declaration assertion on `Price.module.css` (`font-family: var(--disp)`, `font-variant-numeric: tabular-nums`) — the claim IS about the declaration, so this is honest proof, not a proxy
- [ ] 1b.10 RED: a result row's rendered height stays within 96px at 360px, including a title long enough to wrap to its two-line clamp. Density is enforced as a bound on the row, not as a count of rows above the fold — a count is a proxy that breaks on a font-metric difference and tells you nothing about what regressed. **Not proven.** Needs a real layout engine (Playwright), not built this slice — see PR1b-c
- [ ] 1b.11 RED: the result row renders with no horizontal overflow at a 360px viewport. **Not proven** — same reason as 1b.10
- [ ] 1b.12 RED: at 1280px, result rows and running text stay within the 1100px container rather than spanning the window; body copy is capped at a 520px reading width. **Not proven** — same reason as 1b.10
- [x] 1b.13 GREEN: two-viewport layout primitives — 1100px container, 240px sticky filter sidebar (`grid: 240px 1fr`, gap 32), 600px single-column form shell, and the detail split (640px media + 420px sticky data column)
- [ ] 1b.14 RED: every interactive target is at least 44px in its smallest dimension on mobile and 36px on desktop. `--target-min`/`--target-min-desktop` tokens added and wired into `Button.module.css` (extends the token set — SISTEMA.md's own numbers, previously undeclared), but the *rendered* geometry is **not proven** — needs the same Playwright harness as 1b.10–1b.12
- [x] 1b.15 RED: text contrast meets WCAG AA across every token pair in use, in both the shipped light and dark sets. Real computation (`components/contrast.ts`) over the shipped hex values for four pairs actually used by this slice's components, both `menta` and `oscuro` — `components/design-contract.test.tsx`
- [x] 1b.16 RED: keyboard focus is visibly indicated on every interactive atom. Static-declaration assertion — every button level's `:focus-visible` rule has a non-`none`, non-zero `outline` resolving through a token
- [x] 1b.17 GREEN: base layout, landmarks, and heading structure
- [x] 1b.18 Confirm the shipped read-path CSS carries no webfont request and no runtime JavaScript. Static scan: `tokens.css` has no `@font-face`/`url()`; no shipped atom/molecule declares `"use client"`

## Phase 2: City & Zone Data (PR2)

- [ ] 2.1 Schema: `city`, `zone` tables; `zone` `UNIQUE(id, city_id)` (D5)
- [ ] 2.2 RED: integration test — cross-city zone reference violates uniqueness
- [ ] 2.3 Seed script `src/shared/db/seed.ts` with founder-supplied Distrito Capital + Maracaibo zone lists
- [ ] 2.4 RED: zone selector offers only the selected city's zones
- [ ] 2.5 GREEN: cascading city→zone select component (`components/`)

## Phase 3: Listing Publication Core (PR3)

- [ ] 3.1 Schema: `listing` table, `publisher_type` NOT NULL no default, composite FK `(zone_id, city_id) → zone(id, city_id)` (D5)
- [ ] 3.2 RED: integration test — cross-city listing insert fails FK constraint
- [ ] 3.3 RED: unit test — publish rejected without `publisher_type`, no default applied
- [ ] 3.4 RED: unit test — publish rejected without photo / missing min content (title, description, price, city, zone)
- [ ] 3.5 GREEN: `PublishListingUseCase` validation (publisher_type, USD price, city/zone, min content)
- [ ] 3.6 RED: non-image / oversized upload rejected (MIME + magic-byte + size)
- [ ] 3.7 GREEN: `sharp`-based upload guard before persistence; R2 presigned PUT adapter
- [ ] 3.8 Schema: `listing_photo` table
- [ ] 3.9 Publish form UI + listing detail/card rendering `publisher_type` visibly
- [ ] 3.10 RED: after upload, only derivatives are persisted — the original file is not retained (D12)
- [ ] 3.11 GREEN: `sharp` emits a row thumbnail at 128 × 96 (≤ 10 KB — covers the 44 × 34 mobile and 64 × 48 desktop row at 2× under `compacto`, D12/D14) and a detail image (≤ 200 KB) at upload; both stored in R2; platform on-demand image optimization is not used
- [ ] 3.12 RED: derivative dimensions and byte budgets hold for a portrait, a landscape, and an oversized source photo

## Phase 4: Trust — Photo-Hash Dedup (PR4)

- [ ] 4.1 Schema: `listing_photo_hash` (`bit(64)`)
- [ ] 4.2 RED: unit test — cross-publisher perceptually-matching photo rejects listing
- [ ] 4.3 RED: unit test — same-publisher match (active/expired/other listing) is allowed
- [ ] 4.4 GREEN: `sharp` 9×8 grayscale dHash(64) in `PublishListingUseCase`
- [ ] 4.5 GREEN: `PhotoHashPort` exposing only `findMatchesFromOtherPublishers(hash, excludePublisherId, maxDistance)` — no all-matches method (D4)
- [ ] 4.6 GREEN: Drizzle/raw-SQL adapter using `bit_count` Hamming distance
- [ ] 4.7 E2E: publish → duplicate photo rejected cross-account, accepted same publisher

## Phase 5: Listing Search (PR5)

- [ ] 5.1 RED: `ListingSearchPort.search(criteria)` — missing/nullable `cityId` rejected (D5)
- [ ] 5.2 GREEN: search port signature with required non-nullable `cityId`
- [ ] 5.3 RED: integration — Maracaibo search excludes Distrito Capital listings (no-filter, wide-price-range, colliding-zone-name scenarios)
- [ ] 5.4 GREEN: Drizzle search query — city/zone/price/characteristics filters
- [ ] 5.5 RED: expired and auto-hidden listings excluded from search
- [ ] 5.6 GREEN: active-only status filter
- [ ] 5.7 Search results UI showing `publisher_type` per result

## Phase 6: Contact Reveal (PR6)

- [ ] 6.1 Migration: `contact_reveal_event` table + `contact_reveal_unique_pair` VIEW (raw SQL, D6)
- [ ] 6.2 Hand-declare TS result type for the view query (flag as drift risk in code comment)
- [ ] 6.3 RED: anonymous visitor sees hidden/locked placeholder, no contact value
- [ ] 6.4 RED: reveal creates exactly one event; repeat reveal by same tenant creates a second, non-deduplicated event
- [ ] 6.5 GREEN: `RevealContactUseCase` — single insert, session-gated
- [ ] 6.6 RED: integration — after N repeat reveals of one pair, unique-pair view returns 1 row, `reveal_count=N`, `first_revealed_at`=earliest; raw event table still holds N rows
- [ ] 6.7 GREEN: view query wrapper
- [ ] 6.8 Reveal UI: locked placeholder, reveal button, sign-in redirect
- [ ] 6.9 RED: an account exceeding the reveal window is throttled and further reveals stop — the catalog must not be drainable by one registered account
- [ ] 6.10 GREEN: per-account reveal rate limit (threshold from the design's open question; loose enough for a genuine tenant comparing listings)

## Phase 7: Lifecycle — Expiry & Reminder Job (PR7)

- [ ] 7.1 Schema: `listing.status`/`expires_at`; `listing_reminder` UNIQUE `(listing_id, expires_at)`; `job_run`
- [ ] 7.2 RED: listing expires 30 days after publish/last renewal, whichever later
- [ ] 7.3 GREEN: expiry calculation in domain
- [ ] 7.4 RED: unauthenticated `POST /api/jobs/expiry-reminders` returns 401, `reminders_sent=0`
- [ ] 7.5 GREEN: constant-time Bearer `CRON_SECRET` check on job route
- [ ] 7.6 RED: double-run of reminder job does not double-send (unique constraint)
- [ ] 7.7 GREEN: `SendExpiryRemindersUseCase` — batched 5-day-window select, insert `listing_reminder`, send email, record `job_run` (counts + failures)
- [ ] 7.8 RED: replayed renewal token rejected; GET on renewal link never mutates `expires_at`
- [ ] 7.9 GREEN: HMAC-signed, listing-scoped, single-use, expiring token; GET renders confirmation, POST renews +30 days and burns token
- [ ] 7.10 RED: expired listing retained (not deleted), excluded from search, still renewable
- [ ] 7.11 Resend/React Email renewal template; `vercel.json` cron schedule
- [ ] 7.12 E2E: reminder job → renewal link → renew flow

## Phase 8: Trust — Reporting & Auto-Hide (PR8)

- [ ] 8.1 Schema: `listing_report`, `moderation_action`
- [ ] 8.2 RED: unauthenticated visitor cannot report
- [ ] 8.3 RED: 3rd distinct authenticated account triggers auto-hide; repeat report from same account does not
- [ ] 8.4 GREEN: `ReportListingUseCase` — distinct-account counting, `status → hidden_by_reports` at 3
- [ ] 8.5 RED: operator restore returns listing to `active`
- [ ] 8.6 GREEN: `RestoreListingUseCase` + `moderation_action` record; minimal operator-only restore route

## Phase 9: Broker Bulk Import (PR9)

Depends on PR3 (publication use cases) and PR4 (trust pipeline). Creates no write path of its own into `listing`.

- [ ] 9.1 Schema: `user.bulk_import_enabled` (bool, default false); `listing.external_reference` (nullable); UNIQUE `(publisher_id, external_reference)`; `listing.status` gains `draft`; `bulk_import_batch` table
- [ ] 9.2 RED: account with `bulk_import_enabled = false` POSTing the import endpoint directly returns 403 and creates no draft
- [ ] 9.3 GREEN: server-side flag guard on every import endpoint — UI visibility is not the control
- [ ] 9.4 RED: file whose header omits a required column is rejected whole, naming the column, with no draft created
- [ ] 9.5 RED: semicolon-delimited file carrying a UTF-8 BOM parses into correct columns, not one column
- [ ] 9.6 RED: non-UTF-8 file rejected with a message telling the broker to re-export as CSV UTF-8
- [ ] 9.7 GREEN: CSV parser — delimiter sniffing (`,` / `;`), BOM strip, UTF-8 enforcement, streaming read
- [ ] 9.8 RED: file exceeding the row or size limit is refused before its contents are parsed
- [ ] 9.9 GREEN: size and row bounds enforced pre-parse
- [ ] 9.10 RED: extra columns (`publisher_type`, `status`, `expires_at`, `user_id`) are ignored; resulting drafts take publisher type from the account
- [ ] 9.11 GREEN: strict column allowlist — unrecognised columns dropped, never mapped
- [ ] 9.12 RED: a row whose `zone` is not curated for its `city` is rejected by the same rule the single-listing flow applies
- [ ] 9.13 RED: 38 valid + 2 invalid rows → preview reports both sets with row numbers and reasons; confirming creates exactly 38 drafts
- [ ] 9.14 RED: previewing without confirming creates nothing
- [ ] 9.15 GREEN: `ValidateImportUseCase` (whole file, zero writes) + `ConfirmImportUseCase` delegating to `PublishListingUseCase` validation
- [ ] 9.16 RED: re-uploading an identical file creates no duplicates; a duplicate `referencia_externa` within one file rejects both rows
- [ ] 9.17 GREEN: idempotency enforced by the unique `(publisher_id, external_reference)` index, not by an application check
- [ ] 9.18 RED: a draft is excluded from search, has no revealable contact, and has no expiry clock; its 30 days start at activation
- [ ] 9.19 GREEN: draft status handling across search, reveal, and lifecycle
- [ ] 9.20 RED: broker B cannot attach a photo to broker A's draft
- [ ] 9.21 GREEN: draft-ownership authorisation on photo attachment
- [ ] 9.22 RED: presigned PUT rejects a client-supplied key and an oversized body
- [ ] 9.23 GREEN: server-derived key with per-account prefix, short TTL, `content-length-range`, fixed content-type
- [ ] 9.24 RED: a stored value beginning with `=` exports inert in a generated CSV
- [ ] 9.25 GREEN: CSV writer neutralising leading `=`, `+`, `-`, `@`; template generator sharing the parser's column definition so the two cannot drift
- [ ] 9.26 Import UI: upload, preview with per-row errors, confirm, draft list with photo attachment
- [ ] 9.27 E2E: enabled broker imports → attaches photos → drafts activate → appear in city-scoped search

## Phase 10: Voluntary Contribution (PR10)

**D8 is decided: the Vercel Pro migration happens last, and the product launches on Hobby without the contribution invitation.** This phase may therefore be built and merged, but the invitation must not be live before that migration. It ships behind `CONTRIBUTION_INVITATION_ENABLED`, default off — a switch, not a memo, because "remember not to deploy this" is not a guarantee.

- [ ] 10.0 GREEN: `CONTRIBUTION_INVITATION_ENABLED` flag, default off; the invitation renders nowhere when it is unset
- [ ] 10.0b RED: with the flag unset, no contribution invitation appears on any surface, and no contribution route is reachable
- [ ] 10.1 RED: a crafted destination parameter is ignored; only the configured destination is served
- [ ] 10.2 GREEN: destination resolved from server configuration only — never from query, path, or body
- [ ] 10.3 RED: contact reveal completes with no contribution prompt appearing in between
- [ ] 10.4 RED: dismissing the invitation keeps it hidden for the rest of the session
- [ ] 10.5 GREEN: dismissible, non-modal invitation component
- [ ] 10.6 RED: no capability is gated on contribution, and no contributor state is stored against a user
- [ ] 10.7 GREEN: contribution page — payment method and destination shown on-page, external link or code, no payment fields
- [ ] 10.8 Confirm go/pivot reporting still returns unique tenant-listing reveal pairs, unchanged by contribution data

## Phase 11: Discovery & SEO Surfaces (PR11)

Depends on PR5 (search) and PR7 (lifecycle). Carries D11 and the performance budget.

- [ ] 11.1 GREEN: URL scheme `/alquiler/<ciudad>/<zona>/<slug>-<id>`; filters as query parameters
- [ ] 11.2 RED: a copied filtered-search URL reopens with the same filter selection applied
- [ ] 11.3 RED: search results are present in the served response with scripting disabled
- [ ] 11.4 GREEN: server-rendered search — no client-side filter or pagination layer
- [ ] 11.5 RED: a zone landing page's response body contains that zone's active listings without JavaScript execution
- [ ] 11.6 RED: a `Maracaibo` zone landing page contains zero `Distrito Capital` listings
- [ ] 11.7 GREEN: statically generated landing page per curated (city, zone) pair
- [ ] 11.8 RED: an expired listing URL returns a successful response stating expiry, with same-zone active listings shown
- [ ] 11.9 RED: the expired listing page carries `noindex` and its URL is absent from the sitemap
- [ ] 11.10 RED: a zone with no active listings widens to the same city only; a city with none shows no suggestions at all
- [ ] 11.11 RED: an anonymous visitor sees no WhatsApp value on any suggested listing
- [ ] 11.12 GREEN: `SuggestActiveListingsUseCase` — zone first, then city, never beyond the city
- [ ] 11.13 GREEN: dynamic sitemap over active listings and zone pages; `robots` route; expired URLs dropped on expiry
- [ ] 11.14 GREEN: schema.org structured data on the listing detail page
- [ ] 11.15 RED: a listing below the minimum content threshold carries `noindex` (thin-content guard for bulk-imported portfolios)
- [ ] 11.16 RED: a zone landing page and the search results contain listings with JavaScript execution disabled (Playwright, scripting off)
- [ ] 11.17 GREEN: `scripts/budget-bundle.ts` reads the build output and exits non-zero when read-path first-load JS exceeds 30 KB
- [ ] 11.18 RED: converting a read-path server component to a client component fails `pnpm budget:bundle`
- [ ] 11.19 GREEN: `lighthouserc.json` asserting LCP ≤ 2.5 s on a throttled 3G profile, search transfer ≤ 150 KB, detail transfer ≤ 500 KB
- [ ] 11.20 Wire `budget:bundle` and `budget:lighthouse` into the pull-request workflow as merge-blocking gates

## Phase 12: Cleanup

- [ ] 12.1 README: setup, env vars, deploy steps
- [ ] 12.2 Confirm `pnpm test`, `test:unit`, `test:integration`, `test:e2e` all pass end to end
