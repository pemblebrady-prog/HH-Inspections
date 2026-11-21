import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const COOKIE_OPTIONS = { maxAge: 90 * 24 * 60 * 60, sameSite: "lax", path: "/" }; // keep signed in 90 days (lib/supabase/config.js)

// Keeps the sign-in session fresh and sends signed-out visitors to /login.
// Pages and API routes also check access themselves; this is the first gate.
export async function middleware(request) {
  if (!URL_ || !KEY) return NextResponse.next(); // logins not configured yet

  let response = NextResponse.next({ request });
  const supabase = createServerClient(URL_, KEY, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user: found }, error: authErr } = await supabase.auth.getUser();
  // A brief outage or slow connection to the sign-in service must not sign anyone out (and lose
  // their place): if they have a session cookie and the check failed for a non-auth reason, let the
  // page load; the page and its API calls check the session again.
  const hasSession = request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));
  const transient = authErr && (authErr.status == null || authErr.status >= 500 || /fetch|network|timeout/i.test(authErr.message || ""));
  const user = found || (hasSession && transient ? { id: "pending" } : null);
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path === "/privacy" || path === "/terms" || path.startsWith("/auth/") || path.startsWith("/api/auth/") || path === "/api/health" || path === "/api/stripe/webhook" || path.startsWith("/api/cron/") || path.startsWith("/request/") || path === "/api/orders/intake" || path === "/request" || path === "/api/requests";

  // "View as" preview: look, don't touch. Block every change except switching back and signing out.
  const method = request.method;
  if (user && request.cookies.get("hh_view_as")?.value && path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method)
      && path !== "/api/view-as" && !path.startsWith("/api/auth/")) {
    return NextResponse.json({ ok: false, error: "You're previewing another role, so changes are turned off. Use \"Switch back\" at the top first." }, { status: 403 });
  }

  if (!user && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Please sign in." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except Next's static files, icons/manifest (phones fetch these signed-out), and demo photos.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|demo/|icons/|manifest.webmanifest|apple-touch-icon|sw.js|offline.html).*)"],
};
