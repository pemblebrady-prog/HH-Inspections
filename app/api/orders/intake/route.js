import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "../../../../lib/supabase/server";
import { mapEntry, allowedForms } from "../../../../lib/gravity";
import { createOrderFromEntry } from "../../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The website POSTs each new Gravity Forms entry here (WordPress snippet), with the
// shared secret in the X-HH-Secret header. No Gravity Forms API login needed.
export async function POST(req) {
  const secret = process.env.ORDER_INTAKE_SECRET || "";
  const given = req.headers.get("x-hh-secret") || "";
  const ok = secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let entry;
  try { entry = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 }); }
  if (!entry || !entry.id || !allowedForms().includes(Number(entry.form_id))) {
    return NextResponse.json({ ok: false, error: "Unknown form" }, { status: 400 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  try {
    const r = await createOrderFromEntry(db, entry, { origin: new URL(req.url).origin });
    return NextResponse.json({ ok: true, ref: r.ref, created: r.created });
  } catch (e) {
    console.error("intake failed", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
