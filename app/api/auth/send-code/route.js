import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/server";
import { authEnabled } from "../../../../lib/supabase/config";
import { withTimeout } from "../../../../lib/withTimeout";
import { sendEmail } from "../../../../lib/email";

export const runtime = "nodejs";
export const maxDuration = 30;

// Invite-only sign-in: Supabase makes a one-time code + link, and we email it
// ourselves through Resend (so Supabase's SMTP settings and templates aren't needed).
export async function POST(req) {
  if (!authEnabled) return NextResponse.json({ ok: false, error: "Sign-in isn't configured." }, { status: 500 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Sign-in isn't configured (secret key missing)." }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  let next = String(body.next || "/");
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";
  const origin = new URL(req.url).origin;

  try {
    // Only people who've been invited.
    const { data: person } = await db.from("profiles").select("id, active, full_name").ilike("email", email).maybeSingle();
    if (!person || !person.active) {
      return NextResponse.json({ ok: false, code: "not_invited", error: "This email isn't set up for the portal yet. Ask House & Home to add you." }, { status: 400 });
    }

    const { data, error } = await withTimeout(
      db.auth.admin.generateLink({ type: "magiclink", email }),
      20000, "Creating the code",
    );
    if (error) throw error;
    const otp = data.properties && data.properties.email_otp;
    const hash = data.properties && data.properties.hashed_token;
    if (!otp || !hash) throw new Error("Supabase didn't return a code");

    const link = `${origin}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=magiclink&next=${encodeURIComponent(next)}`;
    const first = person.full_name ? person.full_name.split(" ")[0] : "";
    const r = await withTimeout(sendEmail({
      to: email,
      subject: `Your House & Home sign-in code: ${otp}`,
      html: `<div style="font-family:Arial,sans-serif;color:#132430;max-width:480px">
        <p>Hi${first ? " " + first.replace(/[<>&]/g, "") : ""},</p>
        <p>Your sign-in code for the House &amp; Home Inspector Portal:</p>
        <p style="font-size:30px;letter-spacing:8px;font-weight:bold;margin:18px 0">${otp}</p>
        <p>Or <a href="${link}">tap here to sign in</a> on this device.</p>
        <p style="color:#5c6b74;font-size:13px">The code expires in an hour. If you didn't ask for it, you can ignore this email.</p>
      </div>`,
    }), 20000, "Sending the email");
    if (r.simulated) throw new Error("Email isn't configured (RESEND_API_KEY missing)");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-code error", err);
    return NextResponse.json({ ok: false, error: err.message || "Send failed" }, { status: 500 });
  }
}
