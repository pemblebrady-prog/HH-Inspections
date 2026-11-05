import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/server";
import { sendLicenseWarnings } from "../../../../lib/licenseWarnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron, once a day: PE license expiry warnings.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  const r = await sendLicenseWarnings(db, { origin: new URL(req.url).origin });
  console.log("daily", JSON.stringify(r));
  return NextResponse.json({ ok: true, ...r });
}
