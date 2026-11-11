import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/supabase/server";
import { getGmailSender, disconnectGmail } from "../../../../lib/gmail";
import { getDriveOwner, disconnectDrive } from "../../../../lib/drive";
import { sendEmail, fromAddress } from "../../../../lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const g = await getGmailSender({ fresh: true }).catch(() => null);
  const d = await getDriveOwner({ fresh: true }).catch(() => null);
  return NextResponse.json({ ok: true, gmail: g ? { email: g.email, connectedAt: g.connectedAt } : null, fallback: process.env.RESEND_API_KEY ? fromAddress() : null,
    drive: d ? { email: d.email, connectedAt: d.connectedAt, folderId: d.rootFolderId } : null, driveOld: Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) });
}

// { action: "test", to } or { action: "disconnect" }
export async function POST(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  if (b.action === "disconnect") { await disconnectGmail(); return NextResponse.json({ ok: true }); }
  if (b.action === "disconnect-drive") { await disconnectDrive(); return NextResponse.json({ ok: true }); }
  if (b.action === "test") {
    const to = String(b.to || auth.profile.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ ok: false, error: "Enter an email address." }, { status: 400 });
    try {
      const r = await sendEmail({ to, subject: "Test email from the House & Home portal", html: `<div style="font-family:Arial,sans-serif;color:#132430"><p>This is a test from the inspector portal.</p><p>If you're reading this, portal emails (sign-in codes, alerts, letters) are working.</p></div>` });
      if (r.simulated) return NextResponse.json({ ok: false, error: "No email service is set up yet." }, { status: 400 });
      return NextResponse.json({ ok: true, via: r.via || "resend", to });
    } catch (e) { return NextResponse.json({ ok: false, error: e.message || "Send failed" }, { status: 500 }); }
  }
  return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
}
