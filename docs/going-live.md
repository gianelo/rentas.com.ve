# Changing the domain

Every item below lives **outside the repository**, in a dashboard. None of it
is covered by a test, and most of it fails silently or fails only in a real
browser — which is why it is written down rather than remembered.

The trigger is pointing the product at a new host. It was written for the jump
off `rentascomve.vercel.app`, and it was executed for real on **2026-09-05**,
when the product became `rentoru.com`. That run has its own record —
`docs/rentoru-cutover.md`, the runbook as it was actually carried out, section
by section. **This file is the reusable list; that one is the history.** Do the
whole list in one sitting: several of these break each other half-done.

Throughout, `<domain>` is the host being moved to. Today it is `rentoru.com`.

## The list

| # | Where | What | How it fails if forgotten |
|---|---|---|---|
| 1 | Vercel → Domains | Add the domain, make it the production one | Nothing serves it |
| 2 | Google Cloud → OAuth client | Authorised **redirect URI** `https://<domain>/api/auth/callback/google`, and **JavaScript origin** `https://<domain>` | Sign-in returns `redirect_uri_mismatch`. **Nobody can log in**, so nobody can publish, renew, reveal a contact or report — all four need a session |
| 3 | Vercel → env | `AUTH_URL` (and `NEXTAUTH_URL` if present) to the new origin | Auth.js builds callbacks against the old host. `src/modules/identity/infrastructure/redirect-callback.ts:30` compares the destination origin against the `baseUrl` Auth.js hands it, so with a stale value **every** return destination after sign-in fails the comparison and falls back to the home page — a defence behaving correctly, applied to legitimate visitors |
| 4 | Cloudflare → R2 → bucket → CORS | Add the new origin to `AllowedOrigins`, keep `AllowedMethods: ["PUT"]` and `AllowedHeaders: ["content-type"]` | **The browser blocks every photo upload before it leaves.** No server log records it, because the request never reaches a server |
| 5 | Cloudflare → R2 → custom domain | Point `fotos.<domain>` at the bucket, then set `R2_BUCKET_PUBLIC_URL` to it | Photos keep loading from `r2.dev`, which Cloudflare documents as development-only: no caching, rate limited, billed read operations |
| 6 | Vercel → env | Re-check every `R2_BUCKET_*` value is the production bucket, not a test one | Uploads land somewhere nobody renders from |
| 7 | Resend → Domains | Verify `<domain>`, publish SPF, DKIM and DMARC, and **only then** move `AUTH_MAIL_FROM` and `LIFECYCLE_MAIL_FROM` | Moving the sender addresses before the domain verifies bounces **every** send, magic link included — and the magic link is the only door that does not go through Google |
| 8 | Cloudflare → Email Routing | Forward `hola@<domain>` to a real inbox | The contact address published on the legal pages bounces, on the pages whose only job is to earn trust |
| 9 | Vercel → env | The full set: `SITE_URL`, `AUTH_URL`, `AUTH_MAIL_FROM`, `LIFECYCLE_MAIL_FROM`, `CONTACT_MAIL_TO`, `R2_BUCKET_PUBLIC_URL` | `SITE_URL` is the first rung of `site-base-url.ts`; without it `VERCEL_URL` wins and every canonical, sitemap entry and `host:` directive names a per-deployment address |

### Order is the only thing that can break items 5 and 7

Both have a half that must go second:

- **Photos.** Point `fotos.<domain>` at the bucket **first**, move
  `R2_BUCKET_PUBLIC_URL` **after**. Removing the old custom domain before
  changing the variable puts **every** photo on the site at 404, including the
  ones in the JSON-LD `image` array — so also in the Google result.
- **Mail.** Verify the domain **first**, move the senders **after**. Check it
  with a real send to a real inbox, not with a green build.

### What does NOT go in the env list

**Do not set `SITE_BASE_URL`.** Nothing reads it. It survives only in
`.env.example:68` and in one test fixture, and setting it gives the feeling of
having configured the domain without having configured anything.

### What is not part of a rename

- **No 301 from the old host** unless it actually served pages. A name that
  never resolved to the product has no link authority to transfer, no indexed
  addresses to preserve and no duplicate content to resolve.
- **The R2 bucket is not renamed.** R2 cannot rename in place; doing it means
  copying every object and migrating the `listing_photo_derivative` keys
  (`src/shared/db/schema.ts:680`), and nothing user-visible carries the bucket
  name.
- **The logo and the visual identity are not part of it.** A rename changes the
  word, not the colour system, the typography, or the absence of a logo that
  `design/reference/sistema/SISTEMA.md:323` declares. That absence is still the
  standing definition of the mark: *the mark is the word itself, in the system's
  stack.* Rebranding the palette or commissioning a logo is a separate decision
  with a separate cost, and folding it into a rename is how a two-day change
  becomes a two-month one.

## The taxonomy has to be seeded, and it is not

Everything above lives in a dashboard. This one lives in the database, and it
is the same kind of item for the same reason: nothing in the repository put it
there.

`city` and `zone` are populated only by `pnpm db:seed`, run by hand against
the target environment. No deploy step ran it and no CI job ran it, so a fresh
environment comes up with whatever rows somebody typed in early on. On
**2026-09-05** production held 10 provisional zones under a city called
`Distrito Capital` instead of the 5,796 that `docs/territorio/` defines, and
5 areas were 2. Step 2 of the publish flow offers a zone; with none to offer,
**the whole publish path was dead** — while the test suite stayed green,
because nothing asserted a real environment's contents.

So: after pointing an environment at a database, run

```
pnpm db:seed
```

against it. It is idempotent — ids are derived from the full territorial path,
so a second run changes nothing — and it deletes nothing.

**The deploy gate now verifies it.** `scripts/deploy-migrate.mjs` runs
`scripts/taxonomy-smoke.ts` after the schema check, and a production build
whose database is missing taxonomy **fails** rather than deploying a product
nobody can publish on. The expected counts are derived from `docs/territorio/`
at check time, never hardcoded, so adding a file to the taxonomy moves the
gate with it. It is directional: missing rows fail the build, extra rows do
not — the provisional zones already carry real listings, and a gate demanding
exact equality would block every deploy until somebody deleted real data.

Run it against any environment by hand with `pnpm smoke:taxonomy`.

## Why CORS is the one that will bite

`content-type` is signed into the presigned PUT, so the browser sends a
preflight `OPTIONS` before the upload. A bucket without a matching policy
answers it with a refusal, the browser drops the request, and **nothing
server-side sees anything at all**.

That is also why no unit or integration test can cover it: CORS is a browser
policy. The 42 specs over the upload path all run server-side or against
injected doubles, and every one of them passes while uploads are impossible.
The only thing that catches it is a real browser PUTting to a real bucket.

**This was discovered in production on 2026-08-18**, by the founder trying to
upload a photo, after the whole upload pipeline had shipped green.

CI does not catch it either, and the reason is worth keeping: CI runs from an
origin the policy already allows, so even a real upload test there would pass.
The only assertion with teeth is a `GetBucketCors` read against the production
bucket.

## Current policy, for reference

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

Preview deployments get their own `*.vercel.app` hostname per push, which is
why the wildcard is there. Keep `localhost:3000` for local work.

## The only verification this list accepts

Every item above has a dashboard that will show it green. None of that is
proof. What closes the list is the product doing the thing:

1. Sign in with Google, and sign in with a magic link — two doors, both real.
2. Publish a listing through the whole flow, photos included. That exercises
   the seeded taxonomy at step 2, the presigned PUT and the CORS policy at the
   photo step, and `R2_BUCKET_PUBLIC_URL` when the photo renders back.
3. Open the listing and reveal a contact.

On the 2026-09-05 cutover, steps 1 and 2 were done by the founder against
`rentoru.com` on 2026-09-06, and the photo upload was the item that stayed
blocked longest — not by CORS this time, but by the missing taxonomy above.
