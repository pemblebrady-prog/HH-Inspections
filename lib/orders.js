import { sendEmail } from "./email";
import { officeEmails } from "./contacts";

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export async function alertOrder(db, order, origin) {
  let to = (process.env.ORDER_ALERT_EMAILS || process.env.REVIEW_ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length) {
    to = await officeEmails(db);
  }
  const r = order.requester || {};
  const full = await db.from("orders").select("*").eq("id", order.id).maybeSingle();
  const o = (full && full.data) || order;
  const yn = (b) => (b === true ? "Yes" : b === false ? "No" : "-");
  const oc = o.occupant || {}, a = o.access || {};
  const rows = [
    ["Type of inspection", o.inspection_detail], ["Property", o.property_address],
    ["Requested by", [r.name, r.company].filter(Boolean).join(", ")], ["Phone", r.phone], ["Email", r.email], ["Requester address", r.address],
    ["Home occupied", yn(oc.occupied)], ["Occupant", [oc.name, oc.phone, oc.email].filter(Boolean).join(" · ")], ["Occupant informed", oc.occupied ? yn(oc.informed) : ""],
    ...((oc.others || []).map((x, i) => [`Other occupant ${i + 1}`, [x.name, x.phone, x.email].filter(Boolean).join(" · ")])),
    ...((o.report_copies || []).map((c, i) => [`Report copy ${i + 1}`, [c.name, c.email].filter(Boolean).join(" · ")])),
    ["Yard fenced", yn(a.fenced)], ["Locked gates", yn(a.lockedGates)], ["Dogs", yn(a.dogs)], ["Under-home access locked", yn(a.underHomeLocked)],
    ["Contractor lockbox", yn(a.lockbox)], ["Comments", o.comments],
  ].filter(([, val]) => val && val !== "-");
  const table = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:8px 0 14px">${rows.map(([k, val]) => `<tr><td style="padding:4px 12px 4px 0;color:#5c6b74;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(val)}</td></tr>`).join("")}</table>`;
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:560px">
    <p><b>New inspection request ${esc(order.ref)}</b></p>
    <p>${esc(order.property_address)}<br/>${esc(order.inspection_detail)}</p>
    ${table}
    <p style="color:#5c6b74;font-size:13px">Lockbox codes are shown in the portal only.</p>
    ${origin ? `<p><a href="${origin}/admin/orders/${encodeURIComponent(order.ref)}" style="display:inline-block;background:#0E3A52;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Schedule it</a></p>` : ""}
  </div>`;
  await Promise.all(to.map((addr) => sendEmail({ to: addr, subject: `Inspection request ${order.ref} from ${r.name || "website"}: ${order.property_address || ""}`, html }).catch(() => {})));
}

// What the submission form can pre-fill from an order.
export function orderPrefill(o) {
  const r = o.requester || {};
  return {
    orderId: o.id, orderRef: o.ref,
    propertyAddress: o.property_address || "",
    clientName: r.name || "",
    sendReportTo: r.email || "",
    inspectionType: o.inspection_type || "",
    date: o.scheduled_at ? new Date(o.scheduled_at).toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }) : "",
  };
}
