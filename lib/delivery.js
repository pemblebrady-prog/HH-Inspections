import { getDrive, exportDoc, uploadPdf, fileToDataUri } from "./drive";
import { stampPdf } from "./stampPdf";
import { sendEmail } from "./email";
import { DEFAULT_COMPANY } from "./letterContent";
import { engineerForJob, daysUntil, longDay } from "./engineers";
import { companyContacts } from "./contacts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Default recipients: the "send report to" email, the company's owners, and the inspector.
export async function defaultRecipients(db, job) {
  const out = [];
  const add = (e) => { e = String(e || "").trim().toLowerCase(); if (EMAIL_RE.test(e) && !out.includes(e)) out.push(e); };
  add(job.send_report_to);
  if (job.order_id) {
    const { data: o } = await db.from("orders").select("requester, report_copies").eq("id", job.order_id).maybeSingle();
    if (o) { add(o.requester && o.requester.email); (o.report_copies || []).forEach((c) => add(c.email)); }
  }
  if (job.company_id) {
    (await companyContacts(db, job.company_id, "delivered")).forEach(add);
  }
  if (job.inspector_id) {
    const { data } = await db.from("profiles").select("email").eq("id", job.inspector_id).maybeSingle();
    if (data) add(data.email);
  }
  return out;
}

// Things in the doc that mean it isn't final yet.
export function draftProblems(text) {
  const problems = [];
  if (/DRAFT generated from the inspector/i.test(text)) problems.push("The yellow DRAFT note is still at the top of the letter.");
  if (/\[PE stamp\s*(&|and)\s*signature\]/i.test(text)) problems.push("The \"[PE stamp & signature]\" placeholder is still there.");
  return problems;
}

export const cleanRecipients = (list) => [...new Set((list || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];

// Export a letter's Google Doc as a PDF, with the engineer's stamp and signature placed in the grey box.
// Returns { pdf, stamped } (stamped: "placed", a reason it wasn't, or null when there are no images).
export async function letterPdf(drive, engineer, docId) {
  let pdf = await exportDoc(drive, docId, "application/pdf");
  let stamped = null;
  if (engineer.stampFileId || engineer.signatureFileId) {
    try {
      const bytes = async (id) => (id ? Buffer.from((await fileToDataUri(drive, id)).split(",")[1], "base64") : null);
      const r = await stampPdf(pdf, { stamp: await bytes(engineer.stampFileId).catch(() => null), signature: await bytes(engineer.signatureFileId).catch(() => null) });
      pdf = r.pdf; stamped = r.placed ? "placed" : r.reason;
    } catch (e) { console.error("stamping failed", e.message); stamped = "error"; }
  }
  return { pdf, stamped };
}

// Checks before sending any letter: draft leftovers and an expired license.
export async function letterProblems(drive, engineer, docId) {
  const text = (await exportDoc(drive, docId, "text/plain")).toString("utf8");
  const problems = draftProblems(text);
  const left = daysUntil(engineer.expires);
  if (left != null && left < 0) problems.push(`${engineer.name}'s PE license expired on ${longDay(engineer.expires)}. Update it on the engineer details page first.`);
  return problems;
}

// One email per person, so one bad address doesn't stop the rest.
export async function emailLetter(to, { subject, html, filename, pdf }) {
  return Promise.all(to.map(async (addr) => {
    try {
      const r = await sendEmail({ to: addr, subject, html, attachments: [{ filename, content: pdf }] });
      return { to: addr, ok: !r.simulated, error: r.simulated ? "Email isn't configured" : null };
    } catch (e) { return { to: addr, ok: false, error: e.message }; }
  }));
}

export const letterFilename = (job, kind) =>
  `${`${(job.client_name || "Client").trim()} - ${(job.property_address || job.ref).trim()} - ${kind}`.replace(/[\\/:*?"<>|]/g, "-")}.pdf`;

// After a corrections letter and follow-up, the final letter is the "clear letter".
async function clearedRound(db, jobId) {
  const { data, error } = await db.from("correction_rounds").select("id, fee_cents, fee_status")
    .eq("submission_id", jobId).eq("status", "cleared").order("round", { ascending: false }).limit(1);
  return error ? null : (data && data[0]) || null;
}

// Turn the job's Google Doc into a PDF, save it, and email it. Returns a summary.
export async function deliverFinalLetter(db, job, { recipients, force, sentBy }) {
  const drive = await getDrive();
  if (!drive) throw new Error("Google Drive isn't connected.");
  if (!job.letter_doc_id) throw new Error("This job has no letter yet. Make the draft letter first.");

  const to = cleanRecipients(recipients);
  if (!to.length) throw new Error("Add at least one email address to send to.");

  const engineer = await engineerForJob(db, job);
  const cleared = await clearedRound(db, job.id);
  if (!force) {
    const problems = await letterProblems(drive, engineer, job.letter_doc_id);
    if (cleared && cleared.fee_cents > 0 && ["unpaid", "failed"].includes(cleared.fee_status)) {
      problems.push(`The $${(cleared.fee_cents / 100).toFixed(2)} re-inspection fee hasn't been paid. The office can charge or waive it on this page.`);
    }
    if (problems.length) return { ok: false, needsConfirm: true, problems };
  }

  const { pdf, stamped } = await letterPdf(drive, engineer, job.letter_doc_id);
  const kind = cleared ? "Clear Letter" : "Certification Report";
  const filename = letterFilename(job, kind);
  let saved = null;
  if (job.drive_folder_id) {
    try { saved = await uploadPdf(drive, job.drive_folder_id, filename, pdf); } catch (e) { console.error("pdf save failed", e.message); }
  }

  const company = job.company && !job.company.is_internal ? job.company : DEFAULT_COMPANY;
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:560px">
    <p>Attached is the manufactured home foundation ${cleared ? "clear letter (certification after the corrections were made)" : "certification"} for:</p>
    <p><b>${esc(job.property_address || "")}</b><br/>Client: ${esc(job.client_name || "")}${job.inspection_date ? `<br/>Inspected: ${esc(job.inspection_date)}` : ""}</p>
    <p>Prepared by ${esc(engineer.name)}, ${esc(engineer.title)}, for ${esc(company.name)}.</p>
    <p>Questions? Call ${esc(company.phone || DEFAULT_COMPANY.phone)}.</p>
    <p style="color:#5c6b74;font-size:12px">Job ${esc(job.ref)}</p></div>`;

  const results = await emailLetter(to, { subject: `${cleared ? "Clear letter" : "Certification report"}: ${job.property_address || job.ref}`, html, filename, pdf });
  const sentTo = results.filter((r) => r.ok).map((r) => r.to);

  if (sentTo.length) {
    await db.from("submissions").update({
      status: "delivered", delivered_at: new Date().toISOString(), delivered_to: sentTo,
      final_pdf_id: saved ? saved.id : null, final_pdf_link: saved ? saved.webViewLink : null,
      certified_at: job.certified_at || new Date().toISOString(), reviewed_by: job.reviewed_by || sentBy || null,
    }).eq("id", job.id);
  }
  return { ok: sentTo.length > 0, results, pdfLink: saved ? saved.webViewLink : null, stamped, clear: Boolean(cleared) };
}
