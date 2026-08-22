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
| PR2 City/zone schema + seed + D5 proof | ~~400–600~~ **actual 258** | Shipped — split before a size:exception (see Phase 2) |
| PR2b Cascading city→zone select | ~~185~~ **actual 198** | Shipped 2026-08-16, within forecast — no exception |
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
| **PR1b-c** Result row, real layout | 1b.8, 1b.10–1b.12, 1b.14 | **Shipped 2026-08-16, 260 authored lines.** The result row is composed into a real route (`app/measure`) and measured with an actual Playwright layout engine at 360px/1280px — the four claims a stylesheet-content assertion cannot honestly prove. `1b.5`'s remaining atoms (chip, input, label, breadcrumb) stayed deferred — no task in this slice exercised them |

The order is not cosmetic. **The token contract has to land before the first component**, or components get written against literal values and the guard arrives to a codebase it must retroactively clean. A rule that arrives after the code it governs is a migration, not a guarantee.

**PR1b-a shipped at 734 authored lines against the 400 budget — `size:exception`, accepted by the founder on 2026-08-16.** The overage is recorded rather than absorbed silently. Its shape: `scripts/lint-tokens.mjs` 230 lines (real logic — the D16 guard, and where review effort actually belongs), `src/styles/tokens.css` 140 lines (transcription of three token sets from the design reference), five layout primitives ~290 lines across 15 near-identical small files, and ~90 lines of config and docs. The argument accepted was that review burden here is not proportional to line count. **This was the second consecutive exception** (PR0a was the first, 10 lines over on a generated lockfile). A third would mean the budget has become advisory, and the honest response then is to lower the forecast or split earlier — not to keep granting exceptions.

**PR1b-b split itself further, before a third exception could happen.** The original 12-task PR1b-b scope was re-forecast at apply time and found to not fit 400 authored lines even for its cheapest half: the six tasks provable by pure computation or a static-declaration assertion (button hierarchy, badge, price typography, contrast, focus, webfont/JS) alone cost ~490 authored lines (`components/atoms/*`, `components/contrast.ts` — a from-scratch WCAG luminance/contrast implementation kept dependency-free — and one consolidated `components/design-contract.test.tsx`). Rather than take a third exception, or bolt the real Playwright layout-measurement harness for 1b.10–1b.12/1b.14 onto an already-full diff, the remainder ships as **PR1b-c**, not yet started. Estimated cost of that harness alone (a `/measure` route serving real production CSS + a dedicated `playwright.measure.config.ts` + a multi-check spec) is ~130–155 lines before any 1b.5 atoms are added — its own budget, not a top-up on this one. `components/molecules/ResultRow.tsx` is built here structurally (grid, price/badge/title/metadata, correct DOM order — unit-tested) but its three measured claims (1b.10, 1b.11, 1b.12) are explicitly **not proven** and stay unchecked; a CSS-content assertion for `96px` would prove the stylesheet was written, not that the row renders within the bound, which is the entire point of those tasks.

**Source of truth:** `design/reference/sistema/SISTEMA.md` (system), `design/reference/sistema/tokens.css` (token sets), `design/reference/sistema/pantallas-compacto-menta.html` (six worked surfaces at 360px and 1280px). Combination: `data-theme="menta"` + `data-layout="compacto"`. The reference HTML is a prototype, not production code — its inline styles and `support.js` runtime are never ported.

- [x] 1b.1 Port the shipped token subset to `src/styles/tokens.css` — `[data-layout="compacto"]`, `[data-theme="menta"]`, plus one dark set behind `prefers-color-scheme` (D16). The remaining ten sets stay in the reference only
- [x] 1b.2 Set `data-theme` / `data-layout` on the root element in the app shell; no component reads either attribute directly
- [x] 1b.3 RED: **no component style contains a hex literal, a raw corner radius, a thumbnail dimension, or a literal type size** — every one resolves through a custom property (D16). Wire it as a lint rule, not a review habit
- [x] 1b.4 RED: swapping `data-theme` on the root element repaints every rendered atom and molecule, with no element retaining its previous colour (the inspector-flip criterion, automated)
- [ ] 1b.5 Atoms per atomic design, from the system's component anatomy: price, title, metadata, badge, thumbnail, chip, button, input, label, breadcrumb. **Partial**: `Price` and `PublisherBadge` shipped as standalone atoms (PR1b-b); title/metadata/thumbnail built as internal parts of `ResultRow` to control review size (no second consumer yet — promote if one appears); `Label` shipped as a standalone atom (PR2b, `components/atoms/Label.tsx`) — the cascading city/zone select is its first real consumer; chip/input/breadcrumb still deferred to PR3, no task since has needed them
- [x] 1b.6 GREEN: the three-level button hierarchy as distinct components — action (filled `--accent`), selection/state (`--tint` fill, `--accent` border and text), neutral (`--strong` border, no fill). They are not variants of one component with a free-form prop, because the levels must not be mixed. `components/atoms/buttons.tsx` + `Button.module.css`; proved by CSS-declaration assertion + a structural check that `Props` carries no `variant` field
- [x] 1b.7 RED: the `publisher_type` badge is distinguishable with colour removed — owner is filled (`--ink` on `--surface`), broker is outlined (`--strong` border, `--soft` text). Asserted against a greyscale render, not by reading the CSS. Proved two ways: structural (fill vs border, survives greyscale by construction) and computed (real WCAG relative-luminance/contrast on the shipped tokens, both themes) — `components/design-contract.test.tsx`, `components/contrast.ts`
- [x] 1b.8 Molecule: the result row — grid `[thumbnail] 1fr`; price and publisher badge share the first line via `space-between`; title clamped to two lines below; metadata (`zona · N hab · N m²`) below that. Price precedes title in DOM order. Built in PR1b-b (`components/molecules/ResultRow.tsx`, DOM-order unit test passing); now measured against its real acceptance criterion by PR1b-c's Playwright harness (1b.10/1b.11 pass — see below), so the task is complete rather than structurally-built-and-unchecked
- [x] 1b.9 RED: the price renders in the monospace system stack with `tabular-nums`, so prices align as a column across rows. Static-declaration assertion on `Price.module.css` (`font-family: var(--disp)`, `font-variant-numeric: tabular-nums`) — the claim IS about the declaration, so this is honest proof, not a proxy
- [x] 1b.10 RED: a result row's rendered height stays within 96px at 360px, including a title long enough to wrap to its two-line clamp. Density is enforced as a bound on the row, not as a count of rows above the fold — a count is a proxy that breaks on a font-metric difference and tells you nothing about what regressed. Proven by `tests/measure/layout.spec.ts` against a real 108-character wrapped title: measured **85.89px** (bound ≤96px). RED captured live by deliberately setting the row's padding to `40px 12px` — measured **151.89px**, reverted
- [x] 1b.11 RED: the result row renders with no horizontal overflow at a 360px viewport (`document.documentElement.scrollWidth <= clientWidth`). Measured **scrollWidth=360px, clientWidth=360px**. RED captured live by deliberately adding `min-width: 500px` to the row — measured **scrollWidth=548px vs clientWidth=360px**, reverted
- [x] 1b.12 RED: at 1280px, result rows and running text stay within the 1100px container rather than spanning the window; body copy is capped at a 520px reading width. Measured row width **1100px** (bound ≤1100px) and body-copy width **520px** (bound ≤520px), via a new `components/layout/ReadingWidth.tsx` primitive (520px cap, SISTEMA.md "Cuerpo"). RED captured live twice: `Container.module.css` max-width widened to 1400px → measured **1264px**; `ReadingWidth.module.css` max-width widened to 900px → measured **900px**; both reverted
- [x] 1b.13 GREEN: two-viewport layout primitives — 1100px container, 240px sticky filter sidebar (`grid: 240px 1fr`, gap 32), 600px single-column form shell, and the detail split (640px media + 420px sticky data column)
- [x] 1b.14 RED: every interactive target is at least 44px in its smallest dimension on mobile and 36px on desktop. `--target-min`/`--target-min-desktop` tokens (added in PR1b-b, wired into `Button.module.css`) now proven by rendered geometry across all three button levels: mobile smallest dimension **44px** (bound ≥44px), desktop smallest dimension **36px** (bound ≥36px). RED captured live twice: `--target-min` set to 30px → measured **34px** on mobile; reverted, then `--target-min-desktop` set to 24px → measured **34px** on desktop; both reverted
- [x] 1b.15 RED: text contrast meets WCAG AA across every token pair in use, in both the shipped light and dark sets. Real computation (`components/contrast.ts`) over the shipped hex values for four pairs actually used by this slice's components, both `menta` and `oscuro` — `components/design-contract.test.tsx`
- [x] 1b.16 RED: keyboard focus is visibly indicated on every interactive atom. Static-declaration assertion — every button level's `:focus-visible` rule has a non-`none`, non-zero `outline` resolving through a token
- [x] 1b.17 GREEN: base layout, landmarks, and heading structure
- [x] 1b.18 Confirm the shipped read-path CSS carries no webfont request and no runtime JavaScript. Static scan: `tokens.css` has no `@font-face`/`url()`; no shipped atom/molecule declares `"use client"`

## Phase 2: City & Zone Data (PR2)

**Split at apply time, per the 400-line review budget.** The 400–600 forecast held for the whole slice, but not for a single PR under the 400-line cap: schema + migration + seed + the real-Postgres integration proof alone measured 258 authored lines, and the cascading select (2.4/2.5) — component, its own unit test, and its stylesheet — added another 185, for 443 total. Per this change's standing rule ("deliver the schema and its structural proof fully and defer the select rather than overrunning"), 2.4/2.5 are deferred to a follow-up slice (**PR2b**) rather than taking a `size:exception`. This is the same proof-boundary split PR1b-b/PR1b-c already established: the tasks provable by a database constraint ship together; UI that needs its own component, test, and stylesheet becomes its own slice.

- [x] 2.1 Schema: `city`, `zone` tables; `zone` `UNIQUE(id, city_id)` (D5)
- [x] 2.2 RED: integration test — cross-city zone reference violates uniqueness (`tests/integration/zone.test.ts`). **Proven against real Postgres 18.6**, first in CI's `integration` job and since locally via `pnpm db:test:up`. Postgres rejects the cross-city row with `23503`, and the same zone paired with its correct city is asserted to succeed — without that second half a typo in the table name would produce the same rejection and the test would pass for the wrong reason
- [x] 2.3 Seed script `src/shared/db/seed.ts` with the founder's not-yet-supplied taxonomy — ships PROVISIONAL Distrito Capital + Maracaibo lists, flagged as such in the file, idempotent via `ON CONFLICT`
- [x] 2.4 RED: zone selector offers only the selected city's zones — **PR2b, 2026-08-16.** `components/molecules/CityZoneSelect.test.tsx` written first against a deliberately unfiltered implementation (`zonesForSelectedCity = zones`). Real assertion failure captured live: `AssertionError: expected '<form class="_form_fbe3f4" method="ge…' not to contain 'Chacao'` (3/3 tests failed for the same reason — the selected city's zones weren't excluding the other city's). Fixed with `zones.filter((zone) => zone.cityId === selectedCityId)`; reran, 3/3 passed
- [x] 2.5 GREEN: cascading city→zone select component (`components/molecules/CityZoneSelect.tsx`) — **PR2b, 2026-08-16.** Server-rendered `<form method="get">`, two native `<select>` elements, a visible `ActionButton type="submit"`. No `onChange` handler, no client component directive — changing the city resubmits as a GET and the server rebuilds the zone `<select>` already filtered (design.md D13). The filter lives inside the component (D5's "guarantees live in the narrowest API"): it takes every curated zone plus the selected city id and filters internally, so a caller cannot pass a mismatched pair. Ships a new standalone `Label` atom (`components/atoms/Label.tsx`, promotes 1b.5) — both selects carry a real associated `<label htmlFor>`, not a placeholder. Verified no client-side JS: `components/design-contract.test.tsx`'s existing "no shipped atom/molecule declares a client directive" scan covers both new files by construction (it globs `components/atoms` and `components/molecules`)

  > **`listing-catalogue` module added 2026-08-21, and the reason is an architecture violation rather than a feature.** `design.md` states it in one line: "the Next.js `app/` tree is a thin delivery adapter that only translates HTTP/RSC into a use case call — no business rule lives there." Three files were writing raw Drizzle against `citiesTable`/`zonesTable` — the SAME `select` copied into `app/page.tsx` and `app/publicar/page.tsx`, plus a third in `app/publicar/actions.ts`. The duplication was the symptom; the cause was a missing port, because `ZoneCataloguePort` only answers "the zones of one city" and the read path needs every city plus the selected city's zones. `CataloguePort` + `DrizzleCatalogue` now serve all three, and `grep` for `shared/db/schema` under `app/` and `components/` comes back empty.
  >
  > **Two rules moved out of the front, at the founder's instruction (2026-08-21: "nunca mas coloques una regla de negocio en el front nunca").** `resolveSelectedCity` was `params.city ?? cities[0]?.id` inside `app/page.tsx` — which city a visitor sees before choosing one is a product decision, and it was being taken by whatever `ORDER BY name` returned first. `zonesForCity` was `zones.filter(...)` inline in TWO components, which is how two screens start disagreeing. Both now live in `listing-catalogue/domain`, where the 90% floor reaches them.
  >
  > **A real defect fixed on the way, not a refactor:** `buildSearchCriteria` never verified the city exists — it puts the value straight into `WHERE city_id = $1` — so `?city=cualquier-cosa` rendered an empty results page for a catalogue full of listings, indistinguishable to the visitor from "no hay avisos". `resolveSelectedCity` refuses an uncurated id and falls back. Same class of fix as `listingIdFromSlug`'s null.
  >
  > **The zone cascade the founder asked for (2026-08-21).** The search sidebar rendered the whole taxonomy in an `<optgroup>` per city, so choosing Maracaibo still offered Chacao. It now receives only the selected city's zones. The founder chose the SERVER cascade over client JS explicitly, with the tradeoff stated: the list narrows on reload, not on click, because a client-side narrow ships a bundle to the cheap phones D13 exists for. `SearchFilters.test.tsx`'s "offers every zone grouped by city" test was DELETED — it had encoded the bug as a requirement.
  >
  > Two mutations checked: accepting an uncurated city id turned 2 tests red, and making `zonesForCity` return the whole taxonomy for an absent city (the generous failure mode) turned 1 red. **Gap closed the same day: `tests/integration/catalogue.test.ts`** (5 specs, real Postgres). It proves the seam rather than re-proving the pure rules: that `listCities`' `ORDER BY name` is real — the site's root city for every visitor who has not chosen depends on it, and no unit test can see it — and that the rows feed `resolveSelectedCity`/`zonesForCity` unchanged. **The `innerJoin` against `city` was REMOVED rather than tested**: `zone_city_id_city_id_fk` is `ON DELETE cascade` (drizzle/0001), so the orphan zone it guarded cannot exist, and a join on every page load to defend an unreachable state is cost with no buyer. A spec now asserts the cascade against the running database, so weakening the constraint fails loudly instead of silently needing the join back. **One false green caught by mutation, and worth recording**: the cities fixture originally inserted Alfa before Beta, so insertion order and alphabetical order were the same sequence and the ordering assertion passed with the `ORDER BY` deleted. Reversed the insert; the mutation now turns it red. Same class of defect as PR11.1's killed-heredoc false green — a gate that cannot fail reports the guarantee as held.

## Phase 3: Listing Publication Core (PR3)

**Split into slices, as this phase's High risk required.** PR3a `feat/publish-validation` (the pure rules, #23); PR3b `feat/upload-guard` (the byte-level upload guard, #24); later slices carry the `listing_photo` schema, the `sharp` derivatives, the form, and the R2 adapter.

Both shipped slices are pure — no database, no R2, no network — which is why they could be built and reviewed in parallel. The cost of that parallelism showed up here: they both edited this block and conflicted. Worth remembering before splitting bookkeeping across concurrent slices again.

- [x] 3.1 Schema: `listing` table, `publisher_type` NOT NULL no default, composite FK `(zone_id, city_id) → zone(id, city_id)` (D5) — shipped in #20
- [x] 3.2 RED: integration test — cross-city listing insert fails FK constraint — shipped in #20. Proven RED by dropping the constraint against live Postgres: the cross-city row inserted (`promise resolved ... instead of rejecting`), and re-adding the constraint then failed until the orphan row was deleted
- [x] 3.3 RED: unit test — publish rejected without `publisher_type`, no default applied — proven twice, at both layers that can enforce it: `not_null_violation` from Postgres (#20) and `publisherType.required` from the validator, which also asserts explicitly that a missing type never silently becomes `owner`
- [x] 3.4 RED: unit test — publish rejected without photo / missing min content (title, description, price, city, zone)
- [x] 3.5 GREEN: `PublishListingUseCase` validation (publisher_type, USD price, city/zone, min content) — the rules shipped in #23 as `validatePublishableListing`, kept separate because the spec's "Uniform Validation Across Every Entry Path" means the broker importer (Phase 9) must be held to exactly them. `publishListing` is the use case that calls it: session gate → zone catalogue → validation → photo pipeline → write. **What this layer decides is the ORDER, and the order is the substance.** Validation runs before any photo, because it is a pure function over values already in memory while each photo costs a network read and a `sharp` decode — spending that on a draft that was never publishable burns a serverless invocation to reach an answer already known. Photos decode **one at a time**: six concurrent decodes against a serverless function's fixed memory ceiling is how this route dies under load, and it would die on the largest uploads, the ones a publisher cares most about. The publisher id comes from the session and never from the request body. Three of those were mutation-checked rather than asserted — parallelising the loop, reading the publisher id from the request, and moving validation after the photos each turned exactly one test red. **`present()` is the backstop for the defect this project already shipped**: after the #31 hole, every persisted column is read through a function that throws by name if the validator ever stops covering it, instead of writing a NULL into a column that refuses one
- [x] 3.13 Drizzle adapters for `ListingRepositoryPort` and `ZoneCataloguePort`, plus the integration test that proves one transaction. `save()` takes the listing and its photos in one call: a listing with no photo row violates a publish rule, so separate `saveListing`/`savePhoto` methods would let a caller create exactly that state whenever the second failed. **Building it surfaced a real infrastructure decision that D2 had deferred: `neon-http` cannot do transactions at all** — `db.transaction()` throws `No transactions support in neon-http driver`. It offers `batch()`, which Neon runs as one transaction, **but `batch()` exists on no other driver, so the integration test would have exercised a path production never runs** — a test reporting on code nobody ships, which is worse than no test. So `src/shared/db/transactional-client.ts` adds a second client on `neon-serverless` (the escalation path `client.ts`'s own comment already named for exactly this trigger), used **only** for the publish write. **Reads deliberately stay on `neon-http`**: D2's latency argument is about the read path on Venezuelan connections, and HTTP with no connection setup wins there, while a publish is a rare human-initiated action where a WebSocket handshake is invisible. Two clients chosen by access pattern beats one compromised for both. The handle is injected, so the deployment's Neon client and the test's `node-postgres` client run byte-identical adapter code. **The atomicity proof is the file's reason to exist**: two photos claiming position 0 make Postgres refuse the SECOND statement, after the listing row is already inserted — the test asserts the listing count is unchanged, which an in-memory fake could never establish, because a fake rolls back for having been written to rather than because a database made it. **Still open and unfixed**: if photo processing fails partway through a multi-photo publish, earlier derivatives are already promoted and their originals deleted — orphans in the bucket with no listing row, and nothing sweeps them
- [x] 3.6 RED: non-image / oversized upload rejected (MIME + magic-byte + size) — `inspectUploadedPhoto`, pure over bytes, 17 specs. Reads the file's own header rather than trusting `Content-Type`, which is a claim the uploader makes about their own bytes and which nothing verifies. SVG is refused outright even when honestly declared: it executes script, `image/svg+xml` is a legitimate image MIME type, and a public bucket serving it is script execution on the origin. **Two numbers here are chosen, not inherited, and both are recorded as such:** the 10 MB ceiling (design.md states only "a phone photo is 3–8 MB") and the exclusion of HEIC, which is the **iPhone camera default** — iOS normally transcodes to JPEG through a file input, but that is not guaranteed, and the fix if publishers hit it is a client-side transcode, never loosening the guard. The `sharp`-based pixel-bomb bound ships with 3.11, where the decoder already exists
- [x] 3.7 GREEN: `sharp`-based upload guard before persistence; R2 presigned PUT adapter — the adapter shipped in #27, the guard-before-persistence half here as `processUploadedPhoto`. **This step exists because the bytes never pass through this application on their way to R2** — that is what a presigned PUT means — so it is the first and only moment anything of ours can look at them, and three guarantees have nowhere else to live: the object belongs to the publisher claiming it, the bytes are the image they claim to be, and the original is discarded (D12). **The ownership check is the load-bearing one and it is not obvious**: the object key travels to the browser, so it is not a secret, and without comparing the publisher id a caller could submit `incoming/<someone-else>/<token>` and have this function download, derive, promote and then DELETE another account's pending photo. It is a structural re-derivation of the key rather than a `startsWith`, because a prefix test accepts `incoming/<publisher>/../elsewhere`. Both of those were mutation-checked rather than assumed — replacing the comparison with `startsWith` and removing the final delete each turned exactly one test red. Derivation is injected as a port so all of it is provable without a bucket, a credential or `sharp`; the encoder's byte budgets stay proven where they already were, against real noise fixtures
- [x] 3.8 Schema: `listing_photo` table — two derivative keys, two measured byte sizes, a display `position`, and **no column for the original file**, because D12 discards it and a nullable `original_key` would be a standing invitation to stop discarding it. **No `alt_text` column either**: the search spec requires alternative text on every photo but does not require a publisher to type it, and asking someone filling this form one-handed on a phone to describe six photographs produces empty fields rather than accessible ones — so it is composed at render time from the listing's title, zone and this row's position. The weaker-text tradeoff is recorded rather than glossed. `ON DELETE CASCADE` and `UNIQUE(listing_id, position)` proven against real Postgres, the cascade **proven RED** by removing it (`update or delete on table "listing" violates foreign key constraint`), plus a sanity test that two different listings may each hold a position 0 — a global unique on `position` alone would have passed the first test and broken the product on its second listing
- [x] 3.9 Publish form UI — shipped as four slices. (a) `violation-copy.ts`, one Spanish sentence per violation code, a `Record` over the union so a new code stops the build until someone writes it, with set equality asserted in **both** directions against codes the validator actually produced. (b) `PublishForm` + `/publicar`, server-rendered with a native POST. (c) **Rebuilt against the artboard after the first version differed in nine ways while passing every test** — the form had been written from the handoff prose, which states the rules but never the layout, and no test in the suite could see layout. The field pattern moved into `components/molecules/Field.tsx` so the next screen starts from the rules rather than from a copy, three form rules moved into `design-contract.test.tsx` where they hold for screens that do not exist yet, and four Playwright measurements at 360 and 1280 now defend the geometry. (d) The Server Action: validates, returns the publisher their words with each error under its own field, and hands a valid draft to step 2 in a short-lived base64url cookie — **base64url because the size test measured a maximal Spanish draft at 7,781 bytes percent-encoded against a ~4 KB ceiling**, a failure that would otherwise have arrived in production as a form that silently empties itself. **Two fields were added to the design's list with the founder's decision**: `habitaciones` and `metros²`, absent from screen 3 yet NOT NULL in the schema and rendered on the result row
- [x] 3.14 Step 2 — photo upload, the one screen where client JS is allowed (SISTEMA.md: "el único lugar donde se permite JS, para comprimir en el dispositivo antes de subir"). Shipped as three slices. **(a)** `validateUploadRequest` decides what is worth signing before the R2 adapter or the network are involved, and **refuses rather than truncates** an over-count request, because silently signing the first six of ten publishes a listing missing photos the publisher believes they attached. **(b)** The uploader, and **the order is the design rather than an implementation detail: compress → measure → sign → upload.** The presigned PUT pins `ContentLength` into its signature, so the exact byte count has to be known BEFORE the signature is requested — compressing afterwards would invalidate every URL just issued. 1600px on the longest edge, chosen against the pipeline that consumes it: the detail derivative is 1280, so uploading below that would make `sharp` upscale, inventing pixels for no saved bytes; the relationship is asserted against `DETAIL_MAX_EDGE` itself so moving either value fails and says which. `computeResize` is pure and separately tested because it is the only part that can ship wrong unnoticed — including the portrait case a width-only rule would leave full size, and the panorama that would otherwise reach a zero-pixel side. **(c)** `publishFromDraft` joins it: `processUploadedPhoto` per key, then `publishListing` in one transaction. **The composition root is where every port choice is finally paid for** — reads on `neon-http`, writes on the transactional client, derivation adapted so the application layer never mentions `Buffer`. Built per request, not at module load, because `createR2PhotoStorage` throws on any missing variable and at module scope that would take down every route that merely imports the file. A rejected draft returns to step 1 with its violations; anything else propagates, because a publisher cannot fix an unreachable bucket by editing a field. **The draft cookie is cleared only after the write succeeded** — clearing earlier loses someone's words to a failure they had no part in
- [ ] 3.15 Render `publisher_type` visibly on the listing detail and the result card — split out of 3.9 on 2026-08-18 because it needs the detail page, which does not exist. The badge atom and its greyscale-survival proof already shipped in PR1b-b; what is missing is the surface. ~~**Blocked on a design gap of the same shape as 3.9's**: artboard `2b` draws `2 HAB · 2 BAÑOS · 78 M² · 1 PUESTO`, and `baños` and `puesto` have no schema columns at all~~ — **gap closed 2026-08-20**: `listing.bathrooms` (NOT NULL) and `listing.parking_spots` (NOT NULL DEFAULT 0) shipped with the publish rules, form fields and copy. The founder chose the asymmetry: baños required because a blank cell beside three numbers reads as broken, puesto defaulted to 0 because zero parking is a fact and nobody should type a zero to publish an anexo. What still blocks 3.15 is only the detail page itself, which does not exist
- [x] 3.18 Publisher contact — **the design draws it and never asks for it.** Artboard 2b renders "Ver WhatsApp del dueño" and "El contacto se muestra a usuarios registrados", and no form in the system collected a value: the same shape of gap as `habitaciones`/`metros²` before it, found while wiring the reveal use case. **It is a METHOD plus a VALUE, not a phone number** (founder, 2026-08-18): "el valor que quiera mostrar la persona. Sea email, WhatsApp o número de teléfono." A column named `whatsapp` would have forced everyone who prefers email to lie in it, and **the reveal button's label must come from the method** — "Ver WhatsApp del dueño" is a promise the product does not keep for someone who chose email. **Lives on the account as a default and on the listing as the effective value, copied at publish time**: editing the account later must not rewrite adverts somebody has already seen, because a tenant who wrote to a number needs that advert to keep saying the number they wrote to. Validation is **shape, never verification** — nothing proves the line rings, phone verification is a disabled port (D9), and what the checks buy is the typo a publisher can fix while still on the form, which is the only moment it is cheap. Venezuelan numbers accept the separators people actually type. **The migration was hand-edited after generation**: `drizzle-kit` emitted `ADD COLUMN … NOT NULL` with no default, which Postgres refuses on a populated table (verified against 15 real rows, not assumed), so it adds nullable, backfills, then tightens — and the backfill writes a **visibly unusable** `sin-contacto` rather than a plausible number, because inventing one would hand a tenant a contact that goes nowhere. **Owed a design: `/mi-cuenta`**, where the account default would be edited; it blocks nothing, since a publisher with no default fills the field on the form
- [ ] 3.17 E2E: upload a real file to the real bucket. **The only test that can catch a CORS failure**, and the reason it is its own task: photo upload shipped with 42 green specs across four files and was impossible in production, because the browser blocked every PUT before it left. `upload-request` and `compress` are pure, `r2-photo-storage` injects its S3 client, `process-uploaded-photo` uses fakes — **not one of them makes a real request**, and none of them can, because CORS is a browser policy that does not exist server-side. Needs the R2 credentials in CI and a session, so it belongs with the deploy work rather than before it. `docs/going-live.md` carries the configuration this depends on
- [x] 3.16 Design update of 2026-08-18, imported from the founder's Claude Design project (`Rentas - Sistema.dc.html`, artboard `2g`). **The colour half has shipped**: `--warn` and `--warn-bg` repainted from the palette itself — the mustard pair was the only colour on the publish screen belonging to no theme — plus `--meta`, a new token for monospaced metadata (counts, file sizes, step labels) declared separately from `--disp` because they share a value under `compacto` and mean different things. **`oscuro` was redrawn from menta's own palette**, `--surface` being menta's accent navy and `--accent` its mint, replacing an amber theme that shared nothing with it; the theme-contract gate needed narrowing for `--r`/`--rs`, which the new dark theme deliberately keeps identical because a radius is geometry rather than colour, and the narrowed rule was proven to still catch a real colour leak. **Artboard `2g` shipped too**, and it was a different screen from the one that had shipped: per-photo rows carrying a thumbnail, the file name and its compression result (`2,4 MB → 38 KB`), a `Portada` badge on the first, a per-photo remove button, per-photo states for compressing and for refusal (`✱ Es un video, no una foto`), a `4 de 6` counter, `+ Agregar más`, drag-to-reorder, an empty state, and the trust block that says publishing photos taken from another advert costs the account. **The design says "Hasta 8 fotos" and the founder chose to keep 6** (2026-08-18): eight would cost about a quarter of the free tier's catalogue capacity — ~5,900 listings against ~7,900 — measured against the stored derivatives rather than the discarded originals. The screen's copy therefore reads 6, and reads it **from `MAX_PHOTOS_PER_LISTING`** rather than repeating a number — a copy that states a limit it does not share with the validator is a copy that goes stale. Two tokens were added for it: `--meta-fs-sm` (11px, the step label and the counter) and `--r-thumb` (6px, because a 12px round on a 64×48 image eats the image). **The corner-radius gate needed fixing to accept it**: `border-radius: 0 var(--r-thumb) 0 var(--r-thumb)` was reported as a literal because the check read the whole value rather than each part, and the repaired check now also catches a literal hiding among tokens (`0 6px 0 var(--r)`), which the old one missed entirely

### A second forecast correction, measured 2026-08-17

The Phase 1b note above revised estimates upward once, for proof. **Phase 3's UI slices show the same error again in a different place: a form is not one unit of work per field.** `PublishForm` is 528 authored lines for eight fields — 241 component, 136 proof, 91 styles, 60 route — and that is *after* extracting a shared `Field` renderer that removed 36 lines of duplication. Nothing in it is padding: every field carries a real `<label>`, help text, a per-field error region, `aria-invalid`, `aria-describedby`, and the submitted value round-tripping so a phone user does not retype what they already wrote.

The lesson is not "grant another exception". It is that **a screen with N form fields costs roughly 55–65 authored lines per field including proof and styles**, so any remaining form surface must be forecast from its field count and split before it is built — never estimated as one slice and then rescued with an exception. Applied below to PR9's import preview and PR7's renewal surfaces.
- [x] 3.10 RED: after upload, only derivatives are persisted — the original file is not retained (D12) — `deriveListingPhoto` returns exactly two members and the source is not one of them. **This is the half this layer can enforce, not all of D12**: the R2 adapter (3.7) must still refuse to PUT the buffer it was handed, and that is a separate guarantee
- [x] 3.11 GREEN: `sharp` emits a row thumbnail at 128 × 96 (≤ 10 KB — covers the 44 × 34 mobile and 64 × 48 desktop row at 2× under `compacto`, D12/D14) and a detail image (≤ 200 KB) at upload; both stored in R2; platform on-demand image optimization is not used — WebP for both. **The byte budget is met by construction, not asserted afterwards**: quality steps down, and when quality alone cannot reach it the longest edge steps down too (1280 → 1024 → 800). That ladder exists because the first implementation threw instead, and the noise fixtures proved that was reachable — a maximally-detailed 1280-edge image lands at ~209 KB even at quality 40. Refusing a publisher's upload because their photograph carried too much detail is a broken product. Measured against incompressible noise: thumbnail **0.1–0.5 KB** (budget 10 KB), detail **167–190 KB** (budget 200 KB). **Recorded rather than quietly accepted: the thumbnail budget has ~20× headroom and therefore cannot fail — it is not a real constraint.** Storing the bytes in R2 belongs to 3.7
- [x] 3.12 RED: derivative dimensions and byte budgets hold for a portrait, a landscape, and an oversized source photo — plus the pixel-bomb bound promised in 3.6, landed here because it needs the decoder (40 MP; a 12 MP phone photo is 4032 × 3024). **The fixtures are deterministic random noise, and that is the load-bearing choice**: a solid-colour test image compresses to almost nothing, so a byte budget asserted against one passes however badly the encoder is configured — a gate that cannot fail, which is the failure this project has already shipped five times. A measured curiosity worth keeping: the 12 MP source fits at 1280px while a 1600 × 900 source falls back to 1024, because downscaling further averages the noise away and yields a *more* compressible image

## Phase 4: Trust — Photo-Hash Dedup (PR4)

**The pure half was pulled forward**, split across two slices — `trust/perceptual-hash-core` (dHash + Hamming, merged as #14) and `trust/perceptual-hash-adapter` (the port, the sharp boundary and the calibration harness). The reason for pulling it forward is the **uncalibrated `<= 8` threshold** (see Open Questions): the harness has to exist before real photographs can decide the number, and no amount of testing substitutes for that data. Tasks 4.1, 4.6, 4.7 and the `PublishListingUseCase` wiring all need `listing`, which is PR3.

- [x] 4.1 Schema: `listing_photo_hash` (`bit(64)`) — **`bit(64)`, not `bigint` and not `text`.** The similarity query is `bit_count(hash # $1) <= $2`, Postgres's own population count over an XOR, and that operator pair exists only for bit strings: storing this as a number would force every comparison into application code — the sequential-scan-in-TypeScript D4 exists to avoid — and storing it as text would make the same query a lie that happens to parse. Drizzle has no first-class `bit`, so the type is declared with `customType` rather than approximated with one that ships. `photo_id` is the primary key, because a photo with two hashes makes "is this a duplicate" depend on which row a scan reached first. **There is deliberately no `publisher_id` column**, even though the duplicate query filters on it: it is reachable by joining `listing_photo` to `listing`, and a copy here would be a second source of truth for who owns a listing — the exact fact D4's same-publisher exemption rests on. A denormalised copy that drifts turns "this is your own photo, republish freely" into a false accusation of duplication, which is the worst failure this feature has. **4.6's drift cross-check ships with the schema rather than after it**: the domain's own `KNOWN_HAMMING_DISTANCE_VECTORS` are replayed through a real `SELECT bit_count($1::bit(64) # $2::bit(64))` and asserted three ways — the declared value, what TypeScript computes, what Postgres computes
- [x] 4.2 RED: cross-publisher perceptually-matching photo rejects the listing. **Proved against `PhotoHashPort` with an in-memory fake, not the real adapter** (`application/ports/photo-hash.port.test.ts`) — the database behaviour is not proven until 4.6
- [x] 4.3 RED: same-publisher match (active/expired/other listing) is allowed — same fake, same caveat
- [x] 4.4 GREEN (hash computation only): `sharp` 9×8 grayscale dHash(64) — pure algorithm in `domain/dhash.ts`, sharp confined to `infrastructure/sharp-dhash.ts`. Wiring into `PublishListingUseCase` needs `listing` (PR3)
- [x] 4.5 GREEN: `PhotoHashPort` exposing only `findMatchesFromOtherPublishers(hash, excludePublisherId, maxDistance)` — no all-matches method (D4)
- [x] 4.6 GREEN: Drizzle/raw-SQL adapter using `bit_count` Hamming distance. `bit_count(a # b)` is Postgres's own population count over an XOR, so the scan runs where the rows are instead of pulling every hash into a serverless function to loop over. **The same-publisher exemption is not a filter this adapter remembers to apply**: the port exposes one query and `excludePublisherId` is required on it, so the exclusion reaches the SQL by construction — an owner republishing their own property after expiry passes by the shape of the API, not by anyone's discipline. `publisher_id` is **joined, never copied**, because a copy would be a second source of truth for who owns a listing and a drifted copy turns "this is your own photo" into a false accusation. **The drift cross-check landed with 4.1**: the domain's `KNOWN_HAMMING_DISTANCE_VECTORS` replayed through real `bit_count`, asserted three ways. The integration test proves what an in-memory fake structurally cannot — the fake filters because it was written to, this proves the SQL does — with Ana's expired listing deliberately holding the SAME hash as Bruno's, so a missing or misapplied exclusion returns two rows instead of one
- [ ] 4.7 E2E: publish → duplicate photo rejected cross-account, accepted same publisher — needs PR3

## Phase 5: Listing Search (PR5)

- [x] 5.0 RED: a submitted `zone` that does not belong to the submitted `city` is ignored, not treated as a meaningful filter. **Found while building the cascading select in PR2b:** a GET form submits whatever its controls currently hold, so picking a new city without touching the zone sends the previous city's zone. Nothing is written, so D5's database constraint is not involved and cannot help — this one has to be handled where the query parameters are read, and the component cannot prevent it because it does not control what the browser posts — **the subtle one.** A GET form posts whatever its controls hold, so a stale city/zone pair reaches the server whenever someone changes the city without touching the zone. The zone is dropped by comparing it against the SUBMITTED city, not against the caller's list. **Open and unbuilt**: the drop is silent, so the 5.7 UI has no way to say "mostrando toda la ciudad" — a `droppedZone` flag is the obvious fix, left for whoever builds the reader
- [x] 5.1 RED: `ListingSearchPort.search(criteria)` — missing/nullable `cityId` rejected (D5)
- [x] 5.2 GREEN: search port signature with required non-nullable `cityId` — `search(criteria)` is the only method; there is no `searchAll` and no sentinel. **Stated at its real strength**: this holds while the interface has one method and nothing stops an adapter from ignoring `cityId` once inside, which is why the integration test exists. Mutation-checked: making `cityId` optional fails `tsc` with three unused-`@ts-expect-error` errors, so CI enforces it
- [x] 5.3 RED: integration — Maracaibo search excludes Distrito Capital listings (no-filter, wide-price-range, colliding-zone-name scenarios)
- [x] 5.4 GREEN: Drizzle search query — city/zone/price/characteristics filters — `city_id` and `status = 'active'` are appended before any caller-supplied filter, and `listing_city_status_idx` is `(city_id, status)`, so the pair every query starts with is also its access path
- [x] 5.5 RED: expired and auto-hidden listings excluded from search
- [x] 5.6 GREEN: active-only status filter — mutation-checked at the SQL level: deleting the predicate removes `status` from the generated `WHERE`
- [x] 5.7 Search results UI showing `publisher_type` per result — artboard 2a, and **it is one control set rendered two ways rather than two components**: a row of chips on a phone, a 240px sidebar at 1280, both the same `<form method="get">`. The GET is the whole mechanism (D11/D13): every change reloads with the state in the URL, which makes a filtered search **linkable, shareable and indexable** — and that matters more than usual here because listings circulate by WhatsApp, so a filter nobody can paste into a chat is a filter that does not travel. **The submit button is visible and required**: there is no `onChange` to auto-submit, and hiding it would leave the form unusable for exactly the visitors the no-JS rule exists for. Nothing is preselected, because a default city would silently answer D5's question for the visitor and they would never learn the catalogue has two cities. The last room step reads **`4+`, never a bare `4`** — a segmented control whose last step quietly meant "exactly four" would hide every larger apartment from the people most likely to want one. An empty result says what to change rather than leaving a blank column that reads as broken, and no city at all asks for one instead of showing a list that quietly crosses cities. Measured at both widths: every control is a real 44px target at 360, and the filter column never overflows — four room chips plus two price inputs in a row is the likeliest way that breaks, and a sideways-scrolling filter panel is one nobody finishes. **The results ARE the root** (founder, 2026-08-19): there is no separate home page, and the design supports that by omission — it has no home artboard and never mentions one. A landing page that only links onward spends the domain's strongest URL on a click, and in a classifieds product that URL belongs to the listings. `/alquiler/<ciudad>/<zona>/<slug>-<id>` stays the listing scheme. **Recorded as a cost, not discovered later**: there is now nowhere for a value proposition or a publish pitch beyond the bar's button. And an addition to the design, stated as one: artboard 2a gives this screen no heading at all, which is fine for a results page reached from elsewhere and wrong for a site root, so a visually hidden `<h1>` carries the document outline while the screen looks exactly as drawn

## Phase 6: Contact Reveal (PR6)

- [x] 6.1 Migration: `contact_reveal_event` table + `contact_reveal_unique_pair` VIEW (raw SQL, D6) — the table is append-only and **all four foreign keys are `ON DELETE restrict`, deliberately**. Cascading would delete the go/pivot evidence at exactly the moment a listing is taken down or an account closed. The cost is real and is the point: an account-erasure request now fails loudly until someone decides between anonymising and dropping these rows, which is design.md's own open question made visible instead of silently resolved the wrong way
- [x] 6.2 Hand-declare TS result type for the view query (flag as drift risk in code comment) — **the drift risk, recorded above `UniquePairRow`**: `drizzle-kit` neither creates nor diffs a view, and `db.execute` returns untyped rows, so the TS type is a hand declaration the compiler cannot check. Drift does not crash — a renamed column arrives as `undefined`, `Number(undefined)` is `NaN` — so the failure mode is a go/pivot report reading `NaN` unique pairs. The integration test is the only thing pinning it. `pgView` was considered and rejected: `DISTINCT ON` plus a window `count(*)` still needs an `.as(sql\`…\`)` escape hatch, which moves the unchecked string rather than removing it
- [x] 6.3 RED: anonymous visitor sees hidden/locked placeholder, no contact value
- [x] 6.4 RED: reveal creates exactly one event; repeat reveal by same tenant creates a second, non-deduplicated event
- [x] 6.5 GREEN: `RevealContactUseCase` — single insert, session-gated — session read **before** the listing is touched, mutation-checked: moving the gate after the read turns exactly that ordering test red
- [x] 6.6 RED: integration — after N repeat reveals of one pair, unique-pair view returns 1 row, `reveal_count=N`, `first_revealed_at`=earliest; raw event table still holds N rows — proven against real Postgres 18. **Verified independently rather than on report**: recreating the view without `DISTINCT ON` turns four tests red, including the one whose assertion the agent had itself tightened from `toBeGreaterThanOrEqual` to `toBeGreaterThan` after discovering the loose form passed against the broken view
- [x] 6.7 GREEN: view query wrapper
- [x] 6.8 Reveal UI: locked placeholder, reveal button, sign-in redirect. **Hecho 2026-08-22, PR #81.** `ContactBlock` con sus tres estados, `reveal-actions.ts` como acción de servidor (no un enlace: hay que registrar el evento que cuenta la métrica norte), `DrizzleRevealableListing`, y `view-listing-contact.ts` para el lado de lectura. El destino de vuelta pasó a ser una regla del dominio (`identity/domain/safe-return-destination.ts`) al descubrir que la comparación de prefijo dejaba la acción como un redirector abierto

  > **Correction landed 2026-08-21, ahead of 6.8.** The contact-reveal module modelled the publisher contact as a single `whatsapp: string`, written when no column stored one. Two columns ship now — `listing.contact_method` and `listing.contact_value`, both NOT NULL, copied at publish time — and `publishable-listing.ts` had already recorded the rule they exist for: "the reveal button's label comes from this, so a listing that says 'Ver WhatsApp' while holding an address is a promise the product does not keep." The method never reached the presentation layer, so 6.8's button would have said "Ver WhatsApp del dueño" over an email address for every publisher who chose one. Fixed in the domain rather than in the component, because the component is being redesigned and the rule is not: `ContactPresentation` now carries `method` in BOTH branches and `value` in the revealed branch only — **the method survives the lock, the value cannot be represented inside it**, which is the guarantee 6.3 was written for and it is unchanged. `contactChannelNoun` returns the channel noun alone ("WhatsApp" / "teléfono" / "email") so the sentence around it stays in the UI layer. Two mutations checked: making the locked branch carry the value turned 4 tests red including the `not.toContain` leak assertions, and hard-coding the noun to "WhatsApp" turned 1 red. **Open for the founder, four words wide**: SISTEMA.md writes the label as "Ver WhatsApp del dueño" and gives no wording for a broker or for the other two channels — the noun is derived, the rest of the sentence is not yet decided
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

**11.17–11.20 pulled forward, shipped as their own slice (`perf/budget-gates`, off `main`).** CI's `budget` job has carried two gates that could not fail since PR0c — each emits a GitHub warning saying so out loud (`.github/workflows/ci.yml`, `budget` job). Real read-path pages are about to land (PR2b's city/zone select, then PR3's publish flow); a budget that starts measuring after the app has gained weight cannot tell you what added it. Landing the gates now, ahead of Phase 3/5/11's own pages, is what makes them able to catch the first regression rather than the fifth.

- [ ] 11.1 GREEN: URL scheme `/alquiler/<ciudad>/<zona>/<slug>-<id>`; filters as query parameters. **Partial, 2026-08-20** — the scheme ships as `src/modules/listing-discovery/domain/listing-url.ts` (`slugify`, `buildListingPath`, `listingIdFromSlug`), pulled forward out of Phase 11 because the listing detail page needs it and nothing else can be built on top of a URL that does not exist yet. The filters half already holds: search is a `GET` form and its state is the query string (5.7). **What is deliberately NOT done is the route** — nothing links to this scheme and no page serves it, because a link to a route that does not exist is a broken link, and the page is its own slice. **The design decision worth carrying forward: only the id identifies a listing.** City, zone and slug are for a crawler and for a person deciding whether to tap a link pasted into a WhatsApp group; they carry no lookup power, so a retitled advert keeps its URL. The cost is a duty on the page — every path ending in the same id resolves to the same listing, so the page must rebuild the canonical path and redirect anything that differs, or one advert publishes unbounded duplicate URLs. **`listingIdFromSlug` returning `null` is the guard, not a convenience**: its result becomes a `WHERE id = $1`, so a segment that merely looks plausible is refused here rather than handed to the database. Four rules were mutation-checked rather than asserted and left at that — removing the regex's end anchor turned two tests red including the `… OR 1=1` segment, and dropping the lowercase, the NFD accent strip or the 60-character cap each turned exactly one red
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
- [x] 11.13 GREEN: dynamic sitemap over active listings and zone pages; `robots` route; expired URLs dropped on expiry. **Shipped 2026-08-22.** `src/modules/listing-discovery/domain/sitemap.ts` (`buildSitemap`), `application/ports/sitemap.port.ts`, `infrastructure/drizzle-sitemap.ts` and `site-base-url.ts`; routes at `app/sitemap.ts` and `app/robots.ts`; `tests/integration/sitemap.test.ts` against real Postgres. **Three decisions worth carrying forward.** (1) **Zone pages are DERIVED from the active listings, never queried separately**, so `SitemapPort` has a single method and there is no `allZones()` — a zone page with no active listing is not expressible in the sitemap. Two queries could disagree, and the failure is us hand-delivering Google a URL that answers "todavía no hay avisos publicados acá". (2) **The freshness filter is two conditions, not one**: `status = 'active'` AND `expires_at > now()`. The status is moved by a scheduled job and a scheduled job runs late; in that window the row still says `active` while the ficha already draws itself as expired. Mutation-checked — dropping the date turns two integration specs red. (3) **`export const dynamic = "force-dynamic"` is load-bearing and was proven by mutation**: without it Next prerenders the sitemap at build time, and CI's `build` job runs with a deliberately unroutable `DATABASE_URL`, so removing the line fails the build with `getaddrinfo ENOTFOUND`. It is also simply correct — a sitemap baked at build is stale the moment the next listing is published. **`robots.txt` deliberately does NOT disallow the refined searches**: a URL blocked in robots.txt is never crawled, so Google never reads its `noindex` and an already-indexed page stays indexed forever. The `noindex` on filtered zone routes (14.24) is the mechanism; robots.txt only blocks what makes no sense to crawl at all (`/signin`, `/measure`, `/publicar`)
- [ ] 11.14 GREEN: schema.org structured data on the listing detail page
- [ ] 11.15 RED: a listing below the minimum content threshold carries `noindex` (thin-content guard for bulk-imported portfolios)
- [ ] 11.16 RED: a zone landing page and the search results contain listings with JavaScript execution disabled (Playwright, scripting off)
- [x] 11.17 GREEN: `scripts/budget-bundle.ts` reads `.next/app-build-manifest.json`, gzips every JS file for each read-path route (a manifest key ending `/page`, excluding `(auth)`/`/measure`/`_not-found`), and exits non-zero when the worst one exceeds 30 KB. No read-path route exists yet, so it falls back to the shared framework/runtime baseline (the floor every future one inherits) — measured **99.91 KB gzip against the 30 KB budget: FAIL today**, before a single line of application code exists. This is not "passes because the app is empty" — it is the opposite finding: Next.js 15 + React 19's own App Router client shell (`chunks/424-*.js` 45.8 kB + `chunks/b5b3cec6-*.js` 54.2 kB, gzip, present on literally every route including a bare route handler) already costs more than 3× the budget by itself. Flagged as a risk for the founder/design owner — see apply-progress
- [x] 11.18 RED: real conversion captured live. A temporary route (`app/budget-proof-temp/page.tsx`, never committed) measured **100.04 KB gzip** as a pure server component; adding one `"use client"` child (`useState` counter) measured **100.18 KB gzip** — a real, reproducible increase attributable to exactly that route, proving the script's differential detection (not just the absolute-threshold check). Reverted; `app/` carries zero net diff (`git status --porcelain -- app/` empty)
- [x] 11.19 GREEN: `lighthouserc.json` — mobile, simulated throttling matching Lighthouse's documented `mobileSlow4G` profile (RTT 150 ms, ~1.6 Mbps down — the profile historically named "3G" before Lighthouse 6's terminology update). `largest-contentful-paint` asserted globally at ≤2500 ms; `total-byte-weight` asserted via `assertMatrix` at ≤512000 B (500 KB) for detail-shaped URLs (`/alquiler/<ciudad>/<zona>/<slug>-<id>`) and ≤153600 B (150 KB) for search/zone-landing-shaped URLs (`/alquiler/<ciudad>[/<zona>]`) — both patterns are forward-looking assumptions about Phase 5/11's URL scheme (design.md D11, tasks.md 11.1) and match no URL today, since neither page exists. Cannot be verified locally (needs a deployment) — this config's first real execution is CI, exactly as the D5 integration test was handled
- [x] 11.20 GREEN: `.github/workflows/ci.yml`'s `budget` job now runs `pnpm build && pnpm run budget:bundle` and `pnpm run budget:lighthouse` unconditionally — the two "cannot fail yet" warning branches are removed. Both DATABASE_URL/AUTH_SECRET placeholders (matching the `build` job) were added to the `budget` job, which previously never actually ran `pnpm build` (the warning branch always fired, since neither script existed) and so never needed them

## Phase 11b: Operability — the schema arrives with the code, and a failure is legible (PR11b)

**Added 2026-08-20, after the fact rather than before it, and that is the point.** None of the 163 tasks above mentioned error handling, logging, observability or a deploy that touches the database — the words do not appear once. The cost of the omission was measured rather than imagined: **production ran four migrations behind from 2026-08-17 to 2026-08-20**. `build` was `next build` and nothing else, so no deploy had ever migrated anything. Search kept working, because it selects none of the missing columns. Signing in failed on `column "contact_method" does not exist`. Publishing was impossible — `listing_photo` did not exist at all. Nothing reported any of it, and the founder found it by trying to log in to his own product.

The honest ordering argument, recorded because it decides what ships first: **a logger would not have caught this.** The error was written; Vercel captured it; nobody reads logs on a pre-launch product. What closes the hole is making the schema arrive with the code that expects it.

- [x] 11b.1 `scripts/deploy-migrate.mjs` + `vercel-build`: apply pending migrations before the build that needs them. **Production only** — preview deployments share the production database until each gets its own Neon branch, and a preview build of an unmerged branch would apply that branch's migrations to live data. The skip is printed, never silent. A production build with no `DATABASE_URL` exits non-zero rather than deploying against an unknown schema
- [ ] 11b.2 **The highest-value task in this phase, and blocked on a design.** `app/error.tsx` and `app/global-error.tsx`: what a visitor sees when the server throws. Today they see Next.js's production default — `Application error: a server-side exception has occurred` plus a hash, in English, with no way back. An error screen is a screen, and the founder's standing rule is that a screen not in the design gets requested rather than invented (2026-08-18). Requested 2026-08-20
- [ ] 11b.3 **Blocked on the same design.** `app/not-found.tsx`: needed the moment the listing detail page exists, because an expired or deleted advert has to land somewhere that is not a blank page
- [ ] 11b.4 Structured server-side logging at the boundaries that can fail: server actions, route handlers and the error boundaries above. Vercel captures stdout, so the value is not "write it down" but "write it down in a shape that can be searched and alerted on" — one JSON line per failure carrying the route, the digest the user was shown, and the cause
- [ ] 11b.5 A smoke check that fails loudly when a deploy's schema does not match the code, so 11b.1 is proven rather than trusted. The specific defect it must catch: `select` naming a column the database does not have
- [x] 11b.6 **A migration must never destroy data**, as a gate rather than a promise (founder, 2026-08-20: "no podemos borrar data real"). `scripts/deploy-migrate.mjs` scans every migration file for `DROP TABLE|COLUMN|SCHEMA|DATABASE`, `TRUNCATE` and `DELETE FROM`, and refuses the deploy if it finds one. All eight migrations audited clean when this shipped, so the first destructive statement anyone generates stops a deploy instead of running against the catalogue — and `drizzle-kit` needs no instruction to be destructive, since removing a field from `schema.ts` is enough for it to emit `DROP COLUMN`. Comments are stripped before scanning, because several migrations *describe* a destructive statement they deliberately avoided, and a guard that fired on prose is a guard everyone learns to bypass. `ALLOW_DESTRUCTIVE_MIGRATION=1` is the deliberate, one-deploy escape hatch

## Phase 13: Not yet designed — logger and backups (founder, 2026-08-20)

Parked here on purpose rather than started. Both are real, both were requested, and neither has an answer yet that is worth committing to code.

- [ ] 13.1 **Logger.** The question is not "write failures down" — Vercel already captures stdout, and the four-day outage was written down the whole time. The question is what makes a failure *reach a person* on a product with no on-call and no traffic yet. Options to weigh before writing anything: structured JSON lines plus a Vercel log drain; an error-tracking service with an alert (Sentry's free tier covers this scale); or the cheapest honest thing, a scheduled check that pings the founder when the site stops answering. **The trap to avoid is building the part that feels like progress — a pretty logger — and still having nobody watching**
- [ ] 13.2 **Backups.** Nothing in this repository backs anything up today, and the catalogue is the product. Neon's own point-in-time restore is the obvious first answer and needs checking rather than assuming: what the free tier's retention window actually is, whether it survives a branch delete, and how long a restore takes. Then the question this phase exists for — is that enough on its own, or does a periodic dump belong somewhere the database provider cannot lose along with the database
- [ ] 13.3 Whatever 13.2 concludes, prove a restore once. **An untested backup is not a backup**, and the moment to discover that is not the moment it is needed



## Qué del código actual sobrevive al rediseño, y qué no (2026-08-22)

Medido sobre lo construido, no estimado. El fundador preguntó lo correcto: *"con el nuevo diseño hay cosas que ya posiblemente hicimos y que debemos hacer de nuevo"*. Sí — y esta lista existe para que nadie rehaga lo que no hace falta.

### Se rehace: la capa de entrega

| Pieza | Por qué |
|---|---|
| `components/molecules/ResultRow` | La fila se vuelve tarjeta de cuadrícula (14.25) |
| `components/molecules/SearchFilters` | Pasa a acordeón de 4 pasos con conteo en vivo |
| `components/layout/SidebarLayout` | La barra lateral de 240 px cambia por el panel de 3 columnas |
| `app/page.tsx` | Deja de ser los resultados y pasa a ser el inicio (14.21, 14.24) |
| `app/publicar/*` | Un formulario de dos pasos se vuelve nueve pantallas (Fase 18) |
| `app/(auth)/signin` | Gana el enlace por correo y sus dos presentaciones (Fase 15) |

### Sobrevive intacto, y es donde está el trabajo difícil

**Todo `src/modules/`**: las reglas de publicación con sus 27 códigos de violación, los puertos, los adaptadores de Drizzle y R2, el pipeline de fotos, la detección de duplicados por hash perceptual, el contacto con llave, el esquema de URL, el catálogo, el árbol territorial y los 3.547 alias. Más el esquema de base de datos entero y sus nueve migraciones.

**Y los átomos, que es lo que sorprende:** `Price`, `PublisherBadge`, `Label`, los tres botones y `Container` **no se tocan**. La paleta del diseño nuevo es idéntica a la que ya ship*a* — once de once valores, verificados uno por uno — y `design-contract.test.tsx` ya prueba estructuralmente lo que el diseño nuevo sigue pidiendo: el publicador distinguible en escala de grises, el precio con `tabular-nums`, el contraste AA en los dos temas, y ningún texto atenuado con `opacity`.

`DetailSplit` también se queda: sus `640px 420px` son exactamente lo que la ficha pide.

### La cuenta honesta

Se rehace la capa de entrega, que es cerca de un tercio del código. Se conservan las reglas, los datos y el contrato visual.

**Y no fue tiempo perdido.** Contrastar el diseño contra el código construido es lo que destapó cinco huecos de datos **antes** de escribir una pantalla: el tipo de propiedad, los cinco atributos, la unicidad de zonas que hacía imposible importar la taxonomía real, las seis zonas de Caracas archivadas en el estado equivocado, y los 179 topónimos enterrados. Las dos veces anteriores que este proyecto encontró un hueco así, fue **después** de construir.

## Phase 14: The search flow the founder specified (2026-08-21)

**Where this came from.** The founder delivered a functional specification for the mobile search flow — F1 to F15, with edge cases and ten acceptance criteria — plus a redesign of the list and filters (mobile and desktop). This phase is that document turned into work, checked line by line against what the code already does. It is deliberately written as *functionality*, not screens: the visual half arrives separately and must not be able to silently change a rule recorded here.

**What already holds, so nobody rebuilds it:** city isolation (F2, criterion 8) is guaranteed twice — the search port cannot express an unscoped query, and `listing_zone_city_fk` makes a cross-city row physically impossible; search state already lives in the URL as a `GET` with no client JS (F12, F14, criteria 5 and 7); publisher type is already visible and greyscale-distinguishable, with price above title (criteria 2 and 3); results already order by `published_at` descending (F9); the contact-reveal module already exists and is proven (F13's engine — only its screen is missing).

**The three contradictions, two of them RESOLVED by the founder on 2026-08-22:**

1. **RESOLVED — the grid wins, and `SISTEMA.md`'s row rule is retired.** That document states as a hard rule "Lista de filas, nunca grilla de tarjetas, en ningún ancho"; the founder overrode it deliberately after being shown the conflict. **The original argument was weight**, not taste: a row with a small thumbnail fits the 150 KB budget for 20 listings. The founder's own document reports today's results page at ~128 KB, so there is headroom — but a grid of 158 px photos spends it, and 14.5 (the budget gate) is what will say whether it fits. Two columns on mobile, three on desktop.

2. **RESOLVED — `/` becomes a home with four strips, results move to `/buscar`.** `app/page.tsx` currently records the opposite as a deliberate decision ("there is no separate home page, and that is a decision rather than an omission"), and that comment must be rewritten rather than left contradicting the code beside it. What the old decision bought — the domain's strongest URL showing listings — is given up for what the strips buy: someone who arrives without knowing what they want sees supply immediately instead of an empty filter column.
3. **F13 says the number is "parcialmente oculto".** The shipped guarantee is stronger and deliberate: in the locked state the contact value is *unrepresentable* — it never reaches the browser at all, so there is nothing to un-hide in the HTML. Showing real digits is a different promise and has to be chosen, not slid into.

**A scheduling consequence of the grid decision, and it moves work earlier.** A card without an image reads as broken, so **the grid requires cover photos** — and today the search query never touches `listing_photo` while `ResultRow` renders a CSS placeholder. Phase 19's photo pipeline (four sizes, re-derivation, backfill) stops being a ficha concern and becomes a **prerequisite for the list itself**. Whoever plans the order should read 19a before starting 14.

### 14a. Data the product does not store yet

- [x] 14.1 `listing.property_type`, `NOT NULL` with **no default** — following `publisher_type`'s precedent in the schema, where the note records that a default is the silent failure mode. Taxonomy fixed by the founder (2026-08-21): `apartamento`, `casa`, `quinta`, `anexo`, `habitacion`. **`local comercial` was proposed and withdrawn**, and the withdrawal is load-bearing: it keeps the product residential, keeps `listing.rooms` `NOT NULL` without forcing a meaningless number onto a commercial unit, and keeps the detail page's four-cell stat strip (whose schema comment says it "draws four identical cells and has no empty state for one of them"). Do not re-add it without re-opening all three. **This is the THIRD instance of the same recurring gap** — `habitaciones`/`metros²`, then `baños`/`puesto` (3.15), now this — and the first one caught before building rather than after. **Hecho, migración `0008`.**
- [x] 14.2 Migration for 14.1 in three steps, because live rows exist and "no podemos borrar data real" is a gate (`scripts/deploy-migrate.mjs`, 11b.6): add nullable → backfill → set `NOT NULL`. **Hecho.** Tres pasos: nullable → backfill → `NOT NULL`, escrito a mano porque la salida de drizzle-kit habría fallado
- [x] 14.3 The six attributes of F6 — planta eléctrica, agua regular, amoblado, vigilancia 24 h, línea blanca (puesto de estacionamiento already ships as `parking_spots`). **As six boolean columns, not an attribute table**, and the reason is F6's own wording: attributes combine with AND ("piden todos, no cualquiera") and each must report how many of the current results have it. Six columns make that `COUNT(*) FILTER (WHERE amoblado)` — one pass, indexable. An attribute table makes it `GROUP BY … HAVING COUNT(*) = N` on every search: complexity paid on every query to save a migration done once a year. **Hecho.** Cinco columnas booleanas; `parking_spots` ya existía
- [ ] 14.4 A `pending_moderation` listing status. F1 excludes it from every collection; the enum today is only `active | expired | hidden`
- [x] 14.5 **Cover photo in search results.** Today the search query never touches `listing_photo` and `ResultRow` renders a CSS placeholder — there is not a single real photograph anywhere in the results. F9 also requires that a listing with no photo never reaches the grid; the publish form already refuses one, but the broker bulk import (Phase 9) does not. **Hecho, PR #77/#83.** `coversFor` (plural, sin singular al lado) + `buildListingGrid`, en la zona, la ciudad y el inicio

### 14b. The search engine

- [ ] 14.6 Multiple zones combined with OR (F4). `SearchCriteria` carries a single optional `zoneId`. **Construido en el PR #84, sin mergear.** `zoneIds` reemplaza a `zoneId`; una zona que ya no existe se descarta y el resto de la búsqueda sobrevive
- [ ] 14.7 A `publisherType` criterion — "solo de dueños" (F6). The column exists; the filter does not. **Construido en el PR #84, sin mergear.**
- [ ] 14.8 A `propertyType` criterion, from 14.1. **Construido en el PR #84, sin mergear.**
- [ ] 14.9 Attribute criteria, AND-combined, from 14.3. **Construido en el PR #84, sin mergear.** Y sólo se puede pedir el `true`: `false` significa «no lo declaró», nunca «no lo tiene»
- [ ] 14.10 Pagination (F10). The query has no `LIMIT` and no `OFFSET` — it returns the whole catalogue. **Construido en el PR #84, sin mergear.** 24 por página, porque divide a las dos cuadrículas (2 columnas en teléfono, 3 en escritorio) y la última fila nunca queda coja
- [x] 14.11 **Counts, and this is the heaviest requirement in the entire document.** F3, F4, F6 and F7 all demand that *every filter option shows its number before you choose it*, and F7 demands the confirm button state the exact result count at every step. That turns each filter into a faceted aggregation. **The cost is round trips, not Postgres.** Neon is serverless over HTTP: one query for the rows plus six for the facets is seven network round trips. The requirement is therefore ONE query returning rows and every facet count together, not a cache. **Hecho, PR #79.** Una sola consulta con `COUNT(*) FILTER`, y cada faceta se cuenta SIN su propio filtro para que las alternativas no den cero. Un test envuelve el driver y afirma `queries === 1`
- [ ] 14.12 Price histogram over the selected zones (F5), plus the "la mayoría está entre $380 y $620" summary
- [ ] 14.13 Swap min and max when inverted instead of erroring; clamp out-of-range values to the real extremes and say so (F5)
- [ ] 14.14 The relaxation proposal (F10, F11): evaluate each active filter and offer the single change that adds the most results, with its number. "Ninguna pantalla termina en un vacío sin salida" (criterion 9)
- [ ] 14.15 Zero-results diagnosis (F11): name the filter causing the emptiness, offer up to three concrete exits each with its count. **Never suggest another city** (criterion 8)
- [ ] 14.16 Saved searches, which F11 promises ("avisarme cuando aparezca algo así")

### 14c. The suggestion box (founder, 2026-08-21 — "como hace Airbnb")

- [ ] 14.17 **A translator, not a search.** Typing "arriendo maracaibo" must suggest the Maracaibo *filter*. This does NOT contradict the document's own "búsqueda de texto libre" exclusion, and the distinction is the whole design: it never reads listing titles or descriptions, so it cannot return empty on a thin catalogue — the reason free text was excluded. It matches a controlled vocabulary (cities, zones, prices, rooms, property types, attributes, publisher type) and emits filters. F4's "sólo autocompleta zonas conocidas" is this rule, widened
- [ ] 14.18 **A suggestion is a (filter, value) pair, never a word.** `Centro` is a zone in BOTH Maracaibo and Distrito Capital — it is in the seed and `tests/integration/listing-search.test.ts` covers it as the colliding-name case. A bare "Centro" would apply the wrong city's filter and return zero results under the isolation rule, with the visitor unable to see why. Suggestions carry their kind and their scope: `Centro · Zona · Maracaibo`
- [x] 14.19 Pure-domain parser: text in, suggested filters out. No database, no network, no client — testable whole, and it keeps the founder's standing rule (a business rule never lives in the front). Reuse the NFD accent strip already shipped in `listing-discovery/domain/listing-url.ts` so "maracaybo" and "Maracaibo" agree. **Hecho.** `listing-catalogue/domain/suggest-filters.ts`. Falta cablearlo a una pantalla (14.17/14.18/14.20)
- [ ] 14.20 Works with JavaScript off: the box is a `GET` form; the server translates and redirects to the canonical filtered URL. Live suggestions while typing are an enhancement on top, never the mechanism (F14)

### 14d. Surfaces

### 14f. El inicio y la cuadrícula (founder, 2026-08-22)

**Las dos decisiones de arriba rehacen la superficie de lectura entera**, y hasta ahora el plan sólo tenía una tarea bloqueada donde debería haber una sección. Esto es lo que realmente cambia.

- [x] 14.21 **El inicio, en `/`, con cuatro tiras de 5 avisos** (F1): recientes, cada ciudad, y hasta $400. Cada una declara su **total real** ("Ver los 23"), una colección vacía **no se renderiza** — la tira desaparece, no queda un hueco — y una con menos de 5 muestra los que haya sin la placa "Ver todos". Sin ningún aviso activo, el inicio muestra la barra de búsqueda y una invitación a publicar. **Hecho, PR #83.**
- [x] 14.22 **Las cuatro consultas, con su conteo total.** No es un `LIMIT 5` cuatro veces: cada tira necesita sus 5 filas **y** el total de la colección, y "Ver los 23" tiene que decir 23 de verdad (regla transversal 3). Ni vencidos, ni ocultos, ni pendientes de moderación. **Hecho, PR #83.** Una sola consulta para las cuatro tiras: `JOIN` contra un `VALUES` de colecciones, `count(*) over (partition by clave)` para el total y `row_number()` para el recorte
- [x] 14.23 **La misma propiedad puede salir en dos tiras** — reciente y barata a la vez — y eso es correcto, no un duplicado a deduplicar. **Hecho, PR #83.** Es la forma de la consulta, no una regla que alguien tenga que acordarse de no romper
- [x] 14.24 **RESUELTO 2026-08-22: `/buscar` no existe. Toda búsqueda vive en la ruta de su lugar.**
  >
  > La F12 escribía `/buscar?ciudad=distrito-capital&zona=chacao,altamira&…`, y el mapa de pantallas dibujaba BUSCAR como una caja propia. Lo destapó el fundador mirando una URL de Airbnb: `/s/Bocagrande/homes?checkin=…` — **el lugar va en la RUTA y los filtros volátiles en la query**, y el prefijo `/s/` no es una palabra legible porque no vale nada; el valor está en *Bocagrande*.
  >
  > **La pregunta que eso abre es mejor: ¿hace falta esa ruta?** No. `ListingSearchPort` garantiza a nivel de tipo que toda búsqueda lleva un `cityId` obligatorio y no nulable — "no hay `searchAll` ni un valor comodín que signifique «en todas partes»". Una ciudad es un lugar, así que **toda búsqueda posible ya cae en una ruta de lugar**:
  >
  > ```
  > /alquiler/caracas                        sólo ciudad
  > /alquiler/caracas?min=250&hab=2          ciudad + filtros
  > /alquiler/caracas/chacao                 ciudad + una zona   ← indexable
  > /alquiler/caracas/chacao?min=250         refinada
  > /alquiler/caracas?zona=chacao,altamira   varias zonas (F4, OR)
  > ```
  >
  > **Lo que se gana, en orden de peso.** (1) Una URL por contenido: con dos rutas los mismos avisos vivían en dos direcciones, que es el contenido duplicado que Google castiga sobre el dominio entero. (2) La regla de indexación queda **mecánica** — con parámetros `noindex`, sin parámetros se indexa — y no una condición que se rompe en silencio. (3) **Borra trabajo**: la página de zona de la Fase 11 (11.5–11.7) deja de ser una pantalla aparte, *es la misma sin filtros*.
  >
  > **La ficha anida dentro de su zona**, lo que se lee solo: `/alquiler/caracas/chacao/apto-2-hab-<id>`. La ambigüedad ya está resuelta desde la 11.1 — dos segmentos son una zona, tres son un aviso, y un tercer segmento que no termina en un id hace que `listingIdFromSlug` devuelva `null`.
  >
  > **Pendiente de corregir en los documentos del fundador**, no en el código: la F12 y el mapa de pantallas siguen escribiendo `/buscar`.
- [x] 14.30 **Reescribir el comentario de `app/page.tsx`**, que dice que no hay inicio separado "y eso es una decisión antes que una omisión". Ahora es falso, y quedaría contradiciendo al código de al lado. **Hecho, PR #83.**
- [x] 14.25 **La tarjeta de cuadrícula, que reemplaza a `ResultRow`.** Dos columnas de 158 px en móvil, tres de 254 px en escritorio. Conserva lo que la fila ya garantizaba y está probado en `design-contract.test.tsx`: el publicador visible y distinguible **en escala de grises** (relleno contra borde), y el precio antes del título en orden de documento y en peso. **Hecho, PR #77.**
- [x] 14.26 **La tira del inicio cambia de mecanismo entre anchos**: scroll horizontal con 5 más la placa "Ver todos" en móvil, filas fijas de 5 con el total y una flecha en el encabezado en escritorio. **Un solo componente con puntos de quiebre, nunca dos** — la misma razón que `SearchFilters` ya documenta: dos implementaciones se separan, y una búsqueda filtrada terminaría dando URLs distintas según el ancho. **Hecho, PR #83.** Un solo componente con puntos de quiebre
- [ ] 14.27 **El presupuesto es lo que decide si la cuadrícula sobrevive.** El argumento original de "lista de filas, nunca grilla" era el peso, y el documento del fundador reporta la página de resultados hoy en ~128 KB contra un tope de 150 KB con 20 avisos. Una cuadrícula de fotos de 158 px gasta ese margen. **El inicio tiene su propio techo**: ~80 KB con 20 fotos de 158×118. La 11.17 (`budget-bundle`) y la 11.19 (Lighthouse) son las que van a decir si entra, y hay que mirarlas antes de dar la cuadrícula por buena
- [ ] 14.28 **Sin foto de portada la cuadrícula no existe.** Es 14.5, y sube de prioridad por esto: una tarjeta sin imagen se lee como rota, mientras que una fila sin miniatura sólo se ve pobre. La 19a — cuatro tamaños, re-derivación y rellenado de las fotos ya subidas — pasa a ser prerrequisito de la lista, no de la ficha
- [ ] 14.29 **Criterio de aceptación 1, y es medible:** 4 avisos completos sobre el pliegue a 360 px, 6 a 1280. La medición vive en `tests/measure/`, que es donde ya se prueban las cotas de layout con Playwright
- [ ] 14.22 "Limpiar todo" (F8), which resets everything except the city — "la ciudad no es un filtro, es el contexto"
- [ ] 14.23 The URL scheme F12 specifies: `/buscar?ciudad=…&zona=chacao,altamira&min=…&max=…&hab=…&tipo=dueno&pag=1`. Today the parameters are English and live at the root. An invalid parameter is ignored with a notice rather than breaking the page; a zone that no longer exists is dropped and the rest of the search survives
- [ ] 14.24 An expired listing reached by direct link shows the ficha marked expired plus active listings from the same zone (F12) — needs `not-found`/expired handling, which is 11b.3

### 14e. Deliberately NOT doing

Recorded so nobody adds them as an improvement: map of results, address autocomplete, free-text search over listings, relevance ordering, favourites without an account. Each has a functional reason in the founder's document, not a scheduling one.

**Redis is not in this phase, and that is a decision with a date on it.** The founder proposed it for search speed (2026-08-21). It was declined *for search* on the product's own terms: F7 requires the **exact** count, and a cache returns a stale one — a button reading "Ver 47 avisos" over a list of 44 breaks the only thing that button is for, and every publish, expiry, renewal and report invalidates it. The catalogue is also small by the founder's own measure, who set "varios cientos" as the horizon at which free-text search reopens. The engine ships behind a port and gets **measured**; if real data proves it slow, Redis enters as an adapter without touching the domain. Where it is already expected to earn its place is task 6.10's per-account reveal limit, which needs a counter shared across serverless instances — a database is the wrong tool for that, and a cache is the right one.

## Phase 15: Entrar — the two doors, and the magic link (founder, 2026-08-21)

**The single most expensive item in the founder's flows document, and it is not a screen.** Login by email link is infrastructure this project deliberately does not have, and the schema says so out loud: the note above `users` records that no `verificationToken` table exists *because* "this app has exactly one provider (Google OAuth) — no magic-link email provider". That justification expires the moment 15.1 lands, and the comment has to be corrected rather than left contradicting the schema beside it.

**There is no email sender in this repository at all** — not Resend, not nodemailer, nothing. `design.md` names Resend as the plan; nothing is installed. Part of that work is not the assistant's to do: sending from `rentas.com.ve` without landing in spam needs SPF and DKIM records in the domain's DNS, which is the founder's.

**Deliverability is a product risk here, not an ops detail.** The founder's own flow calls step 11 "el punto de fuga principal" — the only moment a tenant is asked for anything. A magic link that lands in the spam folder does not cost one visit; that person can never sign in at all. Google's one tap has no equivalent failure mode, which is why F16 goes first and above, and why F18's waiting screen with a live countdown is load-bearing rather than decorative.

### 15a. Infrastructure

- [ ] 15.1 `verificationToken` table + migration, and **correct the now-false comment** in `src/shared/db/schema.ts` that explains its absence
- [ ] 15.2 An email sender behind a port, so the domain never learns who delivers mail. Founder-owned prerequisite: SPF/DKIM on `rentas.com.ve`'s DNS, plus the API key handled the way R2's was — never pasted into chat
- [ ] 15.3 Auth.js email provider wired with `maxAge` set to **15 minutes** (F17). The library's default is far longer, so this is a configuration the spec pins, not a default to inherit

### 15b. The rules of the link

- [ ] 15.4 Single use (F17). Auth.js does this; assert it rather than assume it
- [ ] 15.5 **Fifteen minutes** (F17)
- [ ] 15.6 ~~Must open on the same device~~ — **REMOVED by the founder, 2026-08-21, and the reasoning is recorded so nobody restores it as a hardening.** The rule was in F17 and it contradicted the founder's own "Decisión pendiente" two sections later: on a desktop the mail is read on the phone, so the link opens on another device **in the normal case, not an edge case**. Enforced as written, signing in by email from a computer could never succeed. What the rule buys is protection against a leaked link — forwarded mail, a shared inbox, a mail scanner that pre-fetches URLs; what it guards is access to a phone number behind a free account. Single use plus fifteen minutes covers the real exposure. It is also custom work: Auth.js is not same-device by default, so keeping it meant building a mechanism to buy a problem

### 15c. The two doors, same mechanism

- [ ] 15.7 **Publicar → a page with its own URL** (both viewports). It has to be a return destination from Google and from a mail client, and a sheet has no URL
- [ ] 15.8 **Ver WhatsApp → a sheet on mobile, a 460 px dialog on desktop.** The tenant must not be taken out of the listing they are reading
- [ ] 15.9 F18's waiting screen: the typed address shown back (so a typo is caught without going back), why it might not arrive, resend **with a countdown rather than a dead button**, and an exit to Google so nobody is trapped waiting
- [ ] 15.10 F19 — return to the exact screen and listing, never the home. This is criterion 11 and it is what makes the contact reveal worth attempting at all
- [ ] 15.11 F20 — every door shows a visible way out. The listing is public; only the phone number is behind the account, and the copy says so

### 15d. Still open after 15.6

- [x] 15.12 **RESOLVED 2026-08-22 — the waiting tab polls, as a progressive enhancement.** The desktop design (`Rentas - Entrar - Desktop.dc.html`, screen 9c) commits to it in copy: "Si lo abris en el telefono, entras ahi y esta pestana sigue esperando: te avisamos aca cuando pase." The founder confirmed after review.
  >
  > **Why this does NOT break F14, correcting my own earlier reading.** I had argued it made the desktop the one exception to the no-JS read path. That was the wrong scope: F14 protects "buscar, filtrar, paginar y navegar" — the surfaces a crawler indexes and a cheap phone pays for. The "revisa tu correo" screen is neither. It is not indexed, not shared, and only reached by someone who just pressed a button on purpose.
  >
  > **Mechanism: polling, not a held connection.** The tab must learn about a session created in another browser on another device, so nothing same-browser (BroadcastChannel, storage events) can work — only the server can tell it. SSE/WebSocket is the elegant answer and the wrong one here: Vercel runs functions with execution limits, not long-lived connections, so it would mean a second service. A ~20-line inline script (no React, no bundle weight on the pages that matter) polling every few seconds, **stopping by itself at 15 minutes** because that is the link TTL.
  >
  > **Degrades cleanly:** with JavaScript off the screen still works — the resend countdown and the exit to Google are there, it simply does not update itself. Enhancement, never mechanism.
- [ ] 15.14 **The poll endpoint must be keyed by a browser-held secret, not by the email address.** "Has maria.f@gmail.com signed in yet?" is a question anyone could ask about anyone, which turns the waiting screen into a way to probe when a given person is online. The cookie dropped when the link was requested is what the poll carries
- [ ] 15.15 **Fix the mobile design copy.** `Rentas - Entrar - Mobile.dc.html` screen 8c still reads "Abri el enlace en este mismo telefono. Si lo abris en otro, te pedimos el correo de nuevo" — the same-device rule removed in 15.6. Mobile and desktop currently state opposite behaviours, and mobile states a rule that no longer exists
### 15e. Phone verification is a different thing

- [ ] 15.13 F21 — Google or the mail link confirm **who you are**; the WhatsApp code confirms **that the listing's number works**. Two steps, two moments, never merged into one screen. **Entirely unbuilt today**: `PhoneVerificationPort` exists with a `DisabledPhoneVerificationAdapter` and a `createPhoneVerificationAdapter` that throws `PhoneVerificationNotImplementedError`. It is a third channel with a per-message cost, and it belongs to the publish flow, not to signing in

## Phase 16: La ficha — F22 to F31 (founder, 2026-08-22)

The listing detail, specified by the founder with mobile and desktop designs delivered. This is the screen that closes the product loop: today a visitor can search and can publish, and **cannot open a listing at all** — `app/page.tsx` renders every result without an `href` and no `/alquiler/...` route exists.

Five questions were put to the founder before writing this and all five are answered here. Nothing below is inference.

### 16a. The photo pipeline no longer fits the design (founder, 2026-08-22: "tenemos que manejar ahora estos tamaños")

**The largest technical item in this phase, and it is not on any screen.** Exactly two derivatives ship per photo — a 128×96 thumbnail capped at 10 KB and a detail of up to 1280 px capped at 200 KB — and they were sized for the old row layout, whose thumbnail was 44×34. The new design needs four sizes:

| Surface | Needed | What exists today |
|---|---|---|
| Result card, mobile | 158 px | 128 px thumbnail — soft |
| Result card, desktop | 254 px | 128 px thumbnail — visibly blurred |
| Ficha strip, mobile | ~360 px at ~40 KB (F26) | the 200 KB detail — **six photos = 1.2 MB** |
| Ficha main, desktop | 640×360 | the detail serves |

The third row is a budget failure, not a quality one: F26 promises ~240 KB for all six and F15 caps the ficha at 500 KB, while six of today's detail derivative come to 1.2 MB.

- [x] 16.1 Re-derive from the 1280 px detail, **not from the original**. D12 discards originals after hashing and they are unrecoverable; 1280 px is enough to produce every smaller size, and saying so here stops someone concluding the photos must be re-uploaded. **Hecho.**
- [x] 16.2 `listing_photo` stores exactly two keys (`thumbnail_key`, `detail_key`) and its comment says "Two derivatives per photo and nothing else". Adding sizes changes that model — decide between more columns and a derivative table, and record which, because the comment currently forbids what this task requires. **Hecho, migración `0010`.** Tabla `listing_photo_derivative`, con `INSERT … SELECT` antes de borrar columnas para no destruir las claves de R2 ya subidas
- [x] 16.3 A backfill for photos already stored, since the new sizes do not exist for them. **Hecho.**

### 16b. URLs — the founder kept the ids (2026-08-22)

**Decision: our own ids stay. No incremental numeric id.** F27's example wrote `/aviso/84512/foto/2`, which implied a short numeric public id and a new route base. The founder rejected the incremental id outright ("un id incremental no va… debes poner el id que nosotros manejamos"), so **task 11.1's scheme survives unchanged** and the viewer nests inside it.

- [x] 16.4 The ficha at `/alquiler/<ciudad>/<zona>/<slug>-<id>` — `buildListingPath` and `listingIdFromSlug` already ship (11.1) and are unaffected. **Hecho, PR #74/#78.**
- [x] 16.5 The photo viewer at `/alquiler/<ciudad>/<zona>/<slug>-<id>/foto/<n>` (F27). One photo, one URL, shareable, indexable. **Hecho, PR #82.**
- [x] 16.6 **The duty 11.1 created, now due:** every path ending in the same id resolves to the same listing, so the page rebuilds the canonical path and redirects anything that differs. Without it one advert publishes unbounded duplicate URLs. **Hecho.** `resolveListingRoute`, y el visor lo reusa en vez de tener dos definiciones de canónico
- [x] 16.7 Previous and next are **real links**, not client state (F27). The browser's back button then steps back one photo rather than leaving the listing — that behaviour is a consequence of using links, not something to implement. **Hecho, PR #82.** Y por eso «atrás» retrocede una foto en vez de salir del aviso — eso sale del historial, no se programa
- [x] 16.8 Pin whether `/foto/<n>` is 1-based while `listing_photo.position` is 0-based. F27 writes `/foto/2` for the second photo. **Resuelto: 1-based en la URL, 0-based en la columna**, con la traducción en una sola función (`photoNumberOf` / `photoPositionOf`), PR #82

### 16c. Carrying the search back (F22, founder: "hay que arrastrarlo")

- [ ] 16.9 "← Resultados" must return **with the filters intact**. The ficha's URL carries no search state, so the state has to travel with the link out of the results and back. Whatever shape it takes, it is a link and works with JavaScript off (F14)

### 16d. The contact block (F29, F30)

**The mask is a fixed string, and that is what keeps the guarantee.** The founder chose to reveal only `+58` and mask the rest. Since the mask is drawn without reading the stored value, **not one character leaks** — the shipped rule that the contact value is unrepresentable in the locked state (contact-reveal domain) is untouched, and F29's "the number is always visibly there" is satisfied.

- [x] 16.10 Locked masks, per method: phone → `+58 ••• ••• ••••`, email → `•••••@•••••.•••`. Literal strings, never derived. **Hecho, PR #81.** Literales por método en `ContactBlock`
- [x] 16.11 **Three methods remain correct — no fourth value, and no migration.** The founder listed four cases (landline, mobile with WhatsApp, mobile without, email) but they collapse to three actions: `wa.me`, `tel:`, `mailto:`. A mobile without WhatsApp and a landline both dial. The only thing merged is a label nuance ("Llamar al celular" vs "Llamar"), which can be split later without breaking anything. **Hecho, PR #81.** Un `Record` por método, no un `if`: un cuarto rompe la compilación
- [ ] 16.12 The revealed state needs **`phone_verified_at`** — F29 shows "desde cuándo está verificado". The column does not exist, and phone verification itself is a stub (`PhoneVerificationNotImplementedError`, see 15.13)
- [ ] 16.13 The expired state: no contact, an explanation, and an exit to active listings **in the same zone** — that is the suggestion engine of 11.12, not a simple query
- [x] 16.14 F30's negotiation warning sits with the contact, not in the footer. **Hecho, PR #81.**

### 16e. Content rules that need no new data

- [x] 16.15 F24 — four cells always drawn, a zero rendered as "0". This already matches the schema's own note that the strip "has no empty state for one of them". **Hecho.** `StatStrip`
- [x] 16.16 F25 — **list only what was declared, never the absence.** An unticked `amoblado` means "not declared", not "not furnished", and rendering the negative would state something the system does not know. Worth carrying into the column semantics: these booleans record a declaration, not a fact about the property. **Hecho.** `DeclaredFeatures`
- [x] 16.17 F23 — property type goes beside the location ("Apartamento · Chacao · Distrito Capital"), never inside the numeric strip, because it is a category and not a number. **Hecho.**
- [x] 16.18 F28 — alt text composed at render, **position first**: "Foto 2 de 6 — Apartamento 2 habitaciones, Chacao". There is no `alt_text` column and that is deliberate (see `listing_photo`'s note). **Hecho.** `photoAltText`, posición primero
- [x] 16.19 F26 — the strip is native `scroll-snap`, so it works with JavaScript off. First photo eager, the other five lazy. **Hecho.** `PhotoStrip`, `scroll-snap` nativo

### 16f. Not found (founder, 2026-08-22: "esto se tiene que manejar como notfound")

- [x] 16.20 **The case the founder's document did not cover and I raised: a ficha that never existed.** The expired state is specified; a deleted listing or a mistyped link is not, and that arrives constantly because links travel by WhatsApp. Handled as a real 404 — which is task 11b.3, still blocked on a design. **Hecho.** `notFound()` indistinguible de un aviso oculto: quien sondea URLs no puede averiguar si fue dado de baja o nunca existió
- [ ] 16.21 Reports (F31) pass a listing to `hidden` on acceptance. **There is no report table at all** — Phase 8's work, and the ficha's report link has nowhere to write until it exists

### 16g. Tokens and measurements (founder's ficha spec, 2026-08-22)

**Measured before assuming: the palette did not change.** All eleven colour and radius values in the ficha specification are byte-identical to what `[data-theme="menta"]` already ships — `--surface`, `--bg`, `--line`, `--ink`, `--soft`, `--accent`, `--tint`, `--r`, `--rs`, plus `--rule`/`--acc-ink` under different names. The redesign is **layout, not colour**, and the restyle risk this phase was braced for does not exist for the ficha.

- [ ] 16.22 Two names to reconcile, not two values: the spec's `--rule` is the shipped `--strong` (#788189) and its `--acc-ink` is `--accent-ink` (#ffffff). Pick one spelling and use it in both places — two names for one colour is how a palette starts drifting
- [ ] 16.23 **Type sizes the token set does not carry**, and D16 forbids writing them as literals: price 28/700 mobile and 34/700 desktop (today `--fpb` is 26 and has no desktop step); title 17/600 mobile and 19/600 desktop (today `--title-fs` is 20/700, which means the page title); description 15/1.6. **Do not reach for a token that merely has the right number** — that exact mistake is already recorded in `tokens.css`: the home's `<h1>` grabbed `--fpb` ("precio en ficha") because no page-title token existed, and `lint:tokens` passed, because it verifies a value IS a custom property and never that it is the RIGHT one. A missing token does not fail a gate; it produces a plausible wrong answer
- [ ] 16.24 **A conflict with a shipped token, not a gap:** the spec sets the desktop minimum touch target at 40 px; `--target-min-desktop` ships as 36 px. One of them is wrong and the change is global — every control on every screen
- [ ] 16.25 Action buttons are 46 px tall, which is neither `--target-min` (44) nor the desktop value. Needs its own token
- [x] 16.26 Geometry tokens the ficha introduces: main photo 640×360, thumbnail 120×90, viewer thumbnail 84×56, mobile photo height 180, container 1100 (already shipped as `Container`). **Hecho, PR #82.**
- [x] 16.27 **The viewer's palette is deliberately outside the theme** — `#131517` background, `#F2F3F3` text, `rgba(242,243,243,.62)` secondary, `rgba(242,243,243,.24)` borders. The spec's reason is sound and worth keeping in the code: any tint shifts the temperature of the photograph. It still may not be written as literals in a component (D16), so it needs named tokens of its own. Note `scripts/lint-tokens.mjs` checks the contract across `menta` and `oscuro`; a third, screen-scoped set is a case it has never seen. **Hecho, PR #82.** En `:root` y no en `[data-theme]`, con una mutación que lo prueba
- [x] 16.28 `--soft` is the shipped answer to "never dim text with `opacity`" (criterion 15). Already true in the token set; assert it rather than assume it. **Hecho.**

### 16h. Two contradictions in the specification itself

- [ ] 16.29 **The right column is 420 px or 328 px — the document says both.** §3 gives `grid-template-columns: 640px 1fr; gap: 40px` inside the 1100 container, which computes to 420. §8's measurement table says "Columna de contacto: 328px, pegada". The shipped `DetailSplit.module.css` already uses `640px 420px`, so the grid formula is what exists. 328 may be the block inside a 420 column, but that is a reading, not a decision
- [x] 16.30 **The URL base: RESOLVED by the founder, 2026-08-22 — `/alquiler/<ciudad>/<zona>/<slug>-<id>`, chosen for SEO.** The ficha specification still writes `/aviso/84512` and the design files show only an id; the founder was explicit that this does not govern ("si ves en el diseño solo el id no le pares, solo para esto, ya que es la estructura nueva"). So task 11.1's shipped scheme stands unchanged, the viewer nests as `.../foto/<n>` (16.5), and the canonical redirect duty (16.6) is what keeps one advert from publishing unbounded duplicate URLs. Recorded because the design files will keep showing the short form and the next reader will otherwise think they are authoritative. ~~The founder rejected the incremental numeric id (2026-08-22) and said to use "el id que nosotros manejamos" — which settles the ID and leaves the BASE open.~~
- [x] 16.31 The WhatsApp action opens `wa.me` **with a drafted message that names the listing** (§2 step 9). New: nothing composes that text today, and it is the last thing the product does before the conversation leaves for WhatsApp. **Hecho, PR #81.** Y el número se normaliza a dígitos internacionales: sin eso `wa.me` abre igual con un número que no existe, y la conversación simplemente no ocurre
- [x] 16.32 "Copiar el número" in the revealed state — a clipboard action, so JavaScript, on a screen whose read path ships none. It is an enhancement and must degrade to the number being selectable. **Hecho, PR #81.** Degrada por ausencia, no por inercia: arranca invisible y sólo lo levanta un efecto que comprueba `navigator.clipboard`. La salida sin JS es `user-select: all`
- [x] 16.33 Keyboard navigation in the desktop viewer: ← → change photo, Escape closes (criterion 9). JavaScript on top of links that already work without it (criterion 8) — the two criteria are compatible only in that order. **Hecho, PR #82.** Con un test que ata los selectores del componente cliente a los atributos de la página — sin él el teclado podía apagarse en silencio
- [ ] 16.34 "verificado por WhatsApp el 19 ago" needs `phone_verified_at` (see 16.12) and a date format; the expired state needs the expiry date rendered ("Venció el 12 de septiembre"), which `expires_at` already carries
- [x] 16.35 The footer carries the listing ID and its expiry date beside the report link (§3 item 12) — the first surface that shows an id to a visitor, which is an argument in 16.30's decision. **Hecho.**

## Phase 17: La taxonomía de zonas (founder, 2026-08-22)

**Triggered by real data, not by design.** The founder supplied Maracaibo's official breakdown: 14 parroquias and several hundred barrios and sectores. Two things broke immediately.

**1. That list cannot be imported into today's schema.** `zone` carries `UNIQUE (city_id, name)`, and the list repeats names constantly across parroquias — *San José* appears in Bolívar, Cacique Mara, Chiquinquirá and Cristo de Aranza; *La Consolación* in four; *Indio Mara*, *Rafael Urdaneta*, *Santa Clara*, *Los Andes*, *Nueva Vía*, *Manzana de Oro*, *Sabaneta*, *La Florida*, *La Pastora*, *5 de Julio*, *Los Planazos*, *Los Pinos*, *Los Olivos* likewise. The founder's own notes concede it: "la fuente contiene algunos nombres repetidos". A flat insert fails on the second *San José*. **A barrio is unique inside its parroquia, never inside a city** — that is the constraint the current model does not express.

**2. The seeded taxonomy is already geographically wrong.** `src/shared/db/seed.ts` files Chacao, Altamira, La Castellana, Los Palos Grandes, El Rosal and Las Mercedes under the city "Distrito Capital". **All six are in the state of Miranda** — the first five in Municipio Chacao, Las Mercedes in Baruta. Distrito Capital is Municipio Libertador alone. The founder anticipated this ("imaginate si agregamos el Distrito Capital que hay varias ciudades") without knowing it had already shipped.

### The model: search hierarchy, not administrative hierarchy

Venezuela's real hierarchy is `Estado (o Distrito Capital) → Municipio → Parroquia → barrio/sector` — four levels, and what people call "Caracas" spans **two federal entities**. Modelling that faithfully produces a four-step filter, and nobody rents that way: a tenant says "busco en Tierra Negra", never "en la parroquia Cacique Mara del municipio Maracaibo del estado Zulia".

Two navigable levels, plus one that is **a label and not a step**:

| Level | Example | Purpose |
|---|---|---|
| Área | Maracaibo · Caracas | The first choice. What the city-isolation rule protects |
| Zona | Tierra Negra · Chacao · San José | The real unit of search |
| *Padre* | Cacique Mara · Municipio Chacao | **Never navigated.** Disambiguates a suggestion and makes the zone unique |

The parent being a label is what keeps the filter exactly as shallow as it is today while letting *San José* exist four times. It also resolves Caracas honestly: one área holding zones from both Distrito Capital and Miranda, each showing its municipality.

- [x] 17.1 Add the parent level. `UNIQUE (city_id, name)` becomes uniqueness within the parent; the composite FK that guarantees D5 (`listing_zone_city_fk`) must keep working — it is the constraint that makes a Maracaibo listing physically unable to hold a Caracas zone, and it is not negotiable. **Hecho.** `UNIQUE (city_id, parent_id, category, name) NULLS NOT DISTINCT` — la `city_id` es la que permite que «Centro» exista en Maracaibo Y en Caracas
- [ ] 17.2 **Correct the seed.** Six zones are filed under the wrong federal entity. Decide the área's name first: "Distrito Capital" is factually wrong for five of the six, and "Caracas" is the name people actually use and search for. This is a product decision, not a data fix
- [x] 17.3 Import Maracaibo's parroquias and zones. **The founder decided to load the full list** (2026-08-22) rather than a curated shortlist, which is only viable because of 17.4. **Hecho.** Lista completa: 5.796 lugares, 10 municipios, 81 parroquias
- [ ] 17.4 **The zone search box, and it is now mandatory rather than a convenience.** A `<select>` of several hundred options is unusable on a phone; a box that suggests is not. Same mechanism as 14.18: a suggestion is a (filter, value) pair carrying its kind and scope — `San José · Cacique Mara`, exactly as the "Centro" collision between Maracaibo and Distrito Capital already required. Pure domain, no external service, no per-query cost, and it reuses the NFD accent strip shipped in `listing-discovery/domain/listing-url.ts` so "san jose" finds "San José". Works with JavaScript off as a `GET` whose results are links
- [ ] 17.5 **Order suggestions by listing count, descending.** This is what makes loading the full list safe. **A correction of my own earlier advice, recorded because the reasoning matters:** I argued against importing hundreds of zones because ~93% would show a count of zero, and the founder's own document rejects free-text search for exactly that reason ("devuelve vacío casi siempre y el sitio parece vacío"). With a search box that argument mostly collapses — nobody sees all of them at once, only what they typed toward. Ranking by real supply finishes the job: the zones where renting actually happens rise on their own, and the empty ones sink without disappearing. The catalogue decides, not a guess about which neighbourhoods matter
- [x] 17.6 **RESOLVED by the founder, 2026-08-22: never render a zero.** Zones with listings come first, showing their count; a zone with none shows no number at all — not "0", nothing. This supersedes F4's "una zona con 0 avisos se muestra atenuada con su conteo en cero", and it is the better rule: a column of zeroes is a catalogue advertising its own emptiness
- [ ] 17.7 **Search and publish need opposite behaviour here, and conflating them breaks one of them.** In SEARCH, a zone with no listings must not be offered at all — transversal rule 4 says no option may lead to a void, and offering a zone that returns nothing is exactly that. In PUBLISH, every zone must remain selectable including the empty ones, because otherwise **a zone can never receive its first listing** and the taxonomy freezes at whatever it launched with. Same table, two different reads: the search side filters by supply, the publish side does not
- [ ] 17.8 **The área "Caracas" spans several federal entities** (founder, 2026-08-22: "toda la capital cambia porque son varios estados que están dentro de Caracas"). Named `Caracas` because that is what people type, not `Distrito Capital`, which is factually wrong for five of the six seeded zones. Taxonomies for Caracas, Miranda and La Guaira are being prepared by the founder
- [ ] 17.9 **Open: does La Guaira belong inside the Caracas área or is it its own?** It is a separate state and, for long-stay rental, a different market — someone searching Caracas is unlikely to want Catia La Mar or Macuto, which is a motorway away. Folding it in would make the city-isolation rule return results 40 minutes from what was asked for; keeping it separate costs nothing and can be merged later. **Not to be settled by whoever imports the list first**

### 17e. El dato real llegó, y cambia el modelo (2026-08-22)

The founder had another agent build `docs/territorio/` — 11,017 lines of curated territory, and it is rigorous: hierarchy from INE's DPT, postal codes from IPOSTEL, geometric containment from OSM, provenance tagged per entry, **categories never inferred**, duplicates never merged.

| | |
|---|---|
| Entidades federales | 4 — Distrito Capital, Miranda, La Guaira, Zulia |
| Municipios | 10 |
| Parroquias | 81 |
| Elementos sub-parroquiales | **5,705** |

**It independently confirms the seed defect found in 17.2**, and cites the Gaceta for it: *"Cuatro de los cinco no son Distrito Capital"* — Baruta, Chacao, El Hatillo and Sucre are Miranda.

**The collision numbers settle the schema question.** `Buena Vista` appears **12 times**, `San José` **11**, `El Carmen` **10**, `Los Pinos` and `Santa Ana` **9** each. `UNIQUE (city_id, name)` is not merely tight — it is unsatisfiable.

**And the finding that only real data could produce: the searchable unit is not one level of the hierarchy.** *Chacao* is a municipio AND a parroquia; *Altamira* is an urbanización inside that parroquia; *Sabana Grande* sits in parroquia El Recreo and nobody names the parroquia. People name places **across** levels. Four tables — one per level — would force search to UNION four queries and force `listing` to carry four nullable foreign keys.

- [ ] 17.10 **One self-referencing `territory` table**, not four: `id`, `parent_id`, `kind` (estado|municipio|parroquia|elemento), `category` (barrio|sector|urbanizacion|conjunto|parcelamiento|caserio|localidad|otro), `name`, `ubigeo`, `postal_code`, `source`. ~5,800 rows, which is nothing for Postgres
- [ ] 17.11 **The `area` (Caracas, Maracaibo) is the product's invention and stays separate from the official hierarchy.** Caracas metropolitana crosses two federal entities — the document proves it with Gaceta Oficial 36.906 and its repeal in 41.308 — so no official level can express it. Keeping it apart is what allows the INE data to be re-imported later without overwriting a product decision
- [ ] 17.12 **D5 survives unchanged, with the same mechanism already in use**: `territory` carries `UNIQUE (id, area_id)` and `listing` keeps its composite foreign key. A Maracaibo listing remains physically unable to hold a Caracas zone — the guarantee is not weakened by the new depth
- [x] 17.13 **Keep the provenance columns.** `ubigeo`, `postal_code` and `source` are what make a future re-import possible without losing curation. Dropping them because "the app does not render them" is how a dataset becomes unmaintainable. **Hecho.** `ubigeo`, `postal_code` y `source` viven en `zone`
- [x] 17.14 A parser from `docs/territorio/**.md` into the seed, so the taxonomy is regenerated rather than retyped. The source files carry a stable format — `### Parroquia <name>`, `#### <Category> (n)`, `- <Prefix> <Name>  \`[CP nnnn — SOURCE]\`` — and the seed must stay idempotent (task 2.3). **Hecho.** `listing-catalogue/infrastructure/territorio-parser.ts`

## Phase 18: Publicar — nueve pasos (founder, 2026-08-22)

The founder delivered the publish specification with mobile and desktop designs, and it **replaces the two-step form that ships today**. The brief's own "es un formulario, no un embudo de cinco pasos" is explicitly overturned: nine steps, one question per screen, with a review screen before publishing.

**A correction of my own earlier framing, recorded because it changed the estimate.** I told the founder publicar was "already built, so this is a reskin plus new fields". That was true of the two-step form. It is not true of this: nine screens, per-step server persistence, a review screen, and back-navigation that preserves forward steps is a **rebuild of the delivery layer**. What survives untouched is everything that matters most — `validatePublishableListing`, the photo pipeline, duplicate detection, and the publish use case. The domain was built for this; the screens were not.

### 18a. Decisions the founder made here that close open questions

- [x] 18.1 **A failed photo upload publishes with the rest.** "Se publica con las que subieron y se avisa cuál faltó" — this answers the edge case raised on 2026-08-21 and left open
- [x] 18.2 **Phone verification happens AFTER the listing is saved**, not before. The listing exists as *pending verification*, so abandoning at the code loses nothing and closing the browser mid-flow is no longer an edge case. Asking for a code before the listing exists is asking for effort with nothing yet earned
- [x] 18.3 **The city is never asked — it is derived from the zone.** Sound, and stronger than what ships: `zone` already carries `city_id` under `UNIQUE (id, city_id)`, which is the constraint `listing_zone_city_fk` depends on. Deriving cannot produce a mismatched pair, whereas asking twice can

### 18b. What the new flow needs that does not exist

- [ ] 18.4 **A new listing status: `pending_verification`.** The enum ships as `active | expired | hidden`; F1 additionally needs `pending_moderation`, so it grows to five. Verify what already holds: `DrizzleListingSearch` filters `status = 'active'` unconditionally, so a pending listing cannot leak into search by accident — assert it rather than assume it
- [ ] 18.5 **Server-side draft, one row per step, keyed by session.** The shipped draft is a 10-minute cookie of ~4 KB, and the founder is right that it cannot carry nine steps plus photo state. New storage, and with it a new question the project has not had: abandoned drafts accumulate, and "no podemos borrar data real" (11b.6) has to be reconciled with a draft that nobody will ever finish
- [ ] 18.6 **`title` has no maximum today.** The spec sets 90 characters; the domain has `title.required` and nothing else. A new violation code plus its Spanish copy
- [ ] 18.7 **`referencia`** — free text, optional, shown only on the ficha. Never filtered, never indexed. This is the field that replaces Google Places, and the founder's reasoning for rejecting it is worth keeping: a formatted address is not the product's taxonomy, and four shipped things depend on the zone being a closed list — the search filter, the per-zone counts, the `/alquiler/<ciudad>/<zona>/…` URL, and the zone landing pages
- [ ] 18.8 **The review screen** and **back-navigation that preserves forward steps.** Rule: correcting step 4 from review leaves steps 5–9 intact, with their values. Steps already answered are links; steps ahead are not. The button changes to "Guardar y volver a revisar" when entered from review, and the change is stated back ("Cambiaste habitaciones de 2 a 3")
- [ ] 18.9 **The price histogram in step 3 is the same faceting engine as F5.** This raises 14.11's priority: counting is no longer only a search feature, it is on the publish path too

### 18c. Contradictions to resolve before building

- [ ] 18.10 **`--warn: #8a5a00` reverses a decision the founder made six days earlier.** `tokens.css` records it verbatim: "The mustard pair was the only colour on this screen belonging to no theme; `--warn` is now the accent navy and `--warn-bg` the mint, so 'vence pronto' reads as part of the product rather than a borrowed browser warning." **Measured with the project's own `contrastRatio`:** #8a5a00 gives 5.93:1 on `--surface` and 5.40:1 on `--bg` — both pass AA — but **2.90:1 on the dark background, which fails.** The dark theme carries its own `--dark-warn`, so this is survivable, but `design-contract.test.tsx` asserts AA across BOTH themes and will need the dark counterpart set deliberately rather than inherited
- [ ] 18.11 **The zone list size contradicts Phase 17, decided the same day.** This document says "lista cerrada, ~40 en Distrito Capital y ~12 en Maracaibo". Phase 17.3 records the founder's decision to load the **full** Maracaibo taxonomy — hundreds of zones — made viable by the ranked search box. Twelve zones and several hundred are different products: with twelve, a plain `<select>` works and 17.4's search box is optional again
- [ ] 18.12 **The zone autocomplete is specified as client-side filtering ("filtra en el cliente", "~2 KB").** F14 allows mandatory JavaScript only for photo compression, so the picker needs a working server path as well. The 2 KB figure also belongs to the twelve-zone reading of 18.11; the full taxonomy with parent labels is an order of magnitude larger
- [ ] 18.13 **§6's validation table still lists Ciudad** with "Por ahora publicamos en Distrito Capital y Maracaibo", while criterion 7 says the city is never asked. Both cannot hold. The shipped `cityId.required` and `cityId.unknown` violations become unreachable from the form — they must stay in the domain regardless, because the bulk import calls the same validator
- [ ] 18.14 **Editing a published listing (§12.6) collides with two shipped guarantees.** Publisher type cannot change after publishing. And the contact is *copied* at publish time precisely so that editing an account default never rewrites an advert somebody already acted on — the ficha's own rule is that a tenant who wrote to a number needs that advert to keep saying that number. What an edit may and may not touch is a product decision, not an implementation detail

## Phase 19: Fotos, retención y capacidad (founder, 2026-08-22)

Three decisions taken while importing the designs, each with the measurement that produced it.

### 19a. Photo captions: removed before they were built

- [x] 19.1 **The mobile ficha design labels every photo** — "Sala", "Habitación principal", "Cocina", "Baño", "Estacionamiento", "Fachada". `listing_photo` has no caption column, and more importantly the Publicar specification never asks for one, so six captions would have had to be typed with a thumb in step 8. The founder removed it on sight: "no debe llevar título, solo subir la foto". **Nothing is lost**: R7/F28 already composes the alt text at render time from position, title and zone ("Foto 2 de 6 — Apartamento 2 habitaciones, Chacao"), which is what a screen reader actually needs. What stays from step 8 is what matters — choosing the cover photo and ordering the rest
- [x] 19.2 **"publica como dueña · desde 2025" → neutral, and the date dropped.** "dueña" is gendered and the product neither stores nor should store anyone's gender. The date needed a creation timestamp on `user`, which comes from the Auth.js adapter and does not carry one — a column avoided for a fact the founder judged not worth showing

### 19b. What the new sizes cost, measured

At 1x, because the design itself states that 4K is not served double-density ("chocaría con el presupuesto de bytes").

| Derivative set | Per listing (6 photos) | Listings inside R2's free 10 GB |
|---|---|---|
| Today — thumbnail 128 + detail 1280 | 1.23 MB | **8,322** |
| New design, 5 sizes (160·256·360·640·1280) | 1.79 MB | **5,711** |
| New, viewer at 1024 instead of 1280 | 1.44 MB | 7,104 |
| New, without the small thumb | 1.39 MB | 7,342 |

Meeting the new design costs **31% of capacity**. Operations do not bind: 30 Class A writes per listing against 1,000,000 free monthly is ~33,000 listings/month, and R2 egress is free — the reason R2 was chosen over S3.

- [ ] 19.3 **The biggest single lever is the viewer derivative**, not the number of sizes: dropping it from 1280 to 1024 returns 1,393 listings, because it is 59% of the weight

### 19c. Retention — delete the photos, never the listing

The founder proposed deleting expired listings after a 15-day grace period. **The listing row cannot be deleted, and that is a decision already written into the schema rather than an obstacle.** `contact_reveal_event` carries `ON DELETE restrict` on all four foreign keys, and its comment says why: cascading "would silently delete the go/pivot evidence exactly when a listing is taken down — the deletions most correlated with the months a reveal happened". A `DELETE FROM listing` fails for any listing anyone ever revealed, on purpose.

Deleting only the photos gives up nothing: they are effectively 100% of the R2 weight, while a listing row is ~600 bytes — a hundred thousand expired listings is 57 MB **in Postgres, not R2**. Keeping the row also keeps the URL resolving into the expired state the design already draws, keeps Google from meeting a wall of 404s on indexed pages, and keeps the north-star metric intact.

| Retention | Sustainable new listings per month, indefinitely |
|---|---|
| **45 days** (30 active + 15 grace) | **3,807** |
| 60 days | 2,855 |
| 90 days | 1,903 |

At ~47 listings today, 45 days puts the ceiling 81× above the current catalogue.

- [ ] 19.4 A job that deletes the **photos** of listings expired more than 15 days, leaving the listing row and its status untouched
- [ ] 19.5 **Two emails, not one.** The plan carries one notice *before* expiry, to renew. The purge happens 15 days *after*, so a publisher who ignored the first email loses their photos with no second warning. Day 27: "vence en 3 días". Day 40: "tus fotos se borran el 27 de octubre — renová antes y el aviso vuelve con ellas"
- [ ] 19.6 **The countdown must also live in Mis publicaciones**, because an irreversible deletion may not depend on an email arriving. This is the same deliverability risk that makes the magic link fragile (15.2), except the cost here is not a failed sign-in — it is a publisher's photographs, permanently
- [ ] 19.7 **"Volver a publicar" changes meaning after the purge.** A listing older than 45 days can be republished but its photos are gone, so it means re-uploading. The copy in Mis publicaciones has to say which of the two it is
- [ ] 19.8 Relationship to "no podemos borrar data real" (11b.6): that rule is about migrations destroying data silently. This is a deliberate, announced retention policy through two channels. Different thing — but the announcement is what makes it different, so 19.5 and 19.6 are not optional extras

### 19d. Verification is reused, and it belongs to the value, not the person

The founder asked whether a publisher who verified their WhatsApp should have to verify again for a second listing. No — and the schema half-anticipated it: `users.contact_method`/`contact_value` already exist as the account default, and `listing` **copies** them at publish time. What is missing is the verification state.

**The unit is the (user, method, value) triple, not the user.** If María verifies +58 412 555 0134 and later publishes with a different number, that number is not verified. Treating it as verified because she once verified something is what makes verification stop meaning anything — and telling a real listing from a fake one is the only thing it is for. A small `verified_contact` table also serves an inmobiliaria with two numbers without inventing anything.

- [ ] 19.9 `verified_contact (user_id, method, value, verified_at)`. Publishing with a value that has a live row asks for nothing; a new value is verified and recorded
- [ ] 19.10 **Email needs no WhatsApp code at all.** If the chosen contact is an email and it matches the account's own address, Auth.js already set `emailVerified` at sign-in — through Google or through the magic link. Sending a WhatsApp code to verify an email address never made sense; this removes the step rather than implementing it
- [ ] 19.11 **Verification expires after 12 months** (founder, 2026-08-22). Venezuelan numbers get recycled, and a two-year-old verification may belong to somebody else by now. A publish whose verification has lapsed re-verifies
- [ ] 19.12 **An active listing is not invalidated when its verification lapses mid-flight.** A listing lives 30 days and can be published on a verification's last day, so the two clocks cross. The ficha states the date rather than a status — "verificado por WhatsApp el 19 ago" says *when*, never "still valid today" — which is already what the design draws, so nothing has to change to stay honest
- [ ] 19.13 **This is what makes the broker bulk import (Phase 9) usable at all.** An agency uploading fifty listings verifies once, not fifty times

## Phase 12: Cleanup

- [ ] 12.1 README: setup, env vars, deploy steps
- [ ] 12.2 Confirm `pnpm test`, `test:unit`, `test:integration`, `test:e2e` all pass end to end
