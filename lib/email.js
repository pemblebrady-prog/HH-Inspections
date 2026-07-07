import { Resend } from "resend";

// Returns a ready Resend client, or null (which triggers "simulated" mode —
// the app keeps working, it just doesn't actually send).
export function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// Sandbox sender works immediately with no domain setup, but can only send to
// the email you signed up to Resend with. Verify a real domain in Resend and
// set EMAIL_FROM to move past that limitation.
export function fromAddress() {
  return process.env.EMAIL_FROM || "House and Home Inspections <onboarding@resend.dev>";
}

export async function sendEmail({ to, subject, html }) {
  const resend = getResend();
  if (!resend) return { simulated: true };
  const { data, error } = await resend.emails.send({ from: fromAddress(), to, subject, html });
  if (error) throw new Error(typeof error === "string" ? error : error.message || "Email send failed");
  return { id: data && data.id };
}
