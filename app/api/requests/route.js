import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/server";
import { buildOrderFromRequest, sendRequestConfirmation } from "../../../lib/requestIntake";
import { alertOrder } from "../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: someone requests an inspection. Creates an order and sends the emails.
export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  // Bot checks: hidden field must be empty, and the form must have been open a few seconds.
  if (b.website) return NextResponse.json({ ok: true, ref: "OR-0000" });
  if (Number(b.startedAt) && Date.now() - Number(b.startedAt) < 3000) return NextResponse.json({ ok: false, error: "Please try again." }, { status: 400 });

  const { errors, row } = buildOrderFromRequest(b);
  if (errors) return NextResponse.json({ ok: false, errors, error: "Please fix the highlighted fields." }, { status: 400 });

  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "The request system isn't set up yet. Please call 520-599-7798." }, { status: 500 });
  const { data: order, error } = await db.from("orders").insert(row).select("id, ref, property_address, inspection_detail, requester").single();
  if (error) {
    console.error("request insert failed", error);
    return NextResponse.json({ ok: false, error: "We couldn't save your request. Please try again, or call 520-599-7798." }, { status: 500 });
  }
  const origin = new URL(req.url).origin;
  await Promise.all([
    alertOrder(db, order, origin).catch((e) => console.error("office alert failed", e.message)),
    sendRequestConfirmation(order).catch((e) => console.error("requester confirmation failed", e.message)),
  ]);
  return NextResponse.json({ ok: true, ref: order.ref });
}
