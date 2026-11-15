import { getEntry, recentEntries, mapEntry, allowedForms, gfEnabled } from "./gravity";
import { sendEmail } from "./email";

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Create (or return) the order for one Gravity Forms entry. Safe to call repeatedly.
export async function importEntry(db, formId, entryId, { origin, notify = true } = {}) {
  formId = Number(formId); entryId = Number(entryId);
  if (!allowedForms().includes(formId)) throw new Error("That form isn't connected to the portal.");
  const { data: existing } = await db.from("orders").select("ref, id").eq("source_form_id", formId).eq("source_entry_id", entryId).maybeSingle();
  if (existing) return { ...existing, created: false };

  const entry = await getEntry(entryId);
  if (Number(entry.form_id) !== formId) throw new Error("Entry doesn't belong to that form.");
  return createOrderFromEntry(db, entry, { origin, notify });
}

// Create (or return) the order for an entry we already have (sent by the website, or fetched).
export async function createOrderFromEntry(db, entry, { origin, notify = true } = {}) {
  const formId = Number(entry.form_id), entryId = Number(entry.id);
  const { data: existing } = await db.from("orders").select("ref, id").eq("source_form_id", formId).eq("source_entry_id", entryId).maybeSingle();
  if (existing) return { ...existing, created: false };
  const row = mapEntry(entry);
  const { data, error } = await db.from("orders").insert(row).select("id, ref, property_address, inspection_detail, requester").single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const { data: again } = await db.from("orders").select("ref, id").eq("source_form_id", formId).eq("source_entry_id", entryId).single();
      return { ...again, created: false };
    }
    throw error;
  }
  if (notify) await alertOrder(db, data, origin).catch((e) => console.error("order alert failed", e.message));
  return { ...data, created: true };
}

// Pull recent entries from every connected form (catches any whose redirect never happened).
export async function syncOrders(db, { origin } = {}) {
  if (!gfEnabled()) throw new Error("Gravity Forms isn't connected yet.");
  let created = 0, seen = 0, skipped = 0;
  const forms = allowedForms();
  if (!forms.length) throw new Error("No forms are connected (GF_FORM_IDS is empty).");
  for (const formId of forms) {
    const entries = await recentEntries(formId, 25);
    for (const e of entries) {
      if (e.status && e.status !== "active") { skipped++; continue; } // spam/trash
      seen++;
      const r = await importEntry(db, formId, e.id, { origin });
      if (r.created) created++;
    }
  }
  return { seen, created, skipped, forms };
}

export async function alertOrder(db, order, origin) {
  let to = (process.env.ORDER_ALERT_EMAILS || process.env.REVIEW_ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length) {
    const { data } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
    to = (data || []).map((p) => p.email);
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
