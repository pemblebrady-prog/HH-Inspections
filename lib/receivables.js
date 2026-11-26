// Accounts receivable (Nov 25): what each company still owes, oldest first.
// Owed = job charges that failed or are still clearing, pay-per-job jobs not charged yet (outside companies),
// and re-inspection fees that are unpaid, failed or clearing. House & Home's own jobs and demo jobs are never owed.
import { sendEmail } from "./email";
import { companyContacts } from "./contacts";
import { awaitingCard } from "./payPerJob";

const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
export const BUCKETS = [["b0", "0–30 days"], ["b31", "31–60 days"], ["b61", "Over 60 days"]];
const bucketOf = (days) => (days > 60 ? "b61" : days > 30 ? "b31" : "b0");
export const STATE = { failed: "Charge failed", processing: "Still clearing", unpaid: "Not charged yet" };

export async function receivables(db, { now = Date.now() } = {}) {
  const lines = [];
  const jobs = await db.from("submissions")
    .select("id, ref, property_address, client_name, inspector_name, amount_cents, payment_status, status, submitted_at, company_id, company:companies(id, name, is_internal)")
    .eq("is_demo", false).not("status", "in", "(canceled,uploading)").in("payment_status", ["failed", "processing", "unpaid"]).gt("amount_cents", 0)
    .order("submitted_at", { ascending: true }).limit(5000);
  if (jobs.error) throw jobs.error;
  for (const j of jobs.data || []) {
    if (j.company && j.company.is_internal) continue;
    const since = j.submitted_at;
    const days = Math.max(0, Math.floor((now - new Date(since).getTime()) / 864e5));
    lines.push({ kind: "job", ref: j.ref, address: j.property_address, client: j.client_name, inspector: j.inspector_name, amount_cents: j.amount_cents,
      state: j.payment_status, since, days, bucket: bucketOf(days), company_id: j.company_id, company: (j.company && j.company.name) || "No company" });
  }
  const fees = await db.from("correction_rounds")
    .select("id, round, fee_cents, fee_status, followup_submitted_at, created_at, sub:submissions(ref, property_address, client_name, inspector_name, is_demo, company_id, company:companies(id, name, is_internal))")
    .gt("fee_cents", 0).in("fee_status", ["unpaid", "failed", "processing"]).not("followup_submitted_at", "is", null).limit(5000);
  if (!fees.error) for (const r of fees.data || []) { // before 0018 the table doesn't exist: no fees
    const s = r.sub; if (!s || s.is_demo || (s.company && s.company.is_internal)) continue;
    const since = r.followup_submitted_at || r.created_at;
    const days = Math.max(0, Math.floor((now - new Date(since).getTime()) / 864e5));
    lines.push({ kind: "fee", round: r.round, ref: s.ref, address: s.property_address, client: s.client_name, inspector: s.inspector_name, amount_cents: r.fee_cents,
      state: r.fee_status, since, days, bucket: bucketOf(days), company_id: s.company_id, company: (s.company && s.company.name) || "No company" });
  }
  const byCo = {};
  for (const l of lines) {
    const c = (byCo[l.company_id || "none"] = byCo[l.company_id || "none"] || { id: l.company_id, name: l.company, lines: [], total: 0, b0: 0, b31: 0, b61: 0 });
    c.lines.push(l); c.total += l.amount_cents; c[l.bucket] += l.amount_cents;
  }
  const companies = Object.values(byCo).sort((a, b) => b.b61 - a.b61 || b.b31 - a.b31 || b.total - a.total);
  for (const c of companies) c.lines.sort((a, b) => b.days - a.days);
  const totals = { total: 0, b0: 0, b31: 0, b61: 0 };
  for (const c of companies) for (const k of Object.keys(totals)) totals[k] += c[k];
  return { companies, totals, count: lines.length };
}

const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
export function receivablesCsv({ companies }) {
  const head = ["Company", "Job", "What", "Property", "Client", "Inspector", "Amount", "Status", "Since", "Days", "Age"];
  const rows = [head];
  for (const c of companies) for (const l of c.lines) {
    rows.push([c.name, l.ref, l.kind === "fee" ? `Re-inspection fee (round ${l.round})` : "Job", l.address, l.client, l.inspector, (l.amount_cents / 100).toFixed(2),
      STATE[l.state] || l.state, new Date(l.since).toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }), l.days, (BUCKETS.find(([k]) => k === l.bucket) || [])[1]]);
  }
  return rows.map((r) => r.map(q).join(",")).join("\r\n");
}

// Email the company's owners and office managers (and the inspector) a pay link for one item.
export async function sendArReminder(db, { ref, kind, round, origin }) {
  const { data: sub } = await db.from("submissions").select("id, ref, property_address, amount_cents, payment_status, status, inspector_id, company_id, is_demo, company:companies(*)").eq("ref", ref).maybeSingle();
  if (!sub || sub.is_demo) throw new Error("Job not found.");
  let amount = sub.amount_cents, link = `${origin}/pay/${encodeURIComponent(sub.ref)}`, what = "this job";
  // Card-paying companies pay by link; companies charged automatically update their payment method instead.
  let byLink = awaitingCard(sub, sub.company);
  if (kind === "fee") {
    const { data: r } = await db.from("correction_rounds").select("fee_cents, fee_status, round").eq("submission_id", sub.id).eq("round", Number(round)).maybeSingle();
    if (!r || !["unpaid", "failed"].includes(r.fee_status)) throw new Error("That re-inspection fee isn't waiting for payment.");
    amount = r.fee_cents; link += `?round=${r.round}`; what = "the re-inspection fee on this job"; byLink = true;
  } else if (!["unpaid", "failed"].includes(sub.payment_status)) throw new Error(sub.payment_status === "processing" ? "That payment is still clearing; no reminder needed." : "This job isn't waiting for payment.");
  const to = new Set(await companyContacts(db, sub.company_id, "reminders"));
  if (sub.inspector_id) { const { data } = await db.from("profiles").select("email").eq("id", sub.inspector_id).maybeSingle(); if (data && data.email) to.add(data.email); }
  if (!to.size) throw new Error("No one at this company to email. Add a company owner or office manager first.");
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p>Payment of <b>${money(amount)}</b> is still due for ${what}: <b>${esc(sub.ref)}</b>${sub.property_address ? ` (${esc(sub.property_address)})` : ""}.</p>
    ${byLink ? `<p><a href="${link}" style="display:inline-block;background:#A2382A;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Pay now</a></p>`
      : sub.payment_status === "failed" ? `<p>The charge to your payment method on file didn't go through. Please update it on the Billing page, and we'll charge it again.</p>`
      : `<p>We haven't been able to charge this job yet. Please check your payment method on the Billing page, or reply to arrange payment.</p>`}
    ${byLink ? "" : `
    <p><a href="${origin}/billing" style="display:inline-block;background:#A2382A;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Update payment method</a></p>`}
    <p style="color:#5c6b74;font-size:13px">Already paid? You can ignore this; the receipt is on its way. Questions: reply to this email.</p></div>`;
  const sent = [];
  for (const addr of to) { await sendEmail({ to: addr, subject: `Payment due: ${sub.ref}`, html }); sent.push(addr); }
  return sent;
}
