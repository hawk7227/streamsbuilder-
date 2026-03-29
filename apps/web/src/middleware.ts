/**
 * apps/web/src/middleware.ts
 *
 * Edge middleware. Protects /system-status and /api/system-status
 * from unauthenticated access at the CDN/edge layer before any RSC runs.
 *
 * Strategy: check for ADMIN_SECRET cookie or x-admin-secret header.
 * In production, replace with your actual auth provider (e.g. NextAuth session).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = ["/system-status", "/api/system-status"];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const secret = req.headers.get("x-admin-secret")
    ?? req.cookies.get("admin_secret")?.value;

  const expected = process.env["ADMIN_SECRET"];

  // ADMIN_SECRET not configured — fail closed
  if (!expected) {
    return new NextResponse("Service unavailable: admin not configured", { status: 503 });
  }

  if (secret !== expected) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }

  // Pass the secret downstream so RSC + route handlers can read it from headers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-admin-secret", secret);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/system-status/:path*", "/api/system-status/:path*"],
};
