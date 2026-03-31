/**
 * apps/web/src/middleware.ts
 *
 * Minimal middleware — no auth enforcement, no session refresh.
 * /chat and all app routes are publicly accessible.
 * Only /system-status and /api/system-status require ADMIN_SECRET.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_PATHS = ["/system-status", "/api/system-status"];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  const isAdminPath = ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isAdminPath) {
    return NextResponse.next();
  }

  const secret   = req.headers.get("x-admin-secret") ?? req.cookies.get("admin_secret")?.value;
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    return new NextResponse("Service unavailable: admin not configured", { status: 503 });
  }

  if (secret !== expected) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }

  const fwd = new Headers(req.headers);
  fwd.set("x-admin-secret", secret);
  return NextResponse.next({ request: { headers: fwd } });
}

export const config = {
  matcher: ["/system-status/:path*", "/api/system-status/:path*"],
};
