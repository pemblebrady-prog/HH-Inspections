import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { authEnabled } from "../../../../lib/supabase/config";
import { withTimeout } from "../../../../lib/withTimeout";

export const runtime = "nodejs";
export const maxDuration = 30;

// Ask Supabase to email a sign-in code (and link). Invite-only.
export async function POST(req) {
  if (!authEnabled) return NextResponse.json({ ok: false, error: "Sign-in isn't configured." }, { status: 500 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  let next = String(body.next || "/");
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";
  const origin = new URL(req.url).origin;

  try {
    const { error } = await withTimeout(
      createClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
      }),
      25000, "Sending the email",
    );
    if (error) {
      console.error("send-code error", error.status, error.code, error.message);
      return NextResponse.json({ ok: false, code: error.code || null, status: error.status || null, error: error.message || "Send failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-code exception", err);
    return NextResponse.json({ ok: false, error: err.message || "Send failed" }, { status: 504 });
  }
}
