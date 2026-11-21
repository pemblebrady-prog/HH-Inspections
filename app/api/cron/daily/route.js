import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/server";
import { sendLicenseWarnings } from "../../../../lib/licenseWarnings";
import { getDrive } from "../../../../lib/drive";
import { cleanStaging } from "../../../../lib/staging";
import { sendPayReminders } from "../../../../lib/payReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron, once a day: PE license expiry warnings; unpaid card-job reminders; clear out abandoned early photo uploads.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  const r = await sendLicenseWarnings(db, { origin: new URL(req.url).origin });
  const drive = await getDrive();
  r.stagedPhotosRemoved = drive ? await cleanStaging(drive, 14).catch((e) => { console.error("staging cleanup", e.message); return 0; }) : 0;
  r.payReminders = await sendPayReminders(db, { origin: new URL(req.url).origin }).catch((e) => { console.error("pay reminders", e.message); return 0; });
  console.log("daily", JSON.stringify(r));
  return NextResponse.json({ ok: true, ...r });
}
