import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const s = (v) => String(v == null ? "" : v).trim();

// Save a step of the first-sign-in setup. Body: { step: "details"|"reports"|"finish", ...fields }
export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const me = auth.profile;
  const db = createAdminClient();
  if (!me || !db) return NextResponse.json({ ok: false, error: "Sign-in isn't configured." }, { status: 500 });

  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  let patch = {};
  if (b.step === "details") {
    const fullName = s(b.fullName), phone = s(b.phone), cert = s(b.certificateNumber);
    if (!fullName) return NextResponse.json({ ok: false, error: "Enter your full name." }, { status: 400 });
    if (phone.replace(/\D/g, "").length < 10) return NextResponse.json({ ok: false, error: "Enter a 10-digit phone number." }, { status: 400 });
    if (me.role === "inspector" && !cert) return NextResponse.json({ ok: false, error: "Enter your Arizona inspector certificate number." }, { status: 400 });
    patch = { full_name: fullName, phone, certificate_number: cert || null };
  } else if (b.step === "reports") {
    const email = s(b.defaultReportEmail).toLowerCase();
    if (email && !EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email, or leave it blank." }, { status: 400 });
    patch = { default_report_email: email || null };
  } else if (b.step === "finish") {
    if (me.role === "company_owner" && me.company_id) {
      await db.from("companies").update({ onboarded_at: new Date().toISOString() }).eq("id", me.company_id);
    }
    patch = { onboarded_at: new Date().toISOString() };
  } else {
    return NextResponse.json({ ok: false, error: "Unknown step" }, { status: 400 });
  }

  const { error } = await db.from("profiles").update(patch).eq("id", me.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
