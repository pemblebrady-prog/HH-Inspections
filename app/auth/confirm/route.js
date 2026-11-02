import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Sign-in link from our email: verify the one-time token and set the session.
export async function GET(request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") || "magiclink";
  let next = url.searchParams.get("next") || "/";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";
  if (token_hash) {
    const { error } = await createClient().auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
