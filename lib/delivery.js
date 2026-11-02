import { getDrive, exportDoc, uploadPdf } from "./drive";
import { sendEmail } from "./email";
import { DEFAULT_COMPANY } from "./letterContent";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Default recipients: the "send report to" email, the company's owners, and the inspector.
export async function defaultRecipients(db, job) {
  const out = [];
  const add = (e) => { e = String(e || "").trim().toLowerCase(); if (EMAIL_RE.test(e) && !out.includes(e)) out.push(e); };
  add(job.send_report_to);
  if (job.company_id) {
    const { data } = await db.from("profiles").select("email").eq("company_id", job.company_id).eq("role", "company_owner").eq("active", true);
    (data || []).forEach((p) => add(p.email));
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

// Turn the job's Google Doc into a PDF, save it, and email it. Returns a summary.
export async function deliverFinalLetter(db, job, { recipients, force, sentBy }) {
  const drive = getDrive();
  if (!drive) throw new Error("Google Drive isn't connected.");
  if (!job.letter_doc_id) throw new Error("This job has no letter yet. Make the draft letter first.");

  const to = [...new Set((recipients || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
  if (!to.length) throw new Error("Add at least one email address to send to.");

  if (!force) {
    const text = (await exportDoc(drive, job.letter_doc_id, "text/plain")).toString("utf8");
    const problems = draftProblems(text);
    if (problems.length) return { ok: false, needsConfirm: true, problems };
  }

  const pdf = await exportDoc(drive, job.letter_doc_id, "application/pdf");
  const base = `${(job.client_name || "Client").trim()} - ${(job.property_address || job.ref).trim()} - Certification Report`.replace(/[\\/:*?"<>|]/g, "-");
  const filename = `${base}.pdf`;
  let saved = null;
  if (job.drive_folder_id) {
    try { saved = await uploadPdf(drive, job.drive_folder_id, filename, pdf); } catch (e) { console.error("pdf save failed", e.message); }
  }

  const company = job.company && !job.company.is_internal ? job.company : DEFAULT_COMPANY;
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:560px">
    <p>Attached is the manufactured home foundation certification for:</p>
    <p><b>${esc(job.property_address || "")}</b><br/>Client: ${esc(job.client_name || "")}${job.inspection_date ? `<br/>Inspected: ${esc(job.inspection_date)}` : ""}</p>
    <p>Prepared by Ron Rath, Professional Engineer, for ${esc(company.name)}.</p>
    <p>Questions? Call ${esc(company.phone || DEFAULT_COMPANY.phone)}.</p>
    <p style="color:#5c6b74;font-size:12px">Job ${esc(job.ref)}</p></div>`;

  // One email per person, so one bad address doesn't stop the rest.
  const results = await Promise.all(to.map(async (addr) => {
    try {
      const r = await sendEmail({ to: addr, subject: `Certification report: ${job.property_address || job.ref}`, html, attachments: [{ filename, content: pdf }] });
      return { to: addr, ok: !r.simulated, error: r.simulated ? "Email isn't configured" : null };
    } catch (e) { return { to: addr, ok: false, error: e.message }; }
  }));
  const sentTo = results.filter((r) => r.ok).map((r) => r.to);

  if (sentTo.length) {
    await db.from("submissions").update({
      status: "delivered", delivered_at: new Date().toISOString(), delivered_to: sentTo,
      final_pdf_id: saved ? saved.id : null, final_pdf_link: saved ? saved.webViewLink : null,
      certified_at: job.certified_at || new Date().toISOString(), reviewed_by: job.reviewed_by || sentBy || null,
    }).eq("id", job.id);
  }
  return { ok: sentTo.length > 0, results, pdfLink: saved ? saved.webViewLink : null };
}
