import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// tasks.md 23.3 — DECIDIDA 2026-09-04. The site footer must stay silent on
// two routes: the listing detail page's own <footer> already carries the
// listing's ID and expiry (16.35) — data about the LISTING, not the site —
// and the photo viewer's <footer> is a control bar for an immersive
// full-screen view, not a footer at all. Stacking the site footer under
// either one is a defect, not a sum; both keep exactly the footer they
// already had.
//
// app/layout.tsx is a plain Server Component with no client hook and no
// state (design.md D13/D14), so it has no way to ask which route it is
// serving. `matcher` below scopes this file to exactly those two route
// shapes; every other request never reaches it, and layout.tsx treats a
// missing header as "render the site footer".
export function middleware(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-hide-site-footer", "1");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/alquiler/:ciudad/:zona/:slug", "/alquiler/:ciudad/:zona/:slug/foto/:n"],
};
