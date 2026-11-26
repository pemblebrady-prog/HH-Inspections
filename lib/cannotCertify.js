// "Cannot certify" (Nov 25): the engineer decides a paid job can't be certified no matter what's fixed.
// The office (House & Home's inbox plus admins and office managers) is emailed to refund the customer.
import { sendEmail } from "./email";
import { officeEmails } from "./contacts";

const OFFICE_INBOX = "houseandhomeengineering@gmail.com";
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const PAID = { paid: "Paid", processing: "Payment still clearing", unpaid: "Not charged", failed: "Charge failed", waived: "No charge", refunded: "Refunded" };

export async function emailCannotCertify(db, sub, { reason, engineerName, origin }) {
  const to = [...new Set([OFFICE_INBOX, ...(await officeEmails(db))].map((e) => e.toLowerCase()))];
  const pay = sub.payment_status || "unpaid";
  const refundNote = ["paid", "processing"].includes(pay)
    ? `<p><b>The customer paid ${money(sub.amount_cents)} and needs a refund.</b> Open the job, refund it under Payment, then tap Close job.</p>`
    : `<p>Payment: ${esc(PAID[pay] || pay)}, so there may be nothing to refund. Open the job to check, then tap Close job.</p>`;
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:560px">
    <p>${esc(engineerName || "The engineer")} can't certify job <b>${esc(sub.ref)}</b>${sub.property_address ? ` (${esc(sub.property_address)})` : ""}.</p>
    <p style="background:#f6dcd6;padding:10px 12px;border-radius:4px"><b>Reason:</b> ${esc(reason)}</p>
    <p>Client: ${esc(sub.client_name || "—")}<br>Company: ${esc((sub.company && sub.company.name) || "—")}<br>Inspector: ${esc(sub.inspector_name || "—")}</p>
    ${refundNote}
    <p><a href="${origin || ""}/admin/review/${encodeURIComponent(sub.ref)}" style="display:inline-block;background:#0E3A52;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Open the job</a></p></div>`;
  const results = await Promise.all(to.map((addr) => sendEmail({ to: addr, subject: `Cannot certify, refund needed: ${sub.ref} ${sub.property_address || ""}`.trim(), html })
    .then(() => ({ to: addr, ok: true })).catch((e) => ({ to: addr, ok: false, error: e.message }))));
  return results;
}
