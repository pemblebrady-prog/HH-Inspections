import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { orderPrefill } from "../../../../lib/orders";

export const dynamic = "force-dynamic";

// Form values to pre-fill from an order (admins, or the assigned inspector).
export async function GET(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id");
  const db = createAdminClient();
  if (!db || !id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { data: o } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  const me = auth.profile;
  if (!o || (me && me.role !== "admin" && o.inspector_id !== me.id)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const a = o.access || {}, oc = o.occupant || {};
  return NextResponse.json({ ok: true, prefill: orderPrefill(o), info: {
    id: o.id, ref: o.ref, address: o.property_address, detail: o.inspection_detail, scheduledAt: o.scheduled_at,
    access: { dogs: a.dogs, lockedGates: a.lockedGates, underHomeLocked: a.underHomeLocked, lockboxCode: a.lockboxCode || "" },
    occupant: oc.occupied ? { name: oc.name, phone: oc.phone } : null, comments: o.comments || "",
  } });
}
