import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/server";
import { sendMonthlyStatements } from "../../../../lib/sendStatements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron (1st of each month) sends last month's statements.
// Vercel calls this with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  const r = await sendMonthlyStatements(db, { origin: new URL(req.url).origin });
  console.log("monthly statements", JSON.stringify(r));
  return NextResponse.json({ ok: true, ...r });
}
