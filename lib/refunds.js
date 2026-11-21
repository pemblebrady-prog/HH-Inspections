import { stripe, stripeEnabled } from "./stripe";
import { sendEmail } from "./email";
import { companyContacts } from "./contacts";

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const money = (c) => `$${(c / 100).toFixed(2)}`;
const COUNTS = ["succeeded", "pending", "requires_action"]; // refunds that take money back (failed/canceled don't)

// The paid Stripe payment for a job, or null.
async function paidPayment(db, submissionId) {
  const { data } = await db.from("payments").select("*").eq("submission_id", submissionId)
    .in("status", ["paid", "refunded"]).not("stripe_payment_intent_id", "is", null)
    .order("created_at", { ascending: false }).limit(1);
  return (data && data[0]) || null;
}

// Refund some or all of a job's payment. amountCents omitted = everything not yet refunded.
export async function refundJob(db, sub, { amountCents, reason, by }) {
  if (!stripeEnabled()) throw new Error("Stripe isn't set up.");
  const pay = await paidPayment(db, sub.id);
  if (!pay) {
    if (sub.payment_status === "processing") throw new Error("This bank payment hasn't cleared yet. Refund it once it shows Paid (usually a few business days).");
    throw new Error("There's no card or bank payment on this job to refund.");
  }
  const left = pay.amount_cents - (pay.refunded_cents || 0);
  const amount = amountCents == null ? left : Math.round(amountCents);
  if (!(amount > 0)) throw new Error("Enter an amount to refund.");
  if (amount > left) throw new Error(`You can refund at most ${money(left)} on this job.`);

  const refund = await stripe("POST", "/refunds", {
    payment_intent: pay.stripe_payment_intent_id, amount,
    metadata: { submission_id: sub.id, ref: sub.ref, by: by || "", reason: (reason || "").slice(0, 400) },
  }, { idempotencyKey: `refund-${pay.id}-${pay.refunded_cents || 0}-${amount}` });

  await db.from("refunds").upsert({
    submission_id: sub.id, payment_id: pay.id, company_id: pay.company_id || sub.company_id, amount_cents: refund.amount,
    reason: reason || null, status: refund.status, stripe_refund_id: refund.id, created_by: by || null, source: "portal",
  }, { onConflict: "stripe_refund_id" });
  const totals = await syncRefunds(db, pay.stripe_payment_intent_id, { origin: null, skipEmail: true });
  await emailRefund(db, sub.id, refund.id);
  return { refund, ...totals };
}

// Bring the portal in line with Stripe for one payment: record any refunds made in the Stripe dashboard,
// update totals on the payment and the job, and send receipts for new ones. Safe to repeat.
export async function syncRefunds(db, paymentIntentId, { skipEmail } = {}) {
  const { data: pay } = await db.from("payments").select("*").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (!pay) return { refunded_cents: 0 };
  // A re-inspection fee payment (migration 0018) has no job on it; its round knows the job.
  let round = null;
  if (pay.correction_round_id) ({ data: round } = await db.from("correction_rounds").select("id, submission_id, fee_cents").eq("id", pay.correction_round_id).maybeSingle());
  const jobId = pay.submission_id || (round && round.submission_id) || null;
  const list = await stripe("GET", "/refunds", { payment_intent: paymentIntentId, limit: 100 });
  const fresh = [];
  for (const r of list.data || []) {
    const { data: have } = await db.from("refunds").select("id").eq("stripe_refund_id", r.id).maybeSingle();
    if (have) { await db.from("refunds").update({ status: r.status }).eq("id", have.id); continue; }
    const { error } = await db.from("refunds").insert({
      submission_id: jobId, payment_id: pay.id, company_id: pay.company_id, amount_cents: r.amount,
      reason: (r.metadata && r.metadata.reason) || (r.reason ? r.reason.replace(/_/g, " ") : null), status: r.status,
      stripe_refund_id: r.id, source: "stripe", created_at: new Date((r.created || Date.now() / 1000) * 1000).toISOString(),
    });
    if (!error) fresh.push(r.id);
  }
  const refunded = (list.data || []).filter((r) => COUNTS.includes(r.status)).reduce((n, r) => n + r.amount, 0);
  const full = refunded >= pay.amount_cents;
  await db.from("payments").update({ refunded_cents: refunded, status: full ? "refunded" : pay.status === "refunded" ? "paid" : pay.status }).eq("id", pay.id);
  if (round) {
    await db.from("correction_rounds").update({ fee_refunded_cents: refunded, ...(full ? { fee_status: "refunded" } : {}) }).eq("id", round.id);
    const { data: rr } = await db.from("correction_rounds").select("fee_status").eq("id", round.id).single();
    if (!full && rr && rr.fee_status === "refunded") await db.from("correction_rounds").update({ fee_status: "paid" }).eq("id", round.id);
  }
  if (pay.submission_id) {
    const { data: sub } = await db.from("submissions").select("id, payment_status").eq("id", pay.submission_id).maybeSingle();
    if (sub) {
      const patch = { refunded_cents: refunded };
      if (full) patch.payment_status = "refunded";
      else if (sub.payment_status === "refunded") patch.payment_status = "paid";
      await db.from("submissions").update(patch).eq("id", sub.id);
    }
  }
  if (!skipEmail) for (const id of fresh) await emailRefund(db, jobId, id);
  return { refunded_cents: refunded, full };
}

// Refund receipt to the company's owners/office managers (receipts switch) and, for card jobs, the inspector.
export async function emailRefund(db, submissionId, stripeRefundId) {
  const { data: row } = await db.from("refunds").select("*").eq("stripe_refund_id", stripeRefundId).maybeSingle();
  if (!row || row.emailed_at || !COUNTS.includes(row.status)) return;
  if (!submissionId) return;
  const { data: pay } = row.payment_id ? await db.from("payments").select("amount_cents, refunded_cents, correction_round_id").eq("id", row.payment_id).maybeSingle() : { data: null };
  const fee = Boolean(pay && pay.correction_round_id);
  const { data: sub } = await db.from("submissions").select("ref, property_address, amount_cents, refunded_cents, company_id, inspector_id, company:companies(name, is_internal, pay_per_job)").eq("id", submissionId).maybeSingle();
  if (!sub) return;
  const to = new Set(await companyContacts(db, sub.company_id, "receipts"));
  if (sub.company && sub.company.pay_per_job && sub.inspector_id) {
    const { data } = await db.from("profiles").select("email").eq("id", sub.inspector_id).maybeSingle();
    if (data && data.email) to.add(data.email);
  }
  const [paid, back] = fee ? [pay.amount_cents, pay.refunded_cents || row.amount_cents] : [sub.amount_cents || 0, sub.refunded_cents || row.amount_cents];
  const full = back >= paid;
  const what = fee ? "re-inspection fee" : "job";
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p>We refunded <b>${money(row.amount_cents)}</b> ${fee ? "of the re-inspection fee " : ""}for job <b>${esc(sub.ref)}</b>${sub.property_address ? ` (${esc(sub.property_address)})` : ""}.</p>
    ${row.reason ? `<p>Reason: ${esc(row.reason)}</p>` : ""}
    <p>${full ? `The ${what} has been refunded in full.` : `Total refunded on this ${what}: ${money(back)} of ${money(paid)}.`}</p>
    <p style="color:#5c6b74;font-size:13px">Refunds usually show on your statement in 5 to 10 business days.</p></div>`;
  for (const addr of to) await sendEmail({ to: addr, subject: `Refund: ${fee ? "re-inspection fee " : ""}${sub.ref}`, html }).catch((e) => console.error("refund email failed", e.message));
  await db.from("refunds").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
}
