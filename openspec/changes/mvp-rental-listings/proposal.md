# Proposal: MVP Rental Listings

## Intent

Long-stay rental supply in Venezuela lives in WhatsApp groups and Instagram: unsearchable and untrusted. Paid portals exclude individual owners; stolen photos make scams routine. Ship the smallest free, no-commission listing marketplace — "Indeed for properties", never Airbnb. Success is a registered tenant revealing a publisher's WhatsApp contact.

## Scope

### In Scope

- Publish a free long-stay residential listing in USD, with publisher type (owner or broker) always visible.
- Search and filter by city, zone, price, characteristics. City scoping mandatory: Distrito Capital and Maracaibo never mix.
- Reveal WhatsApp contact only after tenant registration; record every reveal as the north-star event.
- 30-day expiry, automated pre-expiry reminder, one-click renewal.
- Zero-cost trust: Google login, perceptual image-hash duplicate rejection, report with auto-hide after N reports.
- Phone verification as a disabled port — contract only, no adapter.
- Operator-enabled CSV portfolio import for seed brokers, producing drafts that photos are attached to afterwards.
- Dismissible voluntary-contribution invitation linking to an external payment destination.

### Out of Scope

- Short-stay/tourist and commercial rentals.
- Visit scheduling, chat, favorites, analytics dashboard.
- Commissions, listing fees, featured placement, paywalls, advertising — the product is free.
- In-app payment processing of any kind; contribution completes on an external provider.
- Self-service enablement of bulk import; the operator grants it per account.
- Active WhatsApp verification adapter; SMS verification.
- Any city beyond the two launch cities.

## Capabilities

### New Capabilities

- `account-identity`: Google registration and session for publishers and tenants.
- `listing-publication`: create/edit a USD long-stay listing with mandatory publisher type.
- `listing-search`: city-scoped browse and filter over active listings.
- `contact-reveal`: gated WhatsApp reveal plus the north-star reveal event.
- `listing-lifecycle`: 30-day expiry, scheduled reminder, one-click renewal.
- `listing-trust`: duplicate-photo rejection, reports with auto-hide, disabled verification port.
- `broker-bulk-import`: operator-gated CSV portfolio import producing drafts, with whole-file validation and a preview before any write.
- `voluntary-contribution`: dismissible free-forever contribution invitation pointing at an external payment destination.

### Modified Capabilities

None — greenfield, no existing specs.

## Approach

Eight capabilities, one thin vertical slice, each independently shippable: identity, publication, search, reveal, lifecycle, trust, bulk import, contribution. Trust rules are enforced inside publication and search rather than as a standalone subsystem, but they are specified separately because they carry their own requirements. Publisher type is required and never inferred — it is the core trust claim.

Bulk import is a **loader, not a second publication path**. It parses, validates, and creates drafts, then delegates to the same publication use cases and the same trust pipeline; it never gets its own write path into the listing tables. Photos never travel inside the CSV — imported drafts receive photos through the presigned upload already designed for the single-listing flow. Access is granted per account by the operator, which caps blast radius and removes the need for anti-abuse machinery in v1.

Contribution is deliberately inert: no money moves through the product, no contributor state is stored, and the invitation can never sit in front of a contact reveal — the north-star event must stay unobstructed.

The reminder is the MVP's only background process; treat it as a first-class job with recorded runs and failures.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| repository root | New | First source tree; today only `README.md` |
| `openspec/specs/` | New | Eight capability specs |
| `openspec/config.yaml` | Modified | `testing:`/`context:` filled after stack choice |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scope creep vs solo part-time founder | High | Four user-facing product capabilities are a hard cap (specified as six capability surfaces) |
| Reminder job fails silently | High | Recorded runs, counts, failures from day one |
| Cold-start: thin per-city catalog | High | Open a city only once broker portfolios load |
| Broker leverage over the catalog | Med | Bound the free promise to seed brokers; grow owner supply |
| WhatsApp Business pricing shifts | Med | Verification stays a disabled port |
| North star cannot see closed rentals | Med | Accept reveals as proxy; state the limit at go/pivot |
| Legal exposure: third-party content, personal data | Med | Publisher-owned terms, takedown path, minimal data |
| No moat against incumbents | Med | Accepted; speed and trust signals are the defense |
| Catalog and contact scraping by a competitor | High | Per-account rate limit on contact reveal; reveals already require an authenticated session |
| Bulk import becomes a validation bypass | High | Import delegates to publication use cases; no independent write path; uniform-validation requirement is specified and tested |
| Contribution page abused for phishing under our brand | Med | Destination resolved server-side only; never accepted from a request parameter |
| Contribution triggers Vercel Hobby commercial-use clause | High | Treated as the trigger to move to Vercel Pro before launch — see tracked debt in design |
| Broker cannot export CSV UTF-8 from their spreadsheet | Med | Downloadable template, delimiter sniffing, BOM tolerance, actionable encoding error |

## Rollback Plan

Greenfield — nothing in production to break. Each capability ships as its own slice, so reverting one leaves the previous slice usable. Full revert deletes the source tree and the six specs; `openspec/config.yaml` returns to its pre-stack state.

## Dependencies

- Google identity provider, free tier.
- 5-10 seed brokers committed to uploading portfolios before launch.
- Stack, hosting, and database decision from `sdd-design`.

## Success Criteria

- [ ] A publisher registers and publishes a free USD listing in under 5 minutes.
- [ ] No listing can exist without a visible owner/broker type.
- [ ] A Maracaibo search never returns a Distrito Capital listing.
- [ ] Contact is hidden to anonymous visitors, revealed to registered tenants.
- [ ] A listing reusing an existing photo is rejected at publish time.
- [ ] Listings expire at 30 days; reminders send automatically; renewal is one click.
- [ ] Every reveal is recorded and countable for the 6-month go/pivot decision.
- [ ] An enabled broker imports a portfolio CSV, sees per-row errors, confirms, and gets drafts — with no duplicates on re-upload.
- [ ] An account without `bulk_import_enabled` is refused server-side, not merely hidden from the UI.
- [ ] No capability is ever withheld from a visitor who does not contribute, and the invitation never precedes a contact reveal.
