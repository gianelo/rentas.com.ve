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
