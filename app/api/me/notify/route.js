import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { NOTIFY_KINDS } from "../../../../lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save my email switches. Body: { receipts: true, reminders: false, ... } (payment failed can't be turned off).
export async function PATCH(req) {
  const auth = await requireUser(["company_owner"]); // owners and company office managers
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db || !auth.profile) return NextResponse.json({ ok: false, error: "Sign-in isn't configured." }, { status: 500 });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const notify = Object.fromEntries(NOTIFY_KINDS.map(([k]) => [k, b[k] !== false]));
  const { error } = await db.from("profiles").update({ notify }).eq("id", auth.profile.id);
  if (error) return NextResponse.json({ ok: false, error: /notify|column/i.test(error.message) ? "Notification settings aren't set up yet (database update pending)." : error.message }, { status: 500 });
  return NextResponse.json({ ok: true, notify });
}
