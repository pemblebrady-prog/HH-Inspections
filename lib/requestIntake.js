import { mapInspectionType } from "./gravity";
import { sendEmail } from "./email";

import { MAIN_TYPES, FOUNDATION_TYPES, CONVENTIONAL_TYPES } from "./requestOptions";
export { MAIN_TYPES, FOUNDATION_TYPES, CONVENTIONAL_TYPES };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const s = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const yn = (v) => (v === true || v === "Yes" ? true : v === false || v === "No" ? false : null);
const digits = (p) => String(p || "").replace(/\D/g, "");
function esc(x) { return String(x || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function addr(a = {}) {
  if (!s(a.street) && !s(a.city) && !s(a.zip)) return ""; // state alone (pre-filled "AZ") isn't an address
  const st = /^(az|arizona)$/i.test(s(a.state)) ? "AZ" : s(a.state);
  const line1 = [s(a.street), s(a.line2)].filter(Boolean).join(", ");
  const city = [s(a.city), [st, s(a.zip, 10)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, city].filter(Boolean).join(", ");
}

// Validate the submitted request. Returns { errors } or { row } ready for the orders table.
export function buildOrderFromRequest(b) {
  const errors = {};
  const main = s(b.mainType), other = s(b.otherType, 200);
  if (!MAIN_TYPES.includes(main) && !other) errors.mainType = "Choose the type of inspection.";
  if (main === MAIN_TYPES[0] && !FOUNDATION_TYPES.includes(s(b.foundationType))) errors.foundationType = "Choose the foundation inspection type.";
  if (main === MAIN_TYPES[1] && !CONVENTIONAL_TYPES.includes(s(b.conventionalType))) errors.conventionalType = "Choose the conventional loan type.";

  const r = b.requester || {};
  if (!s(r.first) || !s(r.last)) errors.requesterName = "Enter your first and last name.";
  if (digits(r.phone).length < 10) errors.requesterPhone = "Enter a 10-digit phone number.";
  if (!EMAIL_RE.test(s(r.email))) errors.requesterEmail = "Enter a valid email.";

  const p = b.property || {};
  if (!s(p.street) || !s(p.city) || !s(p.zip, 10)) errors.property = "Enter the home's street, city and ZIP.";

  const oc = b.occupant || {};
  const occupied = yn(oc.occupied);
  const copies = (Array.isArray(b.copies) ? b.copies : []).slice(0, 2)
    .map((c) => ({ name: [s(c.first), s(c.last)].filter(Boolean).join(" "), email: s(c.email).toLowerCase() }))
    .filter((c) => c.email || c.name);
  copies.forEach((c, i) => { if (c.email && !EMAIL_RE.test(c.email)) errors[`copy${i}`] = "Check this email address."; });

  if (Object.keys(errors).length) return { errors };

  const t = MAIN_TYPES.includes(main) ? mapInspectionType(main, s(b.foundationType), s(b.conventionalType)) : { type: "Unknown", detail: other };
  const a = b.access || {};
  const others = yn(b.otherOccupants) && s((b.other || {}).first)
    ? [{ name: [s(b.other.first), s(b.other.last)].filter(Boolean).join(" "), phone: s(b.other.phone, 40), email: s(b.other.email).toLowerCase() }] : [];

  return { row: {
    source: "portal",
    requested_at: new Date().toISOString(),
    inspection_type: t.type, inspection_detail: t.detail,
    property_address: addr(p),
    requester: { company: s(r.company), name: `${s(r.first)} ${s(r.last)}`, email: s(r.email).toLowerCase(), phone: s(r.phone, 40), address: addr(r.address) },
    occupant: occupied === null ? {} : {
      occupied, name: occupied ? [s(oc.first), s(oc.last)].filter(Boolean).join(" ") : "",
      phone: occupied ? s(oc.phone, 40) : "", email: occupied ? s(oc.email).toLowerCase() : "",
      informed: occupied ? yn(oc.informed) : null, others,
    },
    access: {
      fenced: yn(a.fenced), lockedGates: yn(a.lockedGates), dogs: yn(a.dogs), underHomeLocked: yn(a.underHomeLocked),
      lockbox: yn(a.lockbox), lockboxCode: yn(a.lockbox) ? s(a.lockboxCode, 60) : "",
    },
    report_copies: copies.filter((c) => c.email),
    comments: s(b.comments, 3000),
    raw: { mainType: main, foundationType: s(b.foundationType), conventionalType: s(b.conventionalType), otherType: other },
  } };
}

// Same wording the website's Gravity Forms confirmation email uses today.
export async function sendRequestConfirmation(order) {
  const to = order.requester && order.requester.email;
  if (!to) return;
  const street = (order.property_address || "").split(",")[0];
  await sendEmail({
    to,
    subject: "Confirmation of manufactured home engineering inspection request",
    html: `<div style="font-family:Arial,sans-serif;color:#132430;max-width:560px;line-height:1.5">
      <p>Thank you for ordering your inspection for ${esc(street)}.</p>
      <p>Your request number is <b>${esc(order.ref)}</b>.</p>
      <p>Your order has been received and will be processed by our office. We will contact you shortly, via email, regarding the date and time of your inspection.</p>
      <p>Also included in the email will be the cost of the inspection and your ability to pay for the inspection online. If you do not wish to pay online you may call our office at 520-599-7798 to submit payment. If payment is not received before 5pm the day before the inspection is scheduled, the inspection will NOT proceed.</p>
      <p>For the safety of our inspectors please ensure that all occupants of the home and/or property are notified of the inspection, and that all areas around and under the home are accessible (no locks). If the inspector can not access necessary areas a return trip fee will be charged.</p>
      <p>All inspections will be performed weather permitting. If an inspection needs to be postponed due to weather, we will perform the inspection as soon as possible. No extra trip charges apply.</p>
      <p>A cancellation fee of $25.00 will apply to all cancelled inspections.</p>
      <p>Thank you again for using House and Home and we look forward to working with you.</p>
      <p style="color:#5c6b74;font-size:13px"><em>Do not reply to this email. If you need to contact us please call 520-599-7798.</em></p></div>`,
  });
}
