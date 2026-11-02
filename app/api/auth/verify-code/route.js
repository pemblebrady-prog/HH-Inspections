import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { authEnabled } from "../../../../lib/supabase/config";
import { withTimeout } from "../../../../lib/withTimeout";

export const runtime = "nodejs";
export const maxDuration = 30;

// Check the 6-digit code; on success the session cookie is set on this response.
export async function POST(req) {
  if (!authEnabled) return NextResponse.json({ ok: false, error: "Sign-in isn't configured." }, { status: 500 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const email = String(body.email || "").trim().toLowerCase();
  const token = String(body.token || "").replace(/\D/g, "");
  if (!email || token.length < 6) return NextResponse.json({ ok: false, error: "Enter the 6-digit code from the email." }, { status: 400 });
  try {
    const { error } = await withTimeout(createClient().auth.verifyOtp({ email, token, type: "email" }), 20000, "Checking the code");
    if (error) return NextResponse.json({ ok: false, error: error.message || "Invalid code" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("verify-code exception", err);
    return NextResponse.json({ ok: false, error: err.message || "Verify failed" }, { status: 504 });
  }
}
