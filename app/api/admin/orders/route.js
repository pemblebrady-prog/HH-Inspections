import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { syncOrders } from "../../../../lib/orders";
import { sendEmail } from "../../../../lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// POST: check the website form for new requests.
export async function POST(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  try {
    const r = await syncOrders(db, { origin: new URL(req.url).origin });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}

// PATCH: schedule / assign / status / notes. Body: { ref, scheduledAt?, inspectorId?, status?, notes?, notifyInspector? }
export async function PATCH(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const { data: order } = await db.from("orders").select("*").eq("ref", b.ref).maybeSingle();
  if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

  const patch = {};
  if (b.scheduledAt !== undefined) patch.scheduled_at = b.scheduledAt ? new Date(b.scheduledAt).toISOString() : null;
  if (b.inspectorId !== undefined) patch.inspector_id = b.inspectorId || null;
  if (b.notes !== undefined) patch.notes = String(b.notes || "").slice(0, 5000);
  if (b.status !== undefined) {
    if (!["new", "scheduled", "inspected", "canceled"].includes(b.status)) return NextResponse.json({ ok: false, error: "Bad status" }, { status: 400 });
    patch.status = b.status;
  } else if ((patch.scheduled_at || order.scheduled_at) && (patch.inspector_id || order.inspector_id) && order.status === "new") {
    patch.status = "scheduled"; // date + inspector set
  }
  const { data: updated, error } = await db.from("orders").update(patch).eq("id", order.id).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Tell the inspector about a new assignment (best effort).
  let notified = false;
  if (b.notifyInspector && updated.inspector_id) {
    const { data: insp } = await db.from("profiles").select("email, full_name").eq("id", updated.inspector_id).maybeSingle();
    if (insp) {
      const when = updated.scheduled_at ? new Date(updated.scheduled_at).toLocaleString("en-US", { timeZone: "America/Phoenix", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "time to be confirmed";
      const origin = new URL(req.url).origin;
      try {
        const r = await sendEmail({ to: insp.email, subject: `Assigned: ${updated.property_address} (${when})`, html: `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
          <p>You've been assigned inspection <b>${esc(updated.ref)}</b>.</p>
          <p><b>${esc(updated.property_address)}</b><br/>${esc(updated.inspection_detail)}<br/>${esc(when)} (Arizona time)</p>
          <p><a href="${origin}/?order=${encodeURIComponent(updated.id)}" style="display:inline-block;background:#A2382A;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Open in the portal</a></p></div>` });
        notified = !r.simulated;
      } catch (e) { console.error("assign email failed", e.message); }
    }
  }
  return NextResponse.json({ ok: true, order: updated, notified });
}
