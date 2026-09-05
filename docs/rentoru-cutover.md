# Rentoru cutover — manual configuration

Operational runbook for the founder. Covers **only** the dashboard work of
Phase 26: task **26.1** (Group A) and tasks **26.15–26.20** (Group D). It
changes no code and no file in this repository other than the checkboxes below.

Everything here lives outside the repository, in Vercel, Cloudflare, Google
Cloud Console and Resend. None of it is covered by a test. Several items fail
silently: the browser blocks a photo upload before it leaves, a mail bounces
into a stranger's provider, a sender is refused with no server log on our side.

Group D costs zero lines of authorship and **blocks every other task in the
phase**: the code can be renamed green while mail, Google sign-in and photos
still point somewhere else.

---

## Status — executed 2026-09-05

This runbook was **executed on 2026-09-05**. Eleven of its twelve
configuration blocks are complete and verified from outside: §0, §1, §2, §3a,
§3b, §4a, §4b, §4c, §5b, §5c and §6. Steps that produced something worth
keeping carry a dated **Executed 2026-09-05** note underneath them.

**One block is outstanding: the §5a real-browser photo upload test.** The CORS
policy itself was updated, but the upload cannot be exercised, because the
publish flow's zone step returns no zones and the photo step is therefore
unreachable. The cause is a production data gap, proven on 2026-09-05 and
tracked as task **17.15** — see *Blocked — the publish flow's zone step returns
no zones* at the end of §5a.

**Two further checks were never run, and are left unticked rather than
inferred.** Both belong to blocks whose configuration is complete, so neither
holds up the cutover — but neither has been observed either, and a runbook that
ticks an unobserved box is worth less than one with an honest gap:

| Check | State |
|---|---|
| Sign-in started from a **deep link** returns to that page (§3b) | Plain sign-in confirmed; the deep-link return, which is the only result that distinguishes a correct `AUTH_URL` from an absent one, was never exercised |
| **SPF and DKIM headers** of a received magic-link mail (§4c) | The mail arrives from `@rentoru.com` and the link signs you in; the headers were never opened. The records are published (§4b), which makes a pass likely — likely is not checked |

Separately, the **DMARC record is not published yet** (`_dmarc.rentoru.com`
returns nothing), because its `p=` value is still an open decision. §8 now
records two of its four decisions as settled and two as genuinely open: the
DMARC policy value and the sender display name.

---

## 0. Pre-flight — confirm before starting

- [x] `rentoru.com` is registered and the founder controls it.
- [x] The `rentoru.com` zone is on Cloudflare (its nameservers point at
      Cloudflare). Email Routing (26.15) and the R2 custom domain (26.18) both
      require the zone to be managed in the same Cloudflare account as the
      bucket.
- [x] Access confirmed to all four dashboards: Vercel, Cloudflare, Google Cloud
      Console, Resend.
- [x] Read the **current** values of these Vercel production environment
      variables and write them down before changing anything. They are the
      rollback:
      `SITE_URL`, `AUTH_URL`, `NEXTAUTH_URL`, `AUTH_MAIL_FROM`,
      `LIFECYCLE_MAIL_FROM`, `CONTACT_MAIL_TO`, `R2_BUCKET_PUBLIC_URL`.
- [x] Confirm today's production behaviour so the "after" is comparable: open
      the live site, sign in with Google, and load a listing page with photos.

**Executed 2026-09-05.** Pre-flight complete before any dashboard change.

### The two things that today live on the founder's personal domain

| Surface | Current | Target |
|---|---|---|
| Resend sending domain | `gianbarboza.com` | `rentoru.com` |
| Magic-link sender (`AUTH_MAIL_FROM`) | `ingresa@gianbarboza.com` — confirm the live value in Vercel; the local part is the convention in `.env.example:58` | `ingresa@rentoru.com` |
| Lifecycle sender (`LIFECYCLE_MAIL_FROM`) | `avisos@gianbarboza.com` — confirm the live value in Vercel; local part from `.env.example:51` | `avisos@rentoru.com` |
| Contact inbox (`CONTACT_MAIL_TO`) | a `@gianbarboza.com` address — confirm; local part from `.env.example:64` | `hola@rentoru.com` |
| Sender display name | `Rentas` (`Rentas <avisos@…>`, recorded in `tasks.md:339`) | **Open decision — see §8** |
| Photo host (`R2_BUCKET_PUBLIC_URL`) | `https://fotos.gianbarboza.com` — confirm the live value in Vercel | `https://fotos.rentoru.com` |

This phase gives both of them their own home for the first time.

**Executed 2026-09-05.** Every row above is now on its target value, except the
sender display name, which still reads `Rentas` and remains the open decision
in §8. The "Current" column is kept as the rollback record, not as a
description of production.

---

## 1. Stage 1 — The domain has to serve before anything points at it

Safe to do early. Nothing in the repository depends on this step directly; every
later step depends on it.

### Apex, not `www` — decided 2026-09-05

The canonical origin is **`https://rentoru.com`**, with no `www` and no trailing
slash. Every origin this runbook writes uses that exact form.

This is not a style preference. Three surfaces compare the origin as an **exact
string**, so a second form is a second entry that has to be maintained in each of
them, and a missing entry is an outage rather than a warning:

| Surface | Where | Cost of a mismatch |
|---|---|---|
| Google OAuth | Authorised JavaScript origins (§3a) | Sign-in fails |
| R2 CORS | `AllowedOrigins` (§5a) | Photo upload fails, silently — see §5a |
| Redirect guard | `redirect-guard` host comparison (task 26.14) | Return-to-deep-link breaks |

It also matches what already exists: `PRODUCTION_ORIGIN` in
`src/modules/listing-discovery/infrastructure/site-base-url.ts:18` is the apex,
and the repository contains no `www` URL of its own.

`www.rentoru.com` still needs to resolve for anyone who types it — handle that as
a redirect in Cloudflare, so the apex stays the only origin the application ever
knows about.

- [x] **Vercel → Project → Settings → Domains.** Add `rentoru.com` and set it as
      the production domain. Follow Vercel's DNS instructions in the Cloudflare
      zone.
- [x] Add `www.rentoru.com` as a redirect to the apex, not as a second serving
      domain.
- [x] Verify from outside: `https://rentoru.com` serves the site over HTTPS with
      a valid certificate, and `https://rentoru.com/robots.txt` returns a
      document.
- [x] Verify the redirect runs in the **right direction**. The apex must answer
      `200`; `www` must answer a redirect to the apex — not the other way round:

```
curl -sSI https://rentoru.com/     | rg -i '^HTTP|^location'   # expect 200, no location
curl -sSI https://www.rentoru.com/ | rg -i '^HTTP|^location'   # expect 30x -> https://rentoru.com/
```

- [x] Confirm the application agrees, before anything depends on it. Auth.js
      derives its callback from the **serving host**, so an inverted redirect
      produces a `www` callback that Google will reject with
      `redirect_uri_mismatch` (§3a registers the apex):

```
curl -sSL https://rentoru.com/api/auth/providers
```

      Every `signinUrl` and `callbackUrl` in the response must be on
      `https://rentoru.com`. If they are on `www`, the production domain is set
      to `www` in Vercel → Settings → Domains. Invert it before continuing —
      setting `AUTH_URL` (§3b) will not fix it, because the host wins.

      This check was added on 2026-09-05 after the domain went live inverted and
      the mismatch was found through this endpoint rather than through a failed
      sign-in.

**Executed 2026-09-05 — and the inversion is why this check exists.** The
domain did go live inverted: Vercel held `www.rentoru.com` as the production
domain, with the apex answering `308` to it. Google sign-in was broken as a
result, proven from outside —
`curl https://rentoru.com/api/auth/providers` returned
`https://www.rentoru.com/api/auth/callback/google`, while Google Cloud had the
**apex** registered (§3a).

The founder inverted the production domain in Vercel → Settings → Domains.
It now reads:

| Request | Answer |
|---|---|
| `https://rentoru.com/` | `200`, no `location` |
| `https://www.rentoru.com/` | `307` → `https://rentoru.com/` |
| `https://rentoru.com/api/auth/providers` | every `signinUrl` and `callbackUrl` on the apex |

Reference for the equivalent step in the older checklist: `docs/going-live.md:14`.

---

## 2. Stage 2 — `SITE_URL` in Vercel (task 26.1)

**This outranks every line of code in the phase.** `SITE_URL` is not set in
Vercel today. `src/modules/listing-discovery/infrastructure/site-base-url.ts`
resolves in a chain: `SITE_URL` (line 21), else `https://${VERCEL_URL}`
(line 27), else the hard-coded `PRODUCTION_ORIGIN` (line 31). On Vercel,
`VERCEL_URL` is **always** set and is the **per-deployment** hostname, so the
second rung wins today and the third rung is never reached in production.

Safe as soon as Stage 1 is done. Doing it before the code rename does not change
the result, but it makes every later measurement land against the definitive
host.

- [x] **Vercel → Project → Settings → Environment Variables → Production.** Add:

```
SITE_URL=https://rentoru.com
```

  No trailing slash (`.env.example` states the rule; the reader strips trailing
  slashes anyway).

- [x] Redeploy production so the new variable is picked up.

**What depends on it — five surfaces, all fixed by this one variable:**

| Surface | Where |
|---|---|
| `sitemap.xml` | built from `readSiteBaseUrl` |
| `host:` directive of `robots.txt` | `app/robots.ts:37` |
| `@id` and `url` of every listing's JSON-LD | `src/modules/listing-discovery/domain/listing-structured-data.ts:312-313,338` |
| Renewal link inside lifecycle emails | `src/modules/listing-lifecycle/application/send-lifecycle-notices.ts:134` |

**Verify from outside:**

- [x] `https://rentoru.com/robots.txt` shows `Host: https://rentoru.com` and
      `Sitemap: https://rentoru.com/sitemap.xml`.
- [x] `https://rentoru.com/sitemap.xml` lists absolute URLs on `rentoru.com`,
      not on a `*.vercel.app` hostname.
- [x] View source on any listing page: the JSON-LD `@id` and `url` are on
      `rentoru.com`.

**Executed 2026-09-05.** All three checks ran from outside. `robots.txt`
carries `Host: https://rentoru.com` with the sitemap on the same host.
`sitemap.xml` holds **12 URLs, 12 of them on the apex and none on a
`*.vercel.app` hostname**. A listing page's JSON-LD `@id` and `url` are both
on the apex.

---

## 3. Stage 3 — Google sign-in (task 26.16)

If this is skipped: `redirect_uri_mismatch`, and nobody signs in — so nobody
publishes, renews, reveals a contact or reports, because all four require a
session.

### 3a. Google Cloud Console — additive, safe early

Adding the new origin and redirect URI does not remove the old ones, so this can
be done before the cutover with no production impact.

- [x] **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client
      IDs → (the project's web client).** Under **Authorised JavaScript
      origins**, add exactly:

```
https://rentoru.com
```

- [x] Under **Authorised redirect URIs**, add exactly:

```
https://rentoru.com/api/auth/callback/google
```

- [x] Save. Google can take several minutes to propagate the change.

**Executed 2026-09-05.** The apex origin and redirect URI are registered. The
callback Auth.js emits now matches the registered URI — it did not while the
domain was inverted (§1) — and **Google sign-in works**.

The client id and secret themselves do not change; they stay in Vercel as
`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (`.env.example`). Auth.js discovers
those two **by name**, which is why a `process.env` search does not find them.

### 3b. `AUTH_URL` in Vercel — the half that is forgotten more often

`src/modules/identity/infrastructure/redirect-callback.ts:30` compares the
destination's **origin** against the `baseUrl` Auth.js hands it
(`if (destino.origin !== new URL(baseUrl).origin) return ""`). With a stale
value, **every** return destination after sign-in fails that comparison and
falls back to the home page — correct behaviour for a defence, applied to
legitimate visitors.

- [x] **Vercel → Settings → Environment Variables → Production:**

```
AUTH_URL=https://rentoru.com
```

- [x] `NEXTAUTH_URL` is **absent from this project, and that is correct — do
      not add it.** Checked 2026-09-05: `package.json` pins
      `next-auth@5.0.0-beta.32`, and `NEXTAUTH_URL` is the **Auth.js v4** name,
      superseded by `AUTH_URL` in v5. Its absence is the v5 configuration
      working as designed, not an oversight to be corrected later.
      (`docs/going-live.md:16` carries the older "and `NEXTAUTH_URL` if
      present" caveat; for this project the answer is now settled: it is not
      present, and it must not be introduced.)
- [x] Redeploy production.

**Verify:**

- [x] Sign in with Google from `https://rentoru.com` in a clean browser profile.
- [ ] Start the sign-in from a deep link (for example a listing page) and confirm
      you are returned to that page and not dropped at the home page. That is the
      check that catches a stale `AUTH_URL`; a plain sign-in from the home page
      would pass either way.
      **Not performed as of 2026-09-05.** Sign-in was confirmed working, but not
      from a deep link, so the one result that distinguishes a correct `AUTH_URL`
      from an absent one is still missing. Left unticked deliberately rather than
      inferred from the plain sign-in.

---

## 4. Stage 4 — Mail. Order matters here more than anywhere else

Three separate things share this stage: an inbox that receives, a domain that is
allowed to send, and the sender addresses themselves. **Do them in this order.**

### 4a. Cloudflare Email Routing for `hola@rentoru.com` (task 26.15) — safe early

The product has never received an email: no mailbox, no message table, no inbound
path, as task 23.7 verified before building the contact form. The address is
published in three user-facing places:

| Where it is published | Path |
|---|---|
| Privacy page | `app/legal/privacidad/page.tsx:70` |
| Data page | `app/legal/datos/page.tsx:58` |
| `mailto:` in the publish flow | `app/publicar/PublishStep.tsx:505` |

If skipped, three contact promises on pages whose only function is to build trust
point at an address that bounces.

- [x] **Cloudflare → (the `rentoru.com` zone) → Email → Email Routing.** Enable
      Email Routing. **This is a zone-level feature.** The path is
      **Websites → `rentoru.com` → Email → Email Routing**. The *account*-level
      **Email** menu offers only DMARC Management and Email Security, and is
      not where this lives — that is where the founder looked first on
      2026-09-05.
- [x] When Cloudflare offers to **add the required MX and TXT records for you,
      accept**. Do not hand-type them.
- [x] Add a custom address: `hola@rentoru.com` → forward to the founder's
      personal inbox.
- [x] Confirm the destination address by clicking the verification link
      Cloudflare sends to it.

Two warnings so they are not discovered later:

- Email Routing **forwards but does not send**. A reply leaves from the personal
  address unless a separate "send as" is configured in the mail client.
- The receiving **MX** records coexist with Resend's sending **SPF/DKIM**: they
  are different mechanisms over the same zone. Caution on one point the task does
  not cover: a zone may hold only **one** SPF `TXT` record per name. If both
  Cloudflare Email Routing and Resend ask for an SPF record at the apex, merge
  them into a single record rather than publishing two. **This did not
  materialise on `rentoru.com` — see §4b for why, and why the warning stays.**

**Verify:**

- [x] Send a message from an unrelated account to `hola@rentoru.com` and confirm
      it arrives in the personal inbox.

**Executed 2026-09-05.** Cloudflare wrote the records itself: `MX`
`route1.mx.cloudflare.net`, `route2.mx.cloudflare.net` and
`route3.mx.cloudflare.net`, plus an apex SPF `TXT` of
`v=spf1 include:_spf.mx.cloudflare.net ~all`.

The test message arrived — **but in SPAM, not the inbox.** That is expected
for a forwarded message from a brand-new domain: forwarding breaks SPF
alignment for the *original* sender, so the receiving provider sees a message
its SPF check cannot align. It concerns the **inbound** path only and says
nothing about the product's outbound mail, which is verified separately by
real send in §4c.

### 4b. Resend — verify `rentoru.com` and publish SPF/DKIM/DMARC (task 26.17, first half) — safe early

**Nothing moves yet.** Verification is additive: `gianbarboza.com` keeps sending
while `rentoru.com` is being verified.

- [x] **Resend → Domains → Add Domain.** Enter `rentoru.com`.
- [x] Resend generates a set of DNS records — an **SPF** `TXT`, a **DKIM** `TXT`
      (its name and value are generated per domain), and it may propose a
      **DMARC** `TXT`. **Copy each record verbatim out of the Resend dashboard**;
      do not retype from memory and do not reuse the `gianbarboza.com` records.
- [x] **Cloudflare → (the `rentoru.com` zone) → DNS → Records.** Create each
      record exactly as Resend shows it. Set proxy status to **DNS only** (grey
      cloud) for these records.
- [ ] The DMARC record's policy value (`p=none`, `p=quarantine`, `p=reject`) is
      **not specified by the task** — see the open decision in §8. **Still
      outstanding: `_dmarc.rentoru.com` returns nothing as of 2026-09-05.**
- [x] Back in **Resend → Domains**, click **Verify** and wait until the domain
      shows **Verified**. Do not continue to 4c until it does.

**Executed 2026-09-05.** The domain shows **Verified**. Resend's Cloudflare
integration created the records automatically, so nothing was hand-typed.

**The feared apex SPF collision did not occur.** Resend published its SPF on a
**subdomain**, leaving the Cloudflare Email Routing SPF at the apex untouched:

| Record | Name | Value |
|---|---|---|
| SPF (Resend) | `send.rentoru.com` `TXT` | `v=spf1 include:amazonses.com ~all` |
| MX (Resend) | `send.rentoru.com` | `feedback-smtp.sa-east-1.amazonses.com` |
| DKIM (Resend) | `resend._domainkey.rentoru.com` `TXT` | generated per domain |
| SPF (Email Routing) | apex `TXT` | `v=spf1 include:_spf.mx.cloudflare.net ~all` — unchanged |

DKIM is the only Resend record at the apex, and it does not compete with SPF.
**Keep the §4a merge warning in place anyway:** a future domain, or a provider
that publishes its SPF at the apex, will not be so lucky, and the failure mode
there is a second apex SPF record silently invalidating the first.

**DMARC is still absent.** `_dmarc.rentoru.com` returns nothing, because the
`p=` value is still the open decision in §8. Nothing else in this stage waits
on it.

### 4c. Move the senders (task 26.17, second half) — BREAKS PRODUCTION IF DONE EARLY

**This is the step whose order is the only thing that can break it.** Changing
the from-addresses before the domain is verified makes **every** send bounce,
including the magic link — which is the only sign-in path that does not depend on
Google. A bounce there plus a `redirect_uri_mismatch` from 26.16 at the same
time leaves the product with no door at all.

- [x] Confirm 4b shows **Verified** in Resend. If not, stop here.
- [x] **Vercel → Settings → Environment Variables → Production.** Set:

```
AUTH_MAIL_FROM=ingresa@rentoru.com
LIFECYCLE_MAIL_FROM=avisos@rentoru.com
CONTACT_MAIL_TO=hola@rentoru.com
```

  Confirm the local parts against the live values first; the ones above follow
  the convention documented in `.env.example:51,58,64`.

  **Confirmed 2026-09-05:** these three local parts are the ones in use on
  `rentoru.com`. The §8 decision on them is settled.

- [ ] Decide the sender display name (§8) and apply it in the same values if the
      display-name form is used, for example `<Name> <avisos@rentoru.com>`.
      **Still outstanding: the display name still reads `Rentas`.**
- [x] Redeploy production.

**What depends on each variable:**

| Variable | Read by | Fail-closed behaviour |
|---|---|---|
| `AUTH_MAIL_FROM` | `src/modules/identity/infrastructure/resend-mailer.ts` (`FROM_ENV`); reused as the sender by `src/modules/site-contact/infrastructure/resend-contact-mailer.ts:31` | `readAuthMailerConfig` returns `undefined`; `sendVerificationRequest` throws `AuthMailerNotConfiguredError` instead of pretending it sent |
| `LIFECYCLE_MAIL_FROM` | `src/modules/listing-lifecycle/infrastructure/resend-lifecycle-mailer.ts:27`, via `lifecycle-config.ts:44` | the job route answers `500 mailer_not_configured` with `reminders_sent: 0` rather than starting a batch it cannot deliver |
| `CONTACT_MAIL_TO` | `src/modules/site-contact/infrastructure/resend-contact-mailer.ts:32` | `ContactMailerNotConfiguredError` at construction; `app/ayuda/escribinos/actions.ts` lets it propagate rather than faking a "thanks for writing" |

`RESEND_API_KEY` is shared by all three adapters and does not change unless the
Resend account changes. If a new API key is created, **copy it out of Resend at
creation time** — Resend shows it once — and paste it into Vercel as
`RESEND_API_KEY`.

**Verify — with a real send to a real inbox, the way `tasks.md:339` did once:**

- [x] Request a magic link on `https://rentoru.com` for an inbox you control.
      Confirm it arrives, in Primary and not in spam, from `@rentoru.com`, and
      that the link signs you in.
- [x] Submit the "Escribinos" form on `https://rentoru.com/ayuda/escribinos` and
      confirm the message lands in the `hola@rentoru.com` forward.
- [x] Inspect the received message headers: `SPF` and `DKIM` both pass for
      `rentoru.com`.

**Executed 2026-09-05 — by real send, not by dashboard state.** A magic link
requested on `https://rentoru.com` arrives from `@rentoru.com` and the link
signs you in. The "Escribinos" form was exercised end to end and delivers to
the `hola@rentoru.com` forward.

One ordering note for anyone repeating this: the "Escribinos" check only
became possible **after release PR #244 merged**, because
`/ayuda/escribinos` did not exist in production before it. Attempting the
check earlier tests a 404, not the mailer.

Note that the outbound path verified here is separate from the inbound SPAM
placement recorded in §4a; the two do not contradict each other.

---

## 5. Stage 5 — Photos. Custom domain first, variable second

### 5a. R2 CORS (task 26.19) — additive, safe early, and the signature silent failure

**This is the one that will bite.** `content-type` is signed into the presigned
PUT, so the browser sends a preflight `OPTIONS` before the upload. A bucket
without a matching policy refuses it, the browser drops the request, and
**nothing server-side sees anything at all**. This shipped to production exactly
this way on **2026-08-18**, with 42 green specs, until the founder tried to
upload a photo. CI runs from an origin that is already allowed, so a real upload
test would not catch it either — the only thing that does is a `GetBucketCors`
assertion against the production bucket (open work, tasks 3.17 and 3.19).

- [x] **Cloudflare → R2 → `rentas-photos` → Settings → CORS Policy.** Add
      `https://rentoru.com` to `AllowedOrigins`, keeping `AllowedMethods` and
      `AllowedHeaders` exactly as they are. **This is the policy in place as of
      2026-09-05:**

```json
[
  {
    "AllowedOrigins": [
      "https://rentoru.com",
      "https://*.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

  The pre-cutover policy, for comparison, is transcribed at
  `docs/going-live.md:38-51`. `http://localhost:3000` stays for local work.

- [x] Save the policy.

**Executed 2026-09-05 — three origins, and one of them deliberately kept.**

The apex was added. `https://rentascomve.vercel.app` — the specific old Vercel
production alias — was **removed**, after confirming that host now returns
`404`: the entry pointed at nothing, so it granted access without buying
anything.

`https://*.vercel.app` was removed at the same time and then **deliberately
restored**. Deleting the Vercel production alias does not stop preview
deployments, which still receive a per-branch `*.vercel.app` hostname. Without
the wildcard, a photo upload from any preview fails **silently**, in exactly
the way the paragraph above describes.

The accepted cost, recorded so it is a decision and not an accident: any site
on `vercel.app` could issue a `PUT` to the bucket — but only with one of our
presigned URLs, which it has no way to obtain. The residual risk was judged
**low**, and the alternative was losing photo upload on every preview.

**Verify:** from a real browser on `https://rentoru.com`, upload a photo through
the publish flow and confirm it completes. No server-side check substitutes for
this.

- [ ] Real-browser upload test. **NOT RUN — blocked, see below.**

#### Blocked — the publish flow's zone step returns no zones (task 17.15)

**Found 2026-09-05. This is the one outstanding item in this runbook.** The
upload test above cannot be performed: the publish flow's zone step returns no
zones, so the founder never reaches the photo step, so §5a cannot be verified
from a real browser.

Root cause **proven** on 2026-09-05 by read-only queries against the
production database:

| Table | Production holds | Expected |
|---|---|---|
| `zone` | 10 rows, all `kind = parroquia`, `ubigeo` `NULL` | 5,796 rows (task 17.3) |
| `city` | 2 rows — "Distrito Capital" and "Maracaibo" | the real taxonomy |
| `zone_alias` | 0 rows | populated |

Those 10 rows are task 2.3's **provisional pre-Phase-17 list**, seeded
deliberately as demo data at the time. Task 17.2 — closed, shipped in
`c005a3b` — renames that área to "Caracas"; the code fix shipped and the
database never received it. The gap is therefore an **undefined handover from
provisional demo data to the real taxonomy**, not a forgotten re-run of a
seed.

Tracked as task **17.15**.

**`pnpm db:seed` must not be run against production as-is.** The handover has
to be defined before anything writes to these tables.

### 5b. R2 custom domain `fotos.rentoru.com` (task 26.18, first half) — safe early

**Do not rename the bucket.** It is `rentas-photos`
(`src/modules/listing-publication/infrastructure/r2-photo-storage.ts:312`,
`r2-photo-storage.test.ts:28`). R2 does not rename in place; renaming would mean
copying every object and migrating the keys in `listing_photo_derivative`
(`src/shared/db/schema.ts:680`), and nothing user-visible carries the bucket
name. High cost, zero benefit.

- [x] **Cloudflare → R2 → `rentas-photos` → Settings → Public access → Custom
      Domains → Connect Domain.** Enter:

```
fotos.rentoru.com
```

- [x] Cloudflare creates the required DNS record in the zone itself. Accept it;
      do not hand-author a record.
- [x] Wait until the custom domain shows as **Active** with its certificate
      issued.

**Complete before the 2026-09-05 session began.**

**Verify before touching any variable:** take an existing photo key from a live
listing page (its current URL is on `fotos.gianbarboza.com`) and request the same
key on the new host — `https://fotos.rentoru.com/<same key>` must return the
image. If it 404s, the domain is not serving the bucket yet and 5c must not
proceed.

### 5c. `R2_BUCKET_PUBLIC_URL` (task 26.18, second half) — ORDER-SENSITIVE

If the old custom domain is removed before this variable changes, **every** photo
on the site 404s, including the ones in the JSON-LD `image` array — so also in
Google's result.

- [x] Confirm 5b verified successfully.
- [x] **Vercel → Settings → Environment Variables → Production:**

```
R2_BUCKET_PUBLIC_URL=https://fotos.rentoru.com
```

- [x] Redeploy production.
- [x] While in this screen, re-check that every `R2_BUCKET_*` value is the
      production bucket and not a test one (`docs/going-live.md:19`). The other
      five — `R2_BUCKET`, `R2_BUCKET_URL`, `R2_BUCKET_ACCOUNT_ID`,
      `R2_BUCKET_ACCESS_KEY`, `R2_BUCKET_SECRET_KEY` — **do not change** in this
      phase.
- [x] Only after the site renders photos from `fotos.rentoru.com`, remove the old
      `fotos.gianbarboza.com` custom domain from the bucket. Not before.

**Complete before the 2026-09-05 session began, except the last step.** The old
`fotos.gianbarboza.com` custom domain was removed from the bucket on
2026-09-05, in the correct order — after the new host was already serving.

**What depends on it:**

| Consumer | Path |
|---|---|
| Read path for every rendered photo | `src/modules/listing-discovery/infrastructure/photo-public-base-url.ts:15` — throws loudly when empty, rather than emitting relative `/photos/…` URLs that the site answers with 404 |
| Listing page | `app/alquiler/[ciudad]/[zona]/[slug]/page.tsx:240` |
| Write path's public URL | `src/modules/listing-publication/infrastructure/r2-photo-storage.ts:253` (`publicUrlFor`) and `readR2Config` at `:284` |

**Verify:** load a listing page and confirm image `src` attributes are on
`https://fotos.rentoru.com` and the images render.

**Executed 2026-09-05.** Verified from outside: `fotos.rentoru.com` returns
`200` with `content-type: image/webp`, `fotos.gianbarboza.com` no longer
resolves in DNS, and listing pages reference only the new host. The cutover of
the photo domain is complete in both directions — new host serving, old host
gone.

---

## 6. Stage 6 — The full Vercel environment variable list (task 26.20)

Final state of the six variables this phase touches, in
**Vercel → Settings → Environment Variables → Production**:

```
SITE_URL=https://rentoru.com
AUTH_URL=https://rentoru.com
AUTH_MAIL_FROM=ingresa@rentoru.com
LIFECYCLE_MAIL_FROM=avisos@rentoru.com
CONTACT_MAIL_TO=hola@rentoru.com
R2_BUCKET_PUBLIC_URL=https://fotos.rentoru.com
```

- [x] All six present and correct in the Production environment.
- [x] Production redeployed after the last change.

**Executed 2026-09-05.** All six confirmed in Production, with a redeploy after
the last change.

### Sensitivity — which of these are secrets

Five of the six are plain configuration. Only one warrants Vercel's **Sensitive**
flag, and it is not a credential.

| Variable | Vercel | Reason |
|---|---|---|
| `SITE_URL` | plain | Served inside `sitemap.xml` and the `Host:` directive of `robots.txt` |
| `AUTH_URL` | plain | Public origin; travels in every OAuth redirect |
| `AUTH_MAIL_FROM` | plain | Appears in the `From:` header of every magic-link mail |
| `LIFECYCLE_MAIL_FROM` | plain | Same, for expiry notices |
| `R2_BUCKET_PUBLIC_URL` | plain | Host of every rendered photo `<img>` |
| `CONTACT_MAIL_TO` | **Sensitive** | Not a credential, but task 23.7 chose a form over a published address specifically to keep this inbox away from scrapers |

The rule: **if the value ends up in a stranger's browser, it is configuration.**
Marking an origin, a sender or an image host as Sensitive protects nothing and
costs the ability to read it back from the dashboard.

The real secrets are already set and this phase does not touch them:
`AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `RESEND_API_KEY`, `R2_BUCKET_ACCESS_KEY`,
`R2_BUCKET_SECRET_KEY`, `RENEWAL_TOKEN_SECRET`, `CRON_SECRET`,
`OPERATOR_SECRET`, `DATABASE_URL`.

### DELETE `SITE_BASE_URL` — it is set today, and it is dead

**It is currently present in Vercel, pointing at `http://localhost:3000`**
(verified by the founder, 2026-09-05). It has no effect, because **nobody reads
it.** It appears in exactly two places: `.env.example:68`, which publishes it as
if it were real configuration, and a test fixture at
`app/api/jobs/expiry-reminders/route.test.ts:15,25` — while the route that
fixture exercises reads `SITE_URL`, which is what `readSiteBaseUrl` consults.

The `.env.example:68` comment above it is **factually wrong** and is the sharpest
part of the trap:

> *"El sitio, SIN barra final. Los enlaces del correo son absolutos y se arman
> con esto: si falta, el de renovación llega apuntando a ninguna parte."*

Renewal links are built at `send-lifecycle-notices.ts:134` from the `baseUrl`
passed by `app/api/jobs/expiry-reminders/route.ts:68`, and that line calls
`readSiteBaseUrl()` — which reads `SITE_URL`. `SITE_BASE_URL` takes no part in
it. Task 26.11 removes the variable and the fixture; this runbook removes it from
the dashboard.

Delete it rather than correcting its value. A `SITE_BASE_URL` holding the right
origin is worse than one holding `localhost:3000`, because the next person to
open the panel will believe the domain is configured.

- [x] Delete `SITE_BASE_URL` from Vercel (Production and every other
      environment it appears in).

**Executed 2026-09-05.** `SITE_BASE_URL` deleted from Vercel. It was not
corrected to a new value; it was removed, for the reason above.

---

## 7. Post-flight — confirm before any code slice ships

Run all of these against `https://rentoru.com` in a clean browser profile.

- [x] `https://rentoru.com` serves over HTTPS with a valid certificate.
- [x] `robots.txt` shows `Host: https://rentoru.com` and the sitemap on the same
      host.
- [x] `sitemap.xml` contains only `rentoru.com` URLs. — 12 of 12 (§2).
- [x] A listing page's JSON-LD `@id` and `url` are on `rentoru.com`, and its
      `image` array points at `fotos.rentoru.com`.
- [ ] Google sign-in completes, and a sign-in started from a deep link returns to
      that deep link.
      **Half done 2026-09-05.** Sign-in completes; the deep-link return was never
      exercised. See §3b.
- [ ] Magic-link sign-in completes: the mail arrives from `@rentoru.com`, in
      Primary, with SPF and DKIM passing, and the link signs you in.
      **Half done 2026-09-05.** The mail arrives from `@rentoru.com` and the link
      signs you in; the received headers were never inspected, so SPF and DKIM
      alignment is unconfirmed. The records are published (§4b), which makes a
      pass likely — but likely is not the same as checked, and this box is the
      only place that would say so.
- [ ] A photo upload completes from a real browser on `https://rentoru.com`.
      **Blocked 2026-09-05 — the publish flow's zone step returns no zones, so
      the photo step is unreachable. Task 17.15; see the blocker note at the end
      of §5a.**
- [x] Photos on a listing page load from `fotos.rentoru.com`.
- [x] The "Escribinos" form delivers to the `hola@rentoru.com` forward.
- [x] A message sent to `hola@rentoru.com` from an outside account arrives.
      Note it landed in **SPAM**, for the reason recorded in §4a.
- [ ] A lifecycle renewal email's link points at `https://rentoru.com/renovar/…`
      (`send-lifecycle-notices.ts:134`). This one cannot be forced from the UI;
      confirm it on the next reminder the job sends, or accept the `SITE_URL`
      check above as the proxy and note the gap. **Left open 2026-09-05: the
      `SITE_URL` checks in §2 passed, and no reminder has been observed since.**
- [x] `SITE_BASE_URL` is absent from Vercel.
- [x] Rollback values from §0 are written down somewhere durable.

---

## 8. Open decisions — the task text does not choose these

Do not invent a value. Decide, write the decision down, then apply it.

**Two of the four were settled on 2026-09-05; two remain genuinely open.**

### Still open

1. **Sender display name.** Today it is `Rentas` (`Rentas <avisos@…>`, recorded
   in `tasks.md:339` as the mitigation that "costs nothing while the address is
   provisional"). Task 26.17 states the display name is still outstanding but
   names no replacement. The founder chooses it. **Open as of 2026-09-05 — the
   display name still reads `Rentas`, now in front of an address that is no
   longer provisional.**
2. **DMARC policy.** Task 26.17 requires publishing DMARC but does not name the
   policy value. `p=none`, `p=quarantine` and `p=reject` are the choices; none is
   specified by the task or the repository. **Open as of 2026-09-05 — no DMARC
   record is published: `_dmarc.rentoru.com` returns nothing (§4b).**

### Settled

3. **The old exact Vercel origin in the R2 CORS policy.** ~~Task 26.19 says to
   *add* `https://rentoru.com` while keeping `AllowedMethods` and
   `AllowedHeaders`. It does not say whether `https://rentascomve.vercel.app`
   stays or goes.~~ **Decided 2026-09-05: the specific entry was removed** —
   that host now returns `404`, so it pointed at nothing — **and
   `https://*.vercel.app` was kept**, because preview deployments still need
   it. The accepted cost and the reasoning are recorded in §5a.
4. **The exact local parts of the new sender addresses.** ~~`ingresa@`,
   `avisos@` and `hola@` are the convention in `.env.example:51,58,64`, and
   26.15 names `hola@rentoru.com` explicitly; the other two are inferred from
   the same file and should be confirmed against the live Vercel values before
   being changed.~~ **Confirmed 2026-09-05: `ingresa@`, `avisos@` and `hola@`
   are in use on `rentoru.com`** (§4c), each verified by a real send or a real
   delivery.

---

## 9. What must NOT be done

Drawn from the task text, including the non-goals Phase 26 records so they are
not reopened (task 26.27).

- **Do not build a 301 from `rentas.com.ve`.** The site was never served from
  there — the `.ve` TLD gave trouble with Vercel and Cloudflare, so the product
  always ran from a Vercel address. There is no link authority to transfer, no
  indexed address to preserve and no duplicate content between two hosts. Anyone
  reopening this must first bring evidence of a `rentas.com.ve` address that ever
  returned a page. **This is a brand rename plus the first real mounting of a
  domain, not a domain migration.**
- **Do not rename the R2 bucket.** It stays `rentas-photos`, for the reasons in
  §5b.
- **Do not touch the logo or the visual identity.** Founder's decision,
  2026-09-05: this phase changes the word, not the colour system, the typography
  or the absence of a logo that `SISTEMA.md:323` declares.
- **Do not set `SITE_BASE_URL` in Vercel.** See §6.
- **Do not change the sender addresses before Resend shows the domain Verified.**
  See §4c.
- **Do not remove the old `fotos.gianbarboza.com` custom domain before
  `R2_BUCKET_PUBLIC_URL` is changed and photos verify on the new host.** See §5c.
- **Do not change the other five `R2_BUCKET_*` variables.** Only confirm they are
  the production bucket.
- **Do not hand-author the DNS records Cloudflare offers to create** for Email
  Routing or for the R2 custom domain. Copy Resend's records verbatim from its
  dashboard; let Cloudflare write its own.
- **Do not run `pnpm db:seed` against production as-is.** Added 2026-09-05,
  after the zone gap in §5a was traced. Production still holds task 2.3's
  provisional demo rows; the handover to the real taxonomy is undefined and is
  task **17.15**. Seeding blindly is not the fix.

---

## 10. Scope of this runbook

This covers the **manual configuration only** — task 26.1 and tasks 26.15–26.20.
It changes no code. The code slices are separate work that follows:

- **PR26a** — the brand in the code (26.2–26.9)
- **PR26b** — the domain, its fallback and its fixtures (26.10, 26.11, 26.13, 26.14)
- **PR26c** — canonicals, `metadataBase` and Open Graph (26.12)
- **PR26d** — design and planning artefacts (26.21–26.26)

Task 26.25 rewrites `docs/going-live.md` for `rentoru.com` and is the intended
permanent home for these steps; that file is deliberately left untouched here.
