import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Sign-in link from the email lands here: swap the one-time code for a session.
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let next = url.searchParams.get("next") || "/";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";
  if (code) {
    const { error } = await createClient().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
