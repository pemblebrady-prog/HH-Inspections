import { NextResponse } from "next/server";
import { billingContext, publicBilling } from "../../../lib/billing";

export const dynamic = "force-dynamic";

// Current payment method for my company (or ?companyId= for admins).
export async function GET(req) {
  const c = await billingContext(new URL(req.url).searchParams.get("companyId"));
  if (c.error) return c.error;
  const { data: payments } = await c.db.from("payments")
    .select("id, amount_cents, method, status, created_at, failure_reason, submission:submissions(ref, property_address)")
    .eq("company_id", c.company.id).order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ ok: true, billing: publicBilling(c.company), payments: payments || [], stripeReady: Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) });
}
