import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Keeps the sign-in session fresh and sends signed-out visitors to /login.
// Pages and API routes also check access themselves; this is the first gate.
export async function middleware(request) {
  if (!URL_ || !KEY) return NextResponse.next(); // logins not configured yet

  let response = NextResponse.next({ request });
  const supabase = createServerClient(URL_, KEY, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path.startsWith("/auth/");

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
  // Everything except Next's static files, the favicon, and the demo sample photos.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|demo/).*)"],
};
