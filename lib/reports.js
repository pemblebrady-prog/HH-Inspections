// Admin Reports: every job, filtered, with totals and a spreadsheet (CSV) download.

export const STATUS_OPTIONS = [["submitted", "Needs review"], ["under_review", "Under review"], ["certified", "Certified"], ["delivered", "Delivered"], ["on_hold", "On hold"], ["uploading", "Uploading photos"], ["canceled", "Canceled"]];
export const PAYMENT_OPTIONS = [["paid", "Paid"], ["processing", "Processing"], ["failed", "Failed"], ["unpaid", "Not charged"], ["waived", "No charge"], ["refunded", "Refunded"]];
const LABEL = Object.fromEntries([...STATUS_OPTIONS, ...PAYMENT_OPTIONS]);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

// Clean the filters from the page's query string.
export function readFilters(q = {}) {
  const pick = (v, ok) => (ok(v) ? v : "");
  return {
    from: pick(q.from, (v) => DAY.test(v || "")), to: pick(q.to, (v) => DAY.test(v || "")),
    company: pick(q.company, (v) => UUID.test(v || "")), inspector: pick(q.inspector, (v) => UUID.test(v || "")),
    engineer: pick(q.engineer, (v) => UUID.test(v || "")),
    status: pick(q.status, (v) => STATUS_OPTIONS.some(([k]) => k === v)), payment: pick(q.payment, (v) => PAYMENT_OPTIONS.some(([k]) => k === v)),
    source: pick(q.source, (v) => ["order", "outside"].includes(v)),
    demo: q.demo === "1" ? "1" : "",
  };
}

const BASE = "id, ref, status, payment_status, amount_cents, property_address, client_name, inspector_name, inspection_type, inspection_date, submitted_at, certified_at, delivered_at, order_id, "
  + "company:companies(name, is_internal), inspector:profiles!submissions_inspector_id_fkey(full_name, email), reviewer:profiles!submissions_reviewed_by_fkey(full_name, email)";

export async function runReport(db, f, { limit = 5000 } = {}) {
  const build = (cols) => {
    let q = db.from("submissions").select(cols).order("submitted_at", { ascending: false }).limit(limit);
    if (!f.demo) q = q.eq("is_demo", false);
    if (f.from) q = q.gte("submitted_at", `${f.from}T00:00:00-07:00`);
    if (f.to) { const d = new Date(`${f.to}T00:00:00-07:00`); d.setUTCDate(d.getUTCDate() + 1); q = q.lt("submitted_at", d.toISOString()); }
    if (f.company) q = q.eq("company_id", f.company);
    if (f.inspector) q = q.eq("inspector_id", f.inspector);
    if (f.engineer) q = q.eq("reviewed_by", f.engineer);
    if (f.status) q = q.eq("status", f.status);
    if (f.payment) q = q.eq("payment_status", f.payment);
    if (f.source === "order") q = q.not("order_id", "is", null);
    if (f.source === "outside") q = q.is("order_id", null);
    return q;
  };
  let r = await build(BASE + ", order:orders!submissions_order_id_fkey(ref, isn_order_number)");
  if (r.error) r = await build(BASE + ", order:orders!submissions_order_id_fkey(ref)");
  if (r.error) r = await build(BASE);
  if (r.error) throw r.error;
  const rows = r.data || [];
  const sum = (pred) => rows.filter(pred).reduce((a, j) => a + (j.amount_cents || 0), 0);
  const charged = (j) => ["paid", "processing", "failed"].includes(j.payment_status);
  const totals = {
    jobs: rows.length,
    charged: sum(charged),
    paid: sum((j) => j.payment_status === "paid"),
    // Still owed: charges that are clearing or failed, and outside jobs not charged yet.
    outstanding: sum((j) => ["processing", "failed"].includes(j.payment_status) || (j.payment_status === "unpaid" && !(j.company && j.company.is_internal))),
    delivered: rows.filter((j) => j.status === "delivered").length,
  };
  return { rows, totals, capped: rows.length >= limit };
}

const who = (p, fallback) => (p ? p.full_name || p.email : fallback || "");
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }) : "");

export function reportRow(j) {
  return {
    job: j.ref, submitted: day(j.submitted_at), inspected: j.inspection_date || "", property: j.property_address || "", client: j.client_name || "",
    company: j.company ? j.company.name : "", inspector: who(j.inspector, j.inspector_name), engineer: who(j.reviewer),
    type: j.inspection_type || "", status: LABEL[j.status] || j.status, payment: LABEL[j.payment_status] || j.payment_status,
    amount: j.payment_status === "waived" ? 0 : (j.amount_cents || 0) / 100,
    order: j.order ? j.order.ref : "", isn: j.order && j.order.isn_order_number ? j.order.isn_order_number : "",
    certified: day(j.certified_at), delivered: day(j.delivered_at),
  };
}

const COLS = [["job", "Job"], ["submitted", "Submitted"], ["inspected", "Inspected"], ["property", "Property"], ["client", "Client"], ["company", "Company"],
  ["inspector", "Inspector"], ["engineer", "Engineer"], ["type", "Inspection type"], ["status", "Status"], ["payment", "Payment"], ["amount", "Amount"],
  ["order", "Order"], ["isn", "ISN #"], ["certified", "Certified"], ["delivered", "Delivered"]];

export function toCsv(rows) {
  const cell = (v) => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
  return [COLS.map(([, h]) => h).join(","), ...rows.map((j) => { const r = reportRow(j); return COLS.map(([k]) => cell(r[k])).join(","); })].join("\r\n");
}
