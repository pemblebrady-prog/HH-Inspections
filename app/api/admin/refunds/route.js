import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { refundJob } from "../../../../lib/refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Refund a job (admins and House & Home office managers). Body: { ref, amount?: dollars (blank = the rest), reason? }
export async function POST(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  // Don't move money until the portal can record it (migration 0017).
  const ready = await db.from("refunds").select("id").limit(1);
  if (ready.error) return NextResponse.json({ ok: false, error: "Refunds need a one-time database update (0017_refunds.sql) first." }, { status: 400 });
  const { data: sub } = await db.from("submissions").select("id, ref, company_id, payment_status, amount_cents, is_demo").eq("ref", String(b.ref || "")).maybeSingle();
  if (!sub) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  if (sub.is_demo) return NextResponse.json({ ok: false, error: "Practice jobs aren't charged." }, { status: 400 });
  const raw = b.amount === undefined || b.amount === null || String(b.amount).trim() === "" ? null : Number(String(b.amount).replace(/[$,\s]/g, ""));
  if (raw !== null && !(raw > 0)) return NextResponse.json({ ok: false, error: "Enter a refund amount, like 40 or 135.00." }, { status: 400 });
  try {
    const r = await refundJob(db, sub, { amountCents: raw === null ? null : Math.round(raw * 100), reason: String(b.reason || "").trim().slice(0, 400), by: auth.profile && auth.profile.id });
    return NextResponse.json({ ok: true, refunded_cents: r.refunded_cents, full: r.full, status: r.refund.status });
  } catch (e) {
    console.error("refund failed", sub.ref, e.message);
    return NextResponse.json({ ok: false, error: e.message || "Refund failed" }, { status: 400 });
  }
}
