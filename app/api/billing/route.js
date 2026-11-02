import { NextResponse } from "next/server";
import { billingContext, publicBilling } from "../../../lib/billing";
import { stripe, stripeEnabled } from "../../../lib/stripe";

export const dynamic = "force-dynamic";

// Current payment method for my company (or ?companyId= for admins).
export async function GET(req) {
  const c = await billingContext(new URL(req.url).searchParams.get("companyId"));
  if (c.error) return c.error;
  const { data: payments } = await c.db.from("payments")
    .select("id, amount_cents, method, status, created_at, failure_reason, submission:submissions(ref, property_address)")
    .eq("company_id", c.company.id).order("created_at", { ascending: false }).limit(50);
  // If a bank account is waiting on micro-deposits, find Stripe's verification page.
  let verifyUrl = null;
  if (stripeEnabled() && c.company.stripe_customer_id && !c.company.payment_ready_at && c.company.payment_status_note) {
    try {
      const list = await stripe("GET", "/setup_intents", { customer: c.company.stripe_customer_id, limit: 5 });
      const si = (list.data || []).find((x) => x.status === "requires_action" && x.next_action && x.next_action.type === "verify_with_microdeposits");
      if (si) verifyUrl = si.next_action.verify_with_microdeposits.hosted_verification_url;
    } catch (e) { console.error("verify lookup failed", e.message); }
  }
  return NextResponse.json({ ok: true, verifyUrl, billing: publicBilling(c.company), payments: payments || [], stripeReady: Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) });
}
