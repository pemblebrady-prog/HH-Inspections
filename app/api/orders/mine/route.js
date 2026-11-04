import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

// Orders assigned to me that haven't been inspected yet.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db || !auth.profile) return NextResponse.json({ ok: true, orders: [] });
  const { data, error } = await db.from("orders").select("id, ref, property_address, inspection_detail, scheduled_at, status")
    .eq("inspector_id", auth.profile.id).in("status", ["new", "scheduled"]).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(50);
  if (error) return NextResponse.json({ ok: true, orders: [] }); // orders table not set up yet
  return NextResponse.json({ ok: true, orders: data || [] });
}
