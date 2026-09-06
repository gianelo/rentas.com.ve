# Changing the domain

Every item below lives **outside the repository**, in a dashboard. None of it
is covered by a test, and most of it fails silently or fails only in a real
browser — which is why it is written down rather than remembered.

The trigger is moving from `rentascomve.vercel.app` to the real domain. Do the
whole list in one sitting: several of these break each other half-done.

## The list

| # | Where | What | How it fails if forgotten |
|---|---|---|---|
| 1 | Vercel → Domains | Add the domain, make it the production one | Nothing serves it |
| 2 | Google Cloud → OAuth client | Authorised **redirect URI** `https://<domain>/api/auth/callback/google`, and **JavaScript origin** `https://<domain>` | Sign-in returns `redirect_uri_mismatch`. **Nobody can log in**, so nobody can publish |
| 3 | Vercel → env | `AUTH_URL` (and `NEXTAUTH_URL` if present) to the new origin | Auth.js builds callbacks against the old host; the login loop never closes |
| 4 | Cloudflare → R2 → bucket → CORS | Add the new origin to `AllowedOrigins`, keep `AllowedMethods: ["PUT"]` and `AllowedHeaders: ["content-type"]` | **The browser blocks every photo upload before it leaves.** No server log records it, because the request never reaches a server |
| 5 | Cloudflare → R2 → custom domain | Point `fotos.<domain>` at the bucket, then set `R2_BUCKET_PUBLIC_URL` to it | Photos keep loading from `r2.dev`, which Cloudflare documents as development-only: no caching, rate limited, billed read operations |
| 6 | Vercel → env | Re-check every `R2_BUCKET_*` value is the production bucket, not a test one | Uploads land somewhere nobody renders from |

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

## Current policy, for reference

```json
[
  {
    "AllowedOrigins": [
      "https://rentascomve.vercel.app",
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
