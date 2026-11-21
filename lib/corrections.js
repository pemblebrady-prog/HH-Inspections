import { getDrive, uploadPdf, uploadPhoto, findOrCreateFolder } from "./drive";
import { generateLetter, companyForLetter } from "./letters";
import { buildFindings, DEFAULT_COMPANY } from "./letterContent";
import { engineerForJob } from "./engineers";
import { cleanRecipients, letterPdf, letterProblems, emailLetter, letterFilename } from "./delivery";
import { sendEmail } from "./email";
import { stripe, stripeEnabled, ensureCustomer } from "./stripe";
import { paysByCard, hasSavedMethod } from "./payPerJob";
import { statementFields, statementLine } from "./statementText";
import { companyContacts, officeEmails } from "./contacts";
import { isStaff, isCompanyManager } from "./roles";

// Failed inspections (Brian, Nov 20): Ron sends a corrections letter instead of certifying. The follow-up
// (the original inspector's new photos, or a House & Home re-inspection) is a second round on the same job.
// Ron reviews it and sends the "clear letter", which is the final certification. An optional re-inspection
// fee is charged when the follow-up comes in.

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
const btn = (href, label, color = "#A2382A") => `<p><a href="${href}" style="display:inline-block;background:${color};color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">${label}</a></p>`;

export const ROUND_LABEL = {
  draft: "Corrections letter being prepared", waiting: "Waiting for the follow-up", awaiting_payment: "Follow-up in, waiting for the fee",
  submitted: "Follow-up ready for review", cleared: "Cleared", redo: "More corrections were needed", canceled: "Canceled",
};
export const OPEN = ["draft", "waiting", "awaiting_payment", "submitted"];
export const FEE_LABEL = { none: "No fee", unpaid: "Not paid yet", processing: "Processing", paid: "Paid", failed: "Failed", waived: "Waived" };
export const MISSING = "Run database update 0018 in Supabase first.";
const missing = (error) => Boolean(error && /does not exist|schema cache|could not find the table/i.test(error.message || "") && /correction_rounds/i.test(error.message || ""));

export const followupLink = (origin, ref) => `${origin || ""}/follow-up/${encodeURIComponent(ref)}`;

export async function getDefaultReinspectionCents(db) {
  if (!db) return 0;
  try {
    const { data, error } = await db.from("settings").select("value").eq("key", "default_reinspection_cents").maybeSingle();
    if (error || !data) return 0;
    const n = Number(data.value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  } catch { return 0; }
}

// Every round on a job, oldest first. { rounds, missing } (missing = migration 0018 not run).
export async function listRounds(db, submissionId) {
  const { data, error } = await db.from("correction_rounds").select("*").eq("submission_id", submissionId).order("round");
  if (error) return { rounds: [], missing: missing(error), error: missing(error) ? null : error.message };
  return { rounds: data || [] };
}
export const openRound = (rounds) => [...(rounds || [])].reverse().find((r) => OPEN.includes(r.status)) || null;

// The checklist's corrections, as a starting list for Ron to edit.
export const suggestedCorrections = (report) => buildFindings(report || {}).corrections;

// Who can submit the follow-up: whoever it's assigned to; with no one assigned, the job's inspector
// (and their company's owner / office manager). Staff always can.
export function canDoFollowup(profile, sub, round) {
  if (!profile || !sub || !round) return false;
  if (isStaff(profile)) return true;
  if (round.assigned_to) return round.assigned_to === profile.id;
  if (round.followup_by !== "inspector") return false;
  if (sub.inspector_id === profile.id) return true;
  return isCompanyManager(profile) && Boolean(sub.company_id && sub.company_id === profile.company_id);
}

// House & Home people who can go out and re-inspect.
export async function houseAndHomePeople(db) {
  const { data: hh } = await db.from("companies").select("id").eq("is_internal", true).limit(1).maybeSingle();
  if (!hh) return [];
  const { data } = await db.from("profiles").select("id, full_name, email").eq("company_id", hh.id).eq("active", true).order("full_name");
  return (data || []).map((p) => ({ id: p.id, name: p.full_name || p.email, email: p.email }));
}

function cleanCorrections(list) {
  const out = (Array.isArray(list) ? list : String(list || "").split(/\n+/))
    .map((c) => String(c || "").replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim()).filter(Boolean).map((c) => c.slice(0, 500));
  if (!out.length) throw new Error("List at least one correction.");
  if (out.length > 30) throw new Error("That's more than 30 corrections. Combine some.");
  return out;
}

// Check and normalize who does the follow-up, and the fee.
async function settle(db, sub, { followupBy, assignedTo, feeCents }) {
  const by = followupBy === "house_and_home" ? "house_and_home" : "inspector";
  let assigned = by === "inspector" ? sub.inspector_id || null : assignedTo || null;
  if (by === "house_and_home" && assigned) {
    const people = await houseAndHomePeople(db);
    if (!people.some((p) => p.id === assigned)) throw new Error("Pick someone from House & Home to re-inspect.");
  }
  const { data: co } = sub.company_id ? await db.from("companies").select("is_internal").eq("id", sub.company_id).maybeSingle() : { data: null };
  let fee = feeCents == null ? 0 : Math.round(Number(feeCents));
  if (!Number.isFinite(fee) || fee < 0 || fee > 100000) throw new Error("Enter a fee like 35 or 0.");
  if (co && co.is_internal) fee = 0; // House & Home's own jobs are never charged
  return { followup_by: by, assigned_to: assigned, fee_cents: fee };
}

// Start a corrections round (or update the one being prepared). redo: the follow-up didn't fix
// everything, so close that round and start another.
export async function startRound(db, sub, { corrections, followupBy, assignedTo, feeCents, by, redo }) {
  const { rounds, missing: m, error } = await listRounds(db, sub.id);
  if (m) throw new Error(MISSING);
  if (error) throw new Error(error);
  const open = openRound(rounds);
  const fields = { corrections: cleanCorrections(corrections), ...(await settle(db, sub, { followupBy, assignedTo, feeCents })) };
  if (open && open.status === "draft") {
    const { data, error: e } = await db.from("correction_rounds").update(fields).eq("id", open.id).select("*").single();
    if (e) throw e;
    return data;
  }
  if (redo && (!open || open.status === "submitted")) {
    // The follow-up didn't fix everything (even if a clear letter was started): close it and ask again.
    await db.from("correction_rounds").update({ status: "redo" }).eq("submission_id", sub.id).in("status", ["submitted", "cleared"]);
  } else if (open) {
    throw new Error(open.status === "submitted" ? "The follow-up is in. Review it, then make the clear letter or ask for more corrections." : "This job already has corrections in progress.");
  }
  const next = rounds.reduce((n, r) => Math.max(n, r.round), 0) + 1;
  const { data, error: e } = await db.from("correction_rounds").insert({ ...fields, submission_id: sub.id, round: next, status: "draft", created_by: by || null, fee_status: "none" }).select("*").single();
  if (e) throw e;
  return data;
}

// Office / engineer edits while the letter is being prepared or the follow-up is awaited.
export async function updateRound(db, sub, round, patch, { origin } = {}) {
  if (!["draft", "waiting"].includes(round.status)) throw new Error("This round can't be changed now.");
  const fields = await settle(db, sub, {
    followupBy: patch.followupBy ?? round.followup_by, assignedTo: patch.assignedTo !== undefined ? patch.assignedTo : round.assigned_to,
    feeCents: patch.feeCents !== undefined ? patch.feeCents : round.fee_cents,
  });
  if (patch.corrections !== undefined && round.status === "draft") fields.corrections = cleanCorrections(patch.corrections);
  const { data, error } = await db.from("correction_rounds").update(fields).eq("id", round.id).select("*").single();
  if (error) throw error;
  if (data.status === "waiting" && data.assigned_to && data.assigned_to !== round.assigned_to) await emailFollowupNeeded(db, sub, data, { origin });
  return data;
}

export async function cancelRound(db, sub, round) {
  if (!["draft", "waiting"].includes(round.status)) throw new Error("Only a round that's still being prepared or waiting can be canceled.");
  await db.from("correction_rounds").update({ status: "canceled" }).eq("id", round.id);
  if (sub.status === "corrections") await db.from("submissions").update({ status: "under_review" }).eq("id", sub.id);
}

// The engineer making the letter signs it (if an engineer); otherwise the job's engineer.
async function roundEngineer(db, sub, round, profile) {
  if (profile && profile.role === "engineer" && !profile.viewingAs) return engineerForJob(db, { letter_engineer_id: profile.id });
  return engineerForJob(db, round && round.engineer_id ? { letter_engineer_id: round.engineer_id } : sub);
}

// Build the corrections letter as a Google Doc in the job's folder.
export async function makeCorrectionsLetter(db, sub, round, profile) {
  if (round.status !== "draft") throw new Error("The corrections letter was already sent.");
  const engineer = await roundEngineer(db, sub, null, profile);
  const r = await generateLetter({
    folderId: sub.drive_folder_id, report: sub.report || {}, company: await companyForLetter(db, sub), images: sub.photos || [], engineer,
    mode: "corrections", corrections: round.corrections, feeCents: round.fee_cents,
  });
  if (r.simulated) throw new Error("Google Drive isn't connected, so the letter can't be made.");
  const { data, error } = await db.from("correction_rounds").update({ letter_doc_id: r.docId, letter_link: r.docLink, engineer_id: r.engineerId || null }).eq("id", round.id).select("*").single();
  if (error) throw error;
  return data;
}

// Email the corrections letter (PDF, stamped), save it to Drive, and open the follow-up.
export async function sendCorrectionsLetter(db, sub, round, { recipients, force, sentBy, origin }) {
  if (round.status !== "draft") throw new Error("This corrections letter was already sent.");
  if (!round.letter_doc_id) throw new Error("Make the corrections letter first.");
  const drive = await getDrive();
  if (!drive) throw new Error("Google Drive isn't connected.");
  const to = cleanRecipients(recipients);
  if (!to.length) throw new Error("Add at least one email address to send to.");
  const engineer = await roundEngineer(db, sub, round, null);
  if (!force) {
    const problems = await letterProblems(drive, engineer, round.letter_doc_id);
    if (problems.length) return { ok: false, needsConfirm: true, problems };
  }
  const { pdf, stamped } = await letterPdf(drive, engineer, round.letter_doc_id);
  const filename = letterFilename(sub, round.round > 1 ? `Corrections Letter ${round.round}` : "Corrections Letter");
  let saved = null;
  if (sub.drive_folder_id) {
    try { saved = await uploadPdf(drive, sub.drive_folder_id, filename, pdf); } catch (e) { console.error("corrections pdf save failed", e.message); }
  }
  const company = sub.company && !sub.company.is_internal ? sub.company : DEFAULT_COMPANY;
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:560px">
    <p>The foundation inspection for the home below found items that need to be corrected before it can be certified. The corrections letter is attached.</p>
    <p><b>${esc(sub.property_address || "")}</b><br/>Client: ${esc(sub.client_name || "")}${sub.inspection_date ? `<br/>Inspected: ${esc(sub.inspection_date)}` : ""}</p>
    <p><b>Needs correcting:</b></p><ol>${round.corrections.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
    <p>Once the corrections are made, ${esc(DEFAULT_COMPANY.name)} can re-inspect the home, or the original inspector can send new photos.${round.fee_cents > 0 ? ` A re-inspection fee of ${money(round.fee_cents)} applies.` : ""} Then a clear letter certifying the foundation will be issued.</p>
    <p>Questions? Call ${esc(company.phone || DEFAULT_COMPANY.phone)}.</p>
    <p style="color:#5c6b74;font-size:12px">Job ${esc(sub.ref)} · prepared by ${esc(engineer.name)}, ${esc(engineer.title)}</p></div>`;
  const results = await emailLetter(to, { subject: `Corrections needed: ${sub.property_address || sub.ref}`, html, filename, pdf });
  const sentTo = results.filter((r) => r.ok).map((r) => r.to);
  if (!sentTo.length) return { ok: false, results };

  // Claim the round (so a double tap doesn't open the follow-up twice).
  const { data: claimed } = await db.from("correction_rounds").update({
    status: "waiting", sent_at: new Date().toISOString(), sent_to: sentTo, sent_by: sentBy || null,
    pdf_id: saved ? saved.id : null, pdf_link: saved ? saved.webViewLink : null,
  }).eq("id", round.id).eq("status", "draft").select("*");
  const fresh = claimed && claimed[0];
  await db.from("submissions").update({ status: "corrections", reviewed_by: sub.reviewed_by || sentBy || null }).eq("id", sub.id);
  if (fresh) await emailFollowupNeeded(db, sub, fresh, { origin });
  return { ok: true, results, pdfLink: saved ? saved.webViewLink : null, stamped };
}

// Tell whoever does the follow-up what's needed, with the link. No one assigned to a House & Home
// re-inspection yet: tell the office to pick someone.
export async function emailFollowupNeeded(db, sub, round, { origin } = {}) {
  const list = `<ol>${(round.corrections || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ol>`;
  const where = `<b>${esc(sub.property_address || "")}</b>${sub.client_name ? `<br/>Client: ${esc(sub.client_name)}` : ""}`;
  if (!round.assigned_to) {
    const office = await officeEmails(db);
    const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:560px">
      <p>A corrections letter went out for job <b>${esc(sub.ref)}</b> and House &amp; Home will re-inspect, but no one is assigned yet.</p><p>${where}</p>${list}
      ${btn(`${origin || ""}/admin/review/${encodeURIComponent(sub.ref)}`, "Assign someone", "#0E3A52")}</div>`;
    await Promise.all(office.map((to) => sendEmail({ to, subject: `Assign a re-inspection: ${sub.ref}`, html }).catch(() => {})));
    return;
  }
  const { data: p } = await db.from("profiles").select("email, full_name").eq("id", round.assigned_to).maybeSingle();
  if (!p || !p.email) return;
  const reinspect = round.followup_by === "house_and_home";
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:560px">
    <p>${reinspect ? "Please re-inspect this home" : "The engineer needs new photos for this job"} once the corrections below are made.</p>
    <p>${where}<br/><span style="color:#5c6b74">Job ${esc(sub.ref)}</span></p>
    <p><b>Show each of these fixed:</b></p>${list}
    <p>Take a photo of each correction, then send them from the portal. ${round.fee_cents > 0 ? `A re-inspection fee of ${money(round.fee_cents)} is charged when you send it.` : ""}</p>
    ${btn(followupLink(origin, sub.ref), reinspect ? "Open the re-inspection" : "Send new photos")}</div>`;
  await sendEmail({ to: p.email, subject: `${reinspect ? "Re-inspection" : "New photos needed"}: ${sub.property_address || sub.ref}`, html }).catch((e) => console.error("follow-up email failed", e.message));
}

// One follow-up photo into "Follow-up N" inside the job's Drive folder. Returns { id } or { simulated }.
export async function saveFollowupPhoto(sub, round, { name, type, buffer }) {
  const drive = await getDrive();
  if (!drive || !sub.drive_folder_id) return { simulated: true, id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  const folder = await findOrCreateFolder(drive, `Follow-up ${round.round}`, sub.drive_folder_id);
  const res = await uploadPhoto(drive, folder, name, type, buffer);
  return { id: res.id };
}

const PHOTO_ID = /^[\w-]{6,120}$/;
// The follow-up is in. items: [{ note, photos: [{ id }] }] in the order of round.corrections; extra: [{ id }].
// Charges the fee (or waits for the card), then puts the job back in the engineer's queue.
export async function submitFollowup(db, sub, round, { items, extra, notes, date, by, origin }) {
  if (round.status !== "waiting") throw new Error(round.status === "draft" ? "The corrections letter hasn't been sent yet." : "This follow-up was already sent.");
  const photo = (p, label) => (p && PHOTO_ID.test(String(p.id || "")) ? { id: String(p.id), label } : null);
  const clean = round.corrections.map((correction, i) => {
    const it = (items || [])[i] || {};
    const short = correction.length > 60 ? correction.slice(0, 57) + "…" : correction;
    return { correction, note: String(it.note || "").trim().slice(0, 2000), photos: (it.photos || []).map((p, j) => photo(p, `Correction ${i + 1}${j ? ` (${j + 1})` : ""}: ${short}`)).filter(Boolean).slice(0, 20) };
  });
  const more = (extra || []).map((p, j) => photo(p, `Other follow-up photo ${j + 1}`)).filter(Boolean).slice(0, 30);
  const all = [...clean.flatMap((it) => it.photos), ...more];
  if (!all.length) throw new Error("Add at least one photo showing the corrections.");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });

  const { data: company } = sub.company_id ? await db.from("companies").select("*").eq("id", sub.company_id).maybeSingle() : { data: null };
  const charge = round.fee_cents > 0 && company && !company.is_internal;
  const byCard = charge && paysByCard(company);
  const { data: claimed } = await db.from("correction_rounds").update({
    followup_items: clean, followup_photos: all.map((p) => ({ ...p, slot: "followup" })), followup_notes: String(notes || "").trim().slice(0, 4000) || null,
    reinspection_date: day, followup_submitted_at: new Date().toISOString(), followup_submitted_by: by || null,
    status: byCard ? "awaiting_payment" : "submitted", fee_status: !charge ? (round.fee_cents > 0 ? "waived" : "none") : "unpaid",
  }).eq("id", round.id).eq("status", "waiting").select("*");
  const fresh = claimed && claimed[0];
  if (!fresh) throw new Error("This follow-up was already sent.");
  await db.from("submissions").update({ photo_count: (sub.photo_count || 0) + all.length }).eq("id", sub.id);

  if (byCard) return { ok: true, round: fresh, needsPayment: true, amount: fresh.fee_cents };
  let feeNote = null;
  if (charge) {
    const r = await chargeFee(db, sub, fresh, company, { origin });
    feeNote = r.fee_status;
  }
  await db.from("submissions").update({ status: "submitted" }).eq("id", sub.id);
  await alertFollowup(db, sub, fresh, { origin });
  return { ok: true, round: { ...fresh, fee_status: feeNote || fresh.fee_status } };
}

// Staff: the follow-up is in.
export async function alertFollowup(db, sub, round, { origin } = {}) {
  let to = (process.env.REVIEW_ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length) {
    let r = await db.from("profiles").select("email").in("role", ["admin", "office_manager", "engineer"]).eq("active", true);
    if (r.error) r = await db.from("profiles").select("email").in("role", ["admin", "engineer"]).eq("active", true);
    to = (r.data || []).map((p) => p.email).filter(Boolean);
  }
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p><b>Follow-up in for ${esc(sub.ref)}</b> (${round.followup_by === "house_and_home" ? "House & Home re-inspection" : "new photos from the inspector"})</p>
    <p>Property: ${esc(sub.property_address || "")}<br/>Client: ${esc(sub.client_name || "")}<br/>${(round.followup_photos || []).length} photos for ${round.corrections.length} correction${round.corrections.length === 1 ? "" : "s"}</p>
    ${btn(`${origin || ""}/admin/review/${encodeURIComponent(sub.ref)}`, "Review the follow-up", "#0E3A52")}</div>`;
  await Promise.all(to.map((addr) => sendEmail({ to: addr, subject: `Follow-up ${sub.ref}: ${sub.property_address || sub.client_name || ""}`, html }).catch(() => {})));
}

const feeDescription = (sub) => `Re-inspection fee ${sub.ref}${sub.property_address ? " - " + sub.property_address : ""}`;

// Charge the fee to the company's saved bank account or card. Never throws; returns { fee_status }.
export async function chargeFee(db, sub, round, company, { origin, attempt } = {}) {
  const amount = round.fee_cents;
  const set = async (fee_status) => { await db.from("correction_rounds").update({ fee_status }).eq("id", round.id); return { fee_status }; };
  if (!(amount > 0) || !company || company.is_internal) return set(amount > 0 ? "waived" : "none");
  const { data: prior } = await db.from("payments").select("status").eq("correction_round_id", round.id).in("status", ["paid", "processing"]).limit(1);
  if (prior && prior.length) return set(prior[0].status);
  if (!stripeEnabled() || !hasSavedMethod(company) || company.pay_per_job) return set("unpaid");
  const isAch = company.default_payment === "ach";
  let pi, failure = null;
  try {
    pi = await stripe("POST", "/payment_intents", {
      amount, currency: "usd", customer: company.stripe_customer_id, payment_method: company.payment_method_id,
      payment_method_types: [isAch ? "us_bank_account" : "card"],
      mandate: isAch && company.payment_mandate_id ? company.payment_mandate_id : undefined,
      off_session: true, confirm: true, description: feeDescription(sub),
      ...statementFields(sub.ref, { ach: isAch }),
      metadata: { correction_round_id: round.id, ref: sub.ref, company_id: company.id, kind: "reinspection_fee" },
    }, { idempotencyKey: `fee-${round.id}-${amount}${attempt ? "-" + attempt : ""}` });
  } catch (err) { failure = err.message; pi = err.stripe && err.stripe.payment_intent; }
  const piStatus = pi ? pi.status : "failed";
  const status = piStatus === "succeeded" ? "paid" : piStatus === "processing" ? "processing" : "failed";
  await db.from("payments").insert({
    submission_id: null, correction_round_id: round.id, company_id: company.id, amount_cents: amount,
    method: isAch ? "ach" : "card", status, stripe_payment_intent_id: pi ? pi.id : null, stripe_charge_status: piStatus,
    failure_reason: status === "failed" ? (failure || (pi && pi.last_payment_error && pi.last_payment_error.message) || "Declined") : null,
  });
  if (status === "failed") await emailFeeFailed(db, sub, company, amount, failure, origin);
  else await emailFeeReceipt(db, sub, company, amount, { processing: status === "processing", ach: isAch });
  return set(status);
}

async function emailFeeFailed(db, sub, company, amount, reason, origin) {
  const to = await companyContacts(db, company.id, "payment_failed");
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p>We couldn't charge ${esc(company.payment_method_label || "your payment method on file")} the ${money(amount)} re-inspection fee for job <b>${esc(sub.ref)}</b>${sub.property_address ? ` (${esc(sub.property_address)})` : ""}.</p>
    <p>Reason: ${esc(reason || "declined")}</p><p>Please update your payment method:</p>${btn(`${origin || ""}/billing`, "Update payment method")}</div>`;
  await Promise.all(to.map((addr) => sendEmail({ to: addr, subject: `Payment failed: re-inspection fee ${sub.ref}`, html }).catch(() => {})));
}

async function emailFeeReceipt(db, sub, company, amount, { processing, ach, extra = [] } = {}) {
  const to = new Set([...(await companyContacts(db, company.id, "receipts")), ...extra]);
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p>${processing ? "We started a bank transfer for" : "Payment received:"} the <b>${money(amount)}</b> re-inspection fee for job <b>${esc(sub.ref)}</b>${sub.property_address ? ` (${esc(sub.property_address)})` : ""}.</p>
    <p>The follow-up is with the engineer. You'll receive the clear letter by email.</p>
    <p style="color:#5c6b74;font-size:13px">On your statement it shows as <b>${esc(statementLine(sub.ref, { ach }))}</b>.</p></div>`;
  await Promise.all([...to].map((addr) => sendEmail({ to: addr, subject: `${processing ? "Payment processing" : "Payment received"}: re-inspection fee ${sub.ref}`, html }).catch(() => {})));
}

// Pay-as-you-go: start (or reuse) a card payment for the fee. Returns { clientSecret, amount } or { alreadyPaid }.
export async function startFeePayment(db, sub, round, company) {
  if (!stripeEnabled()) throw new Error("Payments aren't set up yet. Call House & Home at 520-599-7798.");
  const { data: open } = await db.from("payments").select("id, stripe_payment_intent_id").eq("correction_round_id", round.id).eq("status", "unpaid").not("stripe_payment_intent_id", "is", null).order("created_at", { ascending: false }).limit(1);
  if (open && open[0]) {
    const pi = await stripe("GET", `/payment_intents/${open[0].stripe_payment_intent_id}`);
    if (pi.status === "succeeded") { await markFeePaid(db, pi, {}); return { alreadyPaid: true }; }
    if (pi.amount === round.fee_cents && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status)) return { clientSecret: pi.client_secret, amount: pi.amount };
  }
  const customer = await ensureCustomer(db, company);
  const pi = await stripe("POST", "/payment_intents", {
    amount: round.fee_cents, currency: "usd", customer, payment_method_types: ["card"], description: feeDescription(sub),
    ...statementFields(sub.ref),
    metadata: { correction_round_id: round.id, ref: sub.ref, company_id: company.id, kind: "reinspection_fee", pay_per_job: "1" },
  }, { idempotencyKey: `feeppj-${round.id}-${round.fee_cents}-${(open || []).length}` });
  await db.from("payments").insert({
    submission_id: null, correction_round_id: round.id, company_id: company.id, amount_cents: round.fee_cents, method: "card",
    status: "unpaid", stripe_payment_intent_id: pi.id, stripe_charge_status: pi.status,
  });
  return { clientSecret: pi.client_secret, amount: pi.amount };
}

// A fee card payment went through (pay page or webhook). Moves the follow-up to the engineer once. Safe to repeat.
export async function markFeePaid(db, pi, { origin, payerEmail } = {}) {
  const roundId = pi.metadata && pi.metadata.correction_round_id;
  if (!roundId || pi.status !== "succeeded") return { ok: false };
  await db.from("payments").update({ status: "paid", stripe_charge_status: pi.status }).eq("stripe_payment_intent_id", pi.id);
  const { data: moved } = await db.from("correction_rounds").update({ fee_status: "paid", status: "submitted" }).eq("id", roundId).eq("status", "awaiting_payment").select("*");
  const round = moved && moved[0];
  if (!round) { await db.from("correction_rounds").update({ fee_status: "paid" }).eq("id", roundId).neq("fee_status", "paid"); return { ok: true, already: true }; }
  const { data: sub } = await db.from("submissions").update({ status: "submitted" }).eq("id", round.submission_id).select("*, company:companies(*)").single();
  if (sub) {
    await alertFollowup(db, sub, round, { origin }).catch(() => {});
    const extra = [payerEmail].filter(Boolean);
    if (round.followup_submitted_by) { const { data } = await db.from("profiles").select("email").eq("id", round.followup_submitted_by).maybeSingle(); if (data) extra.push(data.email); }
    if (sub.company) await emailFeeReceipt(db, sub, sub.company, pi.amount, { extra }).catch(() => {});
  }
  return { ok: true };
}

// Webhook: a fee payment settled or failed (bank transfers settle days later).
export async function applyFeeEvent(db, pi, kind, origin) {
  if (pi.metadata.pay_per_job === "1") {
    if (kind === "succeeded") return markFeePaid(db, pi, { origin });
    await db.from("payments").update({ stripe_charge_status: pi.status, failure_reason: (pi.last_payment_error && pi.last_payment_error.message) || "Declined" }).eq("stripe_payment_intent_id", pi.id);
    return;
  }
  const { data: pay } = await db.from("payments").select("id, correction_round_id, company_id, amount_cents").eq("stripe_payment_intent_id", pi.id).maybeSingle();
  if (!pay) return;
  if (kind === "succeeded") {
    await db.from("payments").update({ status: "paid", stripe_charge_status: pi.status }).eq("id", pay.id);
    await db.from("correction_rounds").update({ fee_status: "paid" }).eq("id", pay.correction_round_id);
  } else if (kind === "failed") {
    const reason = (pi.last_payment_error && pi.last_payment_error.message) || "Payment failed";
    await db.from("payments").update({ status: "failed", stripe_charge_status: pi.status, failure_reason: reason }).eq("id", pay.id);
    const { data: round } = await db.from("correction_rounds").update({ fee_status: "failed" }).eq("id", pay.correction_round_id).select("submission_id").single();
    const { data: sub } = round ? await db.from("submissions").select("ref, property_address").eq("id", round.submission_id).single() : { data: null };
    const { data: company } = await db.from("companies").select("id, name, payment_method_label").eq("id", pay.company_id).single();
    if (sub && company) await emailFeeFailed(db, sub, company, pay.amount_cents, reason, origin);
  }
}

// Office: charge the fee now (saved method), or for card-only companies email the pay link.
export async function chargeFeeNow(db, sub, round, { origin }) {
  if (!(round.fee_cents > 0)) throw new Error("There's no fee on this round.");
  if (["paid", "processing"].includes(round.fee_status)) throw new Error("The fee is already paid or processing.");
  const { data: company } = await db.from("companies").select("*").eq("id", sub.company_id).maybeSingle();
  if (!company || company.is_internal) throw new Error("House & Home jobs aren't charged.");
  if (paysByCard(company)) {
    const to = new Set(await companyContacts(db, company.id, "receipts"));
    const who = round.followup_submitted_by || sub.inspector_id;
    if (who) { const { data } = await db.from("profiles").select("email").eq("id", who).maybeSingle(); if (data) to.add(data.email); }
    const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
      <p>The ${money(round.fee_cents)} re-inspection fee for job <b>${esc(sub.ref)}</b>${sub.property_address ? ` (${esc(sub.property_address)})` : ""} hasn't been paid yet.</p>
      ${btn(`${origin || ""}/pay/${encodeURIComponent(sub.ref)}?round=${round.id}`, `Pay ${money(round.fee_cents)}`)}</div>`;
    await Promise.all([...to].map((addr) => sendEmail({ to: addr, subject: `Please pay: re-inspection fee ${sub.ref}`, html }).catch(() => {})));
    return { emailed: [...to] };
  }
  return chargeFee(db, sub, round, company, { origin, attempt: Date.now() });
}

// Ron is happy with the follow-up: build the clear letter (the job's final letter) from it.
export async function makeClearLetter(db, sub, round, profile) {
  if (!["submitted", "cleared"].includes(round.status)) throw new Error("The follow-up hasn't come in yet.");
  const engineer = await roundEngineer(db, sub, round, profile);
  const items = (round.followup_items || []).map((it) => ({ correction: it.correction, note: it.note, photos: it.photos || [] }));
  const listed = new Set(items.flatMap((it) => it.photos.map((p) => p.id)));
  const extra = (round.followup_photos || []).filter((p) => !listed.has(p.id));
  const r = await generateLetter({
    folderId: sub.drive_folder_id, report: sub.report || {}, company: await companyForLetter(db, sub), images: sub.photos || [], engineer,
    mode: "clear", followup: { sentAt: round.sent_at, date: round.reinspection_date, by: round.followup_by, items, extra, notes: round.followup_notes },
  });
  if (r.simulated) throw new Error("Google Drive isn't connected, so the letter can't be made.");
  await db.from("correction_rounds").update({ status: "cleared" }).eq("id", round.id);
  return r;
}
