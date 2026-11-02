import { stripe, describePaymentMethod, stripeEnabled } from "./stripe";
import { sendEmail } from "./email";

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const money = (c) => `$${(c / 100).toFixed(2)}`;

// Record the outcome of a SetupIntent (bank account or card saved in Stripe).
export async function saveSetupResult(db, company, si) {
  const pm = typeof si.payment_method === "object" ? si.payment_method
    : si.payment_method ? await stripe("GET", `/payment_methods/${si.payment_method}`) : null;
  const label = describePaymentMethod(pm);
  const type = pm && pm.type === "us_bank_account" ? "ach" : pm && pm.type === "card" ? "card" : null;

  if (si.status === "succeeded" && pm) {
    await stripe("POST", `/customers/${si.customer}`, { invoice_settings: { default_payment_method: pm.id } });
    await db.from("companies").update({
      payment_method_id: pm.id, payment_method_label: label, payment_mandate_id: si.mandate || null,
      default_payment: type, payment_ready_at: new Date().toISOString(), payment_status_note: null,
    }).eq("id", company.id);
    return { saved: true, method: label };
  }
  if (si.status === "requires_action" && si.next_action && si.next_action.type === "verify_with_microdeposits") {
    await db.from("companies").update({
      payment_status_note: `Waiting for bank verification of ${label || "the account"}: Stripe sent two small deposits.`,
    }).eq("id", company.id);
    return { saved: false, pending: true, verifyUrl: si.next_action.verify_with_microdeposits.hosted_verification_url };
  }
  if (si.status === "processing") {
    await db.from("companies").update({ payment_status_note: `Setting up ${label || "the account"}…` }).eq("id", company.id);
    return { saved: false, pending: true };
  }
  return { saved: false, error: `Payment setup is ${si.status.replace(/_/g, " ")}.` };
}

async function emailOwners(db, companyId, subject, html) {
  const { data } = await db.from("profiles").select("email").eq("company_id", companyId).eq("role", "company_owner").eq("active", true);
  await Promise.all((data || []).map((p) => sendEmail({ to: p.email, subject, html }).catch((e) => console.error("owner email failed", e.message))));
}

async function notifyFailure(db, { company, ref, address, amount, reason, origin }) {
  await emailOwners(db, company.id, `Payment failed for ${ref}`, `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p>We couldn't charge ${esc(company.payment_method_label || "your payment method on file")} ${money(amount)} for job <b>${esc(ref)}</b>${address ? ` (${esc(address)})` : ""}.</p>
    <p>Reason: ${esc(reason || "declined")}</p>
    <p>The job is on hold until payment goes through. Please update your payment method:</p>
    <p><a href="${origin}/billing" style="display:inline-block;background:#A2382A;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Update payment method</a></p></div>`);
}

// Charge a company for one submission. Returns the submission fields to update.
// Never throws: payment problems put the job on hold instead of losing it.
export async function chargeSubmission(db, { submission, company, origin, attempt }) {
  const amount = submission.amount_cents || 0;
  if (!company || company.is_internal || amount <= 0) return { status: "submitted", payment_status: "waived" };
  const required = process.env.PAYMENT_REQUIRED === "true";

  if (!stripeEnabled() || !company.payment_method_id || !company.payment_ready_at) {
    // No usable payment method yet.
    return required
      ? { status: "on_hold", payment_status: "unpaid" }
      : { status: "submitted", payment_status: "unpaid" };
  }

  const isAch = company.default_payment === "ach";
  let pi, failure = null;
  try {
    pi = await stripe("POST", "/payment_intents", {
      amount, currency: "usd",
      customer: company.stripe_customer_id,
      payment_method: company.payment_method_id,
      payment_method_types: [isAch ? "us_bank_account" : "card"],
      mandate: isAch && company.payment_mandate_id ? company.payment_mandate_id : undefined,
      off_session: true, confirm: true,
      description: `Engineering certification ${submission.ref}${submission.property_address ? " - " + submission.property_address : ""}`,
      statement_descriptor_suffix: "HH CERT",
      metadata: { submission_id: submission.id, ref: submission.ref, company_id: company.id },
    }, { idempotencyKey: attempt ? `charge-${submission.id}-${attempt}` : `charge-${submission.id}` });
  } catch (err) {
    failure = err.message;
    pi = err.stripe && err.stripe.payment_intent;
  }

  const piStatus = pi ? pi.status : "failed";
  const paymentStatus = piStatus === "succeeded" ? "paid" : piStatus === "processing" ? "processing" : "failed";
  await db.from("payments").insert({
    submission_id: submission.id, company_id: company.id, amount_cents: amount,
    method: isAch ? "ach" : "card", status: paymentStatus,
    stripe_payment_intent_id: pi ? pi.id : null, stripe_charge_status: piStatus,
    failure_reason: paymentStatus === "failed" ? (failure || (pi && pi.last_payment_error && pi.last_payment_error.message) || "Declined") : null,
  });

  if (paymentStatus === "failed") {
    await notifyFailure(db, { company, ref: submission.ref, address: submission.property_address, amount, reason: failure, origin });
    return { status: "on_hold", payment_status: "failed" };
  }
  return { status: "submitted", payment_status: paymentStatus, paid_at: paymentStatus === "paid" ? new Date().toISOString() : null };
}

// Webhook: an ACH payment settled or failed later.
export async function applyPaymentEvent(db, pi, kind, origin) {
  const { data: pay } = await db.from("payments").select("id, submission_id, company_id, amount_cents").eq("stripe_payment_intent_id", pi.id).maybeSingle();
  if (!pay) return;
  if (kind === "succeeded") {
    await db.from("payments").update({ status: "paid", stripe_charge_status: pi.status }).eq("id", pay.id);
    if (pay.submission_id) await db.from("submissions").update({ payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", pay.submission_id);
  } else if (kind === "failed") {
    const reason = (pi.last_payment_error && pi.last_payment_error.message) || "Payment failed";
    await db.from("payments").update({ status: "failed", stripe_charge_status: pi.status, failure_reason: reason }).eq("id", pay.id);
    if (pay.submission_id) {
      const { data: sub } = await db.from("submissions").update({ payment_status: "failed", status: "on_hold" }).eq("id", pay.submission_id).select("ref, property_address").single();
      const { data: company } = await db.from("companies").select("id, name, payment_method_label").eq("id", pay.company_id).single();
      if (sub && company) await notifyFailure(db, { company, ref: sub.ref, address: sub.property_address, amount: pay.amount_cents, reason, origin });
    }
  }
}

// After a submission: confirm to the inspector, and send a receipt to the
// company owners only when a charge actually went through (or is processing).
export async function sendSubmissionEmails(db, { submission, company, inspectorEmail, outcome, origin }) {
  const ref = esc(submission.ref), addr = esc(submission.property_address || "");
  if (inspectorEmail) {
    await sendEmail({
      to: inspectorEmail,
      subject: `Submitted: ${submission.ref}${submission.property_address ? " - " + submission.property_address : ""}`,
      html: `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
        <p>Your inspection <b>${ref}</b>${addr ? ` for ${addr}` : ""} was received and is in the engineer's queue.</p>
        ${outcome.status === "on_hold" ? "<p><b>It's on hold</b> until your company's payment goes through.</p>" : ""}
        <p>You'll be notified when the certification is complete.</p></div>`,
    }).catch((e) => console.error("inspector confirmation failed", e.message));
  }
  if (company && ["paid", "processing"].includes(outcome.payment_status)) {
    const paid = outcome.payment_status === "paid";
    await emailOwners(db, company.id, `${paid ? "Payment received" : "Payment processing"}: ${submission.ref}`,
      `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
        <p>${paid ? "We charged" : "We started a bank transfer from"} ${esc(company.payment_method_label || "your payment method on file")} for <b>${money(submission.amount_cents)}</b>.</p>
        <p>Job ${ref}${addr ? ` · ${addr}` : ""}</p>
        ${paid ? "" : "<p>Bank transfers take a few business days to clear. The job is already with the engineer.</p>"}
        <p><a href="${origin}/billing">View billing</a></p></div>`);
  }
}
