import { sendEmail } from "./email";

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Email every active admin (or REVIEW_ALERT_EMAILS, comma-separated) about a new job.
// Best effort: one email per person so one bad address doesn't block the rest.
export async function alertNewSubmission(db, { ref, clientName, propertyAddress, inspectorName, companyName, origin }) {
  let to = (process.env.REVIEW_ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length && db) {
    const { data } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
    to = (data || []).map((p) => p.email).filter(Boolean);
  }
  const link = `${origin}/admin/review/${encodeURIComponent(ref)}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p><b>New certification submission ${esc(ref)}</b></p>
    <p>Client: ${esc(clientName)}<br/>Property: ${esc(propertyAddress)}<br/>Inspector: ${esc(inspectorName)}${companyName ? `<br/>Company: ${esc(companyName)}` : ""}</p>
    <p>Photos are uploading now; the draft letter will be ready in a minute or two.</p>
    <p><a href="${link}" style="display:inline-block;background:#0E3A52;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Open in review queue</a></p>
  </div>`;
  await Promise.all(to.map((addr) =>
    sendEmail({ to: addr, subject: `New submission ${ref}: ${propertyAddress || clientName || ""}`, html })
      .catch((e) => console.error("alert email failed", addr, e.message))));
}
