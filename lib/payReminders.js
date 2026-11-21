import { sendEmail } from "./email";
import { paysByCard } from "./payPerJob";
import { companyContacts } from "./contacts";

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const money = (c) => `$${(c / 100).toFixed(2)}`;
const REMIND_ON_DAYS = [1, 3, 7]; // days after submitting; the daily cron hits each window once

// Card-paying jobs still waiting on payment: email the pay link to the inspector and company owners.
export async function sendPayReminders(db, { origin }) {
  const since = new Date(Date.now() - 9 * 864e5).toISOString();
  const { data: subs, error } = await db.from("submissions")
    .select("id, ref, property_address, amount_cents, submitted_at, inspector_id, company_id, is_demo, status, payment_status, company:companies(*)")
    .eq("status", "on_hold").in("payment_status", ["unpaid", "failed"]).gte("submitted_at", since);
  if (error) { console.error("pay reminders", error.message); return 0; }
  let sent = 0;
  for (const sub of subs || []) {
    if (sub.is_demo || !(sub.amount_cents > 0) || !paysByCard(sub.company)) continue;
    const days = Math.floor((Date.now() - new Date(sub.submitted_at).getTime()) / 864e5);
    if (!REMIND_ON_DAYS.includes(days)) continue;
    const to = new Set();
    if (sub.inspector_id) { const { data } = await db.from("profiles").select("email").eq("id", sub.inspector_id).maybeSingle(); if (data && data.email) to.add(data.email); }
    if (sub.company_id) {
      (await companyContacts(db, sub.company_id, "reminders")).forEach((e) => to.add(e));
    }
    const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
      <p>Job <b>${esc(sub.ref)}</b>${sub.property_address ? ` for ${esc(sub.property_address)}` : ""} is waiting for payment of <b>${money(sub.amount_cents)}</b>. It goes to the engineer as soon as it's paid.</p>
      <p><a href="${origin}/pay/${encodeURIComponent(sub.ref)}" style="display:inline-block;background:#A2382A;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Pay now</a></p>
      <p style="color:#5c6b74;font-size:13px">Already paid? You can ignore this; the receipt is on its way.</p></div>`;
    for (const addr of to) {
      await sendEmail({ to: addr, subject: `Payment needed: ${sub.ref}`, html }).then(() => { sent++; }).catch((e) => console.error("pay reminder failed", e.message));
    }
  }
  return sent;
}
