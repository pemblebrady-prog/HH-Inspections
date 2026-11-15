import { listEngineers, daysUntil, longDay } from "./engineers";
import { sendEmail } from "./email";

const STEPS = [60, 30, 7, 0]; // days before expiry to warn (0 = expired)
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Email admins (and the engineer) when a PE license is 60, 30 and 7 days from expiring, and once expired.
export async function sendLicenseWarnings(db, { origin }) {
  const engineers = await listEngineers(db);
  const { data: admins } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
  const sent = [];
  for (const e of engineers) {
    const left = daysUntil(e.pe_license_expires);
    if (left == null) continue;
    const step = STEPS.find((s) => left <= s && (s === 0 ? true : left > (STEPS[STEPS.indexOf(s) + 1] ?? -1)));
    if (step == null || (e.pe_expiry_warned_days != null && e.pe_expiry_warned_days <= step)) continue;
    const name = e.full_name || e.email;
    const what = left < 0 ? `expired on ${longDay(e.pe_license_expires)}` : left === 0 ? "expires today" : `expires in ${left} day${left === 1 ? "" : "s"} (${longDay(e.pe_license_expires)})`;
    const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
      <p><b>${esc(name)}'s PE license ${esc(what)}.</b></p>
      <p>Letters carry this license. Once it's renewed, enter the new expiration date on the engineer details page.</p>
      ${origin ? `<p><a href="${origin}/admin/engineer?id=${e.id}" style="display:inline-block;background:#0E3A52;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Update PE details</a></p>` : ""}</div>`;
    const to = [...new Set([e.email, ...(admins || []).map((a) => a.email)].filter(Boolean))];
    await Promise.all(to.map((addr) => sendEmail({ to: addr, subject: `PE license ${left < 0 ? "expired" : "expiring"}: ${name}`, html }).catch(() => {})));
    await db.from("profiles").update({ pe_expiry_warned_days: step }).eq("id", e.id);
    sent.push({ engineer: name, step, to: to.length });
  }
  return { checked: engineers.length, sent };
}
