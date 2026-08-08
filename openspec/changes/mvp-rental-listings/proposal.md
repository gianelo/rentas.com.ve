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

### Out of Scope

- Short-stay/tourist and commercial rentals.
- Visit scheduling, chat, favorites, analytics dashboard.
- Payments, contracts, commissions, any monetization.
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

### Modified Capabilities

None — greenfield, no existing specs.

## Approach

Six capabilities, one thin vertical slice, each independently shippable: identity, publication, search, reveal, lifecycle, trust. Trust rules are enforced inside publication and search rather than as a standalone subsystem, but they are specified separately because they carry their own requirements. Publisher type is required and never inferred — it is the core trust claim. The reminder is the MVP's only background process; treat it as a first-class job with recorded runs and failures. Stack stays an open decision for `sdd-design`; fixed constraints only: near-zero operating cost, reliable scheduled job, object storage, perceptual hashing, Google identity.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| repository root | New | First source tree; today only `README.md` |
| `openspec/specs/` | New | Six capability specs |
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
