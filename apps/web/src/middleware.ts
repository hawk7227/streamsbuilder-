/**
 * apps/web/src/middleware.ts
 *
 * Edge middleware.
 * 1. Refreshes Supabase session cookies on every request (critical for SSR auth).
 * 2. Protects /chat — redirects unauthenticated users to /login.
 * 3. Protects /system-status and /api/system-status with ADMIN_SECRET.
 * 4. Redirects authenticated users away from /login and /signup → /chat.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_PATHS    = ["/system-status", "/api/system-status"];
const AUTH_PATHS     = ["/login", "/signup", "/forgot-password"];
const PROTECTED_PATHS = ["/chat", "/dashboard", "/pipeline", "/editor"];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // ── 1. Admin-secret gate (checked before session refresh — no DB needed) ──
  const isAdminPath = ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isAdminPath) {
    const secret   = req.headers.get("x-admin-secret") ?? req.cookies.get("admin_secret")?.value;
    const expected = process.env.ADMIN_SECRET;
    if (!expected) return new NextResponse("Service unavailable: admin not configured", { status: 503 });
    if (secret !== expected) return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
    const fwd = new Headers(req.headers);
    fwd.set("x-admin-secret", secret);
    return NextResponse.next({ request: { headers: fwd } });
  }

  // ── 2. Supabase session refresh (must happen on every matched request) ─────
  let supabaseResponse = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: ()              => req.cookies.getAll(),
        setAll: (cookiesToSet)  => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the session and triggers a token refresh if needed.
  // Do NOT put any logic between createServerClient and getUser().
  const { data: { user } } = await supabase.auth.getUser();

  // ── 3. Route guards ────────────────────────────────────────────────────────

  const isProtected = PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isAuthPage  = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!user && isProtected) {
    // Unauthenticated → send to /login, preserve intended destination
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    // Already authenticated → send to /chat
    const url = req.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  // ── 4. Return response with refreshed cookies ──────────────────────────────
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     * - /api/auth/* (Supabase OAuth callback — must not redirect)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
