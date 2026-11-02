import { NextResponse } from "next/server";
import { billingContext, publicBilling } from "../../../../lib/billing";
import { saveSetupResult } from "../../../../lib/charges";
import { stripe } from "../../../../lib/stripe";

export const runtime = "nodejs";

// After Stripe confirms the setup in the browser, record the saved method.
export async function POST(req) {
  let b = {}; try { b = await req.json(); } catch {}
  if (!/^seti_\w+$/.test(String(b.setupIntentId || ""))) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  try {
    const si = await stripe("GET", `/setup_intents/${b.setupIntentId}`, { expand: ["payment_method"] });
    const c = await billingContext(si.metadata && si.metadata.company_id);
    if (c.error) return c.error;
    if (!si.metadata || si.metadata.company_id !== c.company.id) return NextResponse.json({ ok: false, error: "Not your company" }, { status: 403 });
    const result = await saveSetupResult(c.db, c.company, si);
    const { data: fresh } = await c.db.from("companies").select("*").eq("id", c.company.id).single();
    return NextResponse.json({ ok: true, ...result, billing: publicBilling(fresh || c.company) });
  } catch (err) {
    console.error("setup confirm error", err);
    return NextResponse.json({ ok: false, error: err.message || "Couldn't save the payment method" }, { status: 500 });
  }
}
