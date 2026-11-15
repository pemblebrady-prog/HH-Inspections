import { NextResponse } from "next/server";
import { billingContext } from "../../../../lib/billing";
import { stripe, ensureCustomer, stripeEnabled } from "../../../../lib/stripe";

export const runtime = "nodejs";

// Start saving a bank account (ACH) or card for future automatic charges.
export async function POST(req) {
  let b = {}; try { b = await req.json(); } catch {}
  const c = await billingContext(b.companyId);
  if (c.error) return c.error;
  if (!stripeEnabled() || !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return NextResponse.json({ ok: false, error: "Online payments aren't set up yet." }, { status: 400 });
  }
  if (c.company.is_internal) return NextResponse.json({ ok: false, error: "House & Home jobs aren't charged." }, { status: 400 });
  try {
    const customer = await ensureCustomer(c.db, c.company);
    const si = await stripe("POST", "/setup_intents", {
      customer,
      usage: "off_session",
      payment_method_types: ["us_bank_account", "card"],
      payment_method_options: { us_bank_account: { verification_method: "automatic", financial_connections: { permissions: ["payment_method"] } } },
      metadata: { company_id: c.company.id, set_by: c.me.id },
    });
    return NextResponse.json({ ok: true, clientSecret: si.client_secret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY });
  } catch (err) {
    console.error("setup intent error", err);
    return NextResponse.json({ ok: false, error: err.message || "Couldn't start payment setup" }, { status: 500 });
  }
}
