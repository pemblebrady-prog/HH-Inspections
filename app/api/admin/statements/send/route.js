import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../../lib/supabase/server";
import { sendMonthlyStatements } from "../../../../../lib/sendStatements";

export const runtime = "nodejs";
export const maxDuration = 300;

// Admins: email statements now. Body: { month: "2026-10", companyId? }
export async function POST(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  let b = {}; try { b = await req.json(); } catch {}
  if (b.month && !/^\d{4}-\d{2}$/.test(b.month)) return NextResponse.json({ ok: false, error: "Bad month" }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  const r = await sendMonthlyStatements(db, { month: b.month || undefined, origin: new URL(req.url).origin, onlyCompanyId: b.companyId || undefined });
  return NextResponse.json({ ok: true, ...r });
}
