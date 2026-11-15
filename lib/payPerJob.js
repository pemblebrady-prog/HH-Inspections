import { stripe, stripeEnabled, ensureCustomer } from "./stripe";
import { sendEmail } from "./email";
import { alertNewSubmission } from "./alerts";
import { statementFields, statementLine } from "./statementText";

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const money = (c) => `$${(c / 100).toFixed(2)}`;

// Is this job waiting for a pay-as-you-go card payment?
export const awaitingCard = (sub, company) =>
  Boolean(company && company.pay_per_job && !company.is_internal && sub.status === "on_hold" && ["unpaid", "failed"].includes(sub.payment_status) && sub.amount_cents > 0);

// Start (or reuse) a card payment for one job. Returns { clientSecret, amount }.
export async function startCardPayment(db, sub, company) {
  if (!stripeEnabled()) throw new Error("Payments aren't set up yet. Call House & Home at 520-599-7798.");
  const { data: open } = await db.from("payments").select("id, stripe_payment_intent_id").eq("submission_id", sub.id).eq("status", "unpaid").not("stripe_payment_intent_id", "is", null).order("created_at", { ascending: false }).limit(1);
  if (open && open[0]) {
    const pi = await stripe("GET", `/payment_intents/${open[0].stripe_payment_intent_id}`);
    if (pi.status === "succeeded") { await markCardPaid(db, pi, {}); return { alreadyPaid: true }; }
    if (pi.amount === sub.amount_cents && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status)) {
      return { clientSecret: pi.client_secret, amount: pi.amount };
    }
  }
  const customer = await ensureCustomer(db, company);
  const pi = await stripe("POST", "/payment_intents", {
    amount: sub.amount_cents, currency: "usd", customer,
    payment_method_types: ["card"], // pay-as-you-go is card only (instant; no bank transfers)
    description: `Engineering certification ${sub.ref}${sub.property_address ? " - " + sub.property_address : ""}`,
    ...statementFields(sub.ref), // "H&H AZ* HH-1015"
    metadata: { submission_id: sub.id, ref: sub.ref, company_id: company.id, pay_per_job: "1" },
  }, { idempotencyKey: `ppj-${sub.id}-${sub.amount_cents}-${(open || []).length}` });
  await db.from("payments").insert({
    submission_id: sub.id, company_id: company.id, amount_cents: sub.amount_cents, method: "card",
    status: "unpaid", stripe_payment_intent_id: pi.id, stripe_charge_status: pi.status,
  });
  return { clientSecret: pi.client_secret, amount: pi.amount };
}

// A pay-as-you-go card payment went through (from the pay page or Stripe's webhook).
// Marks the job paid, moves it into the review queue, and tells everyone. Safe to repeat.
export async function markCardPaid(db, pi, { origin, payerEmail } = {}) {
  const subId = pi.metadata && pi.metadata.submission_id;
  if (!subId || pi.status !== "succeeded") return { ok: false };
  await db.from("payments").update({ status: "paid", stripe_charge_status: pi.status }).eq("stripe_payment_intent_id", pi.id);
  // Only the first caller moves it out of on-hold (so alerts go out once).
  const { data: moved } = await db.from("submissions")
    .update({ payment_status: "paid", paid_at: new Date().toISOString(), status: "submitted" })
    .eq("id", subId).eq("status", "on_hold").select("*, company:companies(name, is_internal)");
  const sub = moved && moved[0];
  if (!sub) { await db.from("submissions").update({ payment_status: "paid" }).eq("id", subId).neq("payment_status", "paid"); return { ok: true, already: true }; }

  try {
    await alertNewSubmission(db, {
      ref: sub.ref, clientName: sub.client_name, propertyAddress: sub.property_address, inspectorName: sub.inspector_name,
      companyName: sub.company && !sub.company.is_internal ? sub.company.name : "", origin: origin || "",
    });
  } catch (e) { console.error("alert after payment failed", e.message); }
  const to = new Set([payerEmail].filter(Boolean));
  if (sub.inspector_id) { const { data } = await db.from("profiles").select("email").eq("id", sub.inspector_id).maybeSingle(); if (data) to.add(data.email); }
  if (sub.company_id) { const { data } = await db.from("profiles").select("email").eq("company_id", sub.company_id).eq("role", "company_owner").eq("active", true); (data || []).forEach((p) => to.add(p.email)); }
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p>Payment received: <b>${money(pi.amount)}</b> for job <b>${esc(sub.ref)}</b>${sub.property_address ? ` (${esc(sub.property_address)})` : ""}.</p>
    <p>The job is now in the engineer's queue. You'll receive the certified letter by email.</p>
    <p style="color:#5c6b74;font-size:13px">On your card statement it shows as <b>${esc(statementLine(sub.ref))}</b>.</p></div>`;
  await Promise.all([...to].map((addr) => sendEmail({ to: addr, subject: `Payment received: ${sub.ref}`, html }).catch(() => {})));
  return { ok: true };
}
