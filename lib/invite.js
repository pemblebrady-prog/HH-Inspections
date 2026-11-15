import { sendEmail } from "./email";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Create a sign-in account for someone, set their role/company, and email a welcome.
// db = Supabase admin client. Returns { ok, emailed } or { ok:false, error, status }.
export async function invitePerson(db, { email, fullName, role, companyId, invitedBy, origin }) {
  email = String(email || "").trim().toLowerCase();
  fullName = String(fullName || "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, status: 400, error: "Enter a valid email." };

  const { data: created, error: createErr } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (createErr) {
    const msg = /already|registered|exists/i.test(createErr.message || "") ? "That email already has an account." : createErr.message;
    return { ok: false, status: 400, error: msg };
  }
  const { error: upErr } = await db.from("profiles")
    .upsert({ id: created.user.id, email, full_name: fullName || null, role, company_id: companyId || null });
  if (upErr) return { ok: false, status: 500, error: upErr.message };

  let emailed = false;
  try {
    const r = await sendEmail({
      to: email,
      subject: "You've been added to the House & Home Inspector Portal",
      html: `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
        <p>Hi${fullName ? " " + esc(fullName.split(" ")[0]) : ""},</p>
        <p>${invitedBy ? esc(invitedBy) + " added you" : "You've been added"} to the House &amp; Home Inspector Portal, where you'll submit manufactured home foundation inspections for engineering certification.</p>
        <p><a href="${origin}/login" style="display:inline-block;background:#A2382A;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Sign in and get set up</a></p>
        <p>Sign in with this email address (${esc(email)}). We'll email you a one-time code; no password needed. Setup takes about a minute.</p>
      </div>`,
    });
    emailed = !r.simulated;
  } catch (e) { console.error("welcome email failed", e); }
  return { ok: true, emailed, id: created.user.id };
}
