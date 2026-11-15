import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { parseDollars, getDefaultPriceCents } from "../../../../lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Change the default price. Body: { defaultPrice: "150", confirm: true }
export async function PATCH(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  if (b.confirm !== true) return NextResponse.json({ ok: false, error: "Please confirm the change." }, { status: 400 });
  const cents = parseDollars(b.defaultPrice);
  if (cents == null || Number.isNaN(cents) || cents > 100000) return NextResponse.json({ ok: false, error: "Enter a price like 135 or 135.00." }, { status: 400 });
  const { error } = await db.from("settings").upsert({
    key: "default_price_cents", value: cents, updated_at: new Date().toISOString(), updated_by: auth.profile ? auth.profile.id : null,
  });
  if (error) return NextResponse.json({ ok: false, error: /settings/i.test(error.message) ? "Run database update 0008 in Supabase first." : error.message }, { status: 500 });
  return NextResponse.json({ ok: true, defaultPriceCents: await getDefaultPriceCents(db) });
}
