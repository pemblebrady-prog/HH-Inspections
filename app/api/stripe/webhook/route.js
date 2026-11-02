import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/server";
import { verifyWebhook, stripe } from "../../../../lib/stripe";
import { applyPaymentEvent, saveSetupResult } from "../../../../lib/charges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe calls this when an ACH payment settles/fails or a bank account finishes verifying.
export async function POST(req) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 400 });
  }
  const event = JSON.parse(raw);
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });
  const origin = new URL(req.url).origin;
  try {
    const obj = event.data && event.data.object;
    if (event.type === "payment_intent.succeeded") await applyPaymentEvent(db, obj, "succeeded", origin);
    else if (event.type === "payment_intent.payment_failed") await applyPaymentEvent(db, obj, "failed", origin);
    else if (event.type === "setup_intent.succeeded" && obj.metadata && obj.metadata.company_id) {
      const { data: company } = await db.from("companies").select("id").eq("id", obj.metadata.company_id).maybeSingle();
      if (company) await saveSetupResult(db, company, await stripe("GET", `/setup_intents/${obj.id}`, { expand: ["payment_method"] }));
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("webhook error", event.type, err);
    return NextResponse.json({ ok: false }, { status: 500 }); // Stripe will retry
  }
}
