import { DEFAULT_COMPANY } from "./letterContent";

// Monthly activity statement: a summary of a company's jobs and what was paid.
// Not a bill: with pay-up-front, the balance is normally $0.

const TZ = "America/Phoenix";
const PAY = { paid: "Paid", processing: "Processing", failed: "Failed", unpaid: "Not charged", waived: "No charge", refunded: "Refunded" };

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;

// Month a job belongs to: inspection date if known, else submission date (Arizona time).
function monthOf(job) {
  if (job.inspection_date && /^\d{4}-\d{2}/.test(job.inspection_date)) return job.inspection_date.slice(0, 7);
  const d = new Date(job.submitted_at);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
}

// Job date shown on the statement (MM/DD/YY, Arizona time).
function dateOf(job) {
  let ymd = job.inspection_date && /^\d{4}-\d{2}-\d{2}/.test(job.inspection_date) ? job.inspection_date.slice(0, 10) : null;
  if (!ymd) ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(job.submitted_at));
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

export function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function previousMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(now);
  let y = Number(parts.find((p) => p.type === "year").value), m = Number(parts.find((p) => p.type === "month").value) - 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

async function companyJobs(db, companyId) {
  const { data, error } = await db.from("submissions")
    .select("ref, status, payment_status, amount_cents, paid_at, property_address, client_name, inspector_name, inspection_date, submitted_at")
    .eq("company_id", companyId).eq("is_demo", false).neq("status", "canceled")
    .order("submitted_at", { ascending: true }).limit(5000);
  if (error) throw error;
  return data || [];
}

// Months (newest first) in which the company had jobs.
export async function monthsWithActivity(db, companyId) {
  const jobs = await companyJobs(db, companyId);
  return [...new Set(jobs.map(monthOf))].sort().reverse();
}

export async function buildStatement(db, companyId, month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Bad month");
  const { data: company, error } = await db.from("companies")
    .select("id, name, is_internal, billing_contact, billing_address, billing_city, billing_state, billing_zip, email, phone, payment_method_label")
    .eq("id", companyId).single();
  if (error) throw error;
  const rows = (await companyJobs(db, companyId)).filter((j) => monthOf(j) === month);
  const sum = (pred) => rows.filter(pred).reduce((a, j) => a + (j.amount_cents || 0), 0);
  const charged = (j) => !["waived"].includes(j.payment_status);
  const totals = {
    jobs: rows.length,
    charged: sum(charged),
    paid: sum((j) => j.payment_status === "paid"),
    processing: sum((j) => j.payment_status === "processing"),
    balance: sum((j) => ["unpaid", "failed"].includes(j.payment_status)),
  };
  return { company, month, label: monthLabel(month), rows, totals, generatedAt: new Date().toISOString() };
}

export function statementHtml(st, { portalUrl } = {}) {
  const c = st.company, hh = DEFAULT_COMPANY;
  const addr = [c.billing_address, [c.billing_city, c.billing_state].filter(Boolean).join(", "), c.billing_zip].filter(Boolean).join(" ");
  const td = 'style="padding:7px 8px;border-bottom:1px solid #e6e0d0;font-size:13px;vertical-align:top"';
  const th = 'style="padding:7px 8px;border-bottom:2px solid #132430;font-size:12px;text-align:left;color:#5c6b74;text-transform:uppercase;letter-spacing:.04em"';
  const body = st.rows.length
    ? st.rows.map((j) => `<tr>
        <td ${td}>${esc(dateOf(j))}</td>
        <td ${td}><b>${esc(j.ref)}</b><br/><span style="color:#5c6b74">${esc(j.property_address || "")}</span></td>
        <td ${td}>${esc(j.client_name || "")}</td>
        <td ${td}>${esc(j.inspector_name || "")}</td>
        <td ${td} align="right">${j.payment_status === "waived" ? "—" : money(j.amount_cents)}</td>
        <td ${td}>${esc(PAY[j.payment_status] || j.payment_status)}</td></tr>`).join("")
    : `<tr><td ${td} colspan="6" style="padding:14px 8px;color:#5c6b74">No jobs this month.</td></tr>`;
  const line = (label, value, strong) => `<tr><td style="padding:4px 8px;font-size:14px;${strong ? "font-weight:bold" : "color:#5c6b74"}">${label}</td><td align="right" style="padding:4px 8px;font-size:14px;${strong ? "font-weight:bold" : ""}">${value}</td></tr>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#132430;max-width:760px;margin:0 auto">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:top"><div style="font-family:Georgia,serif;font-size:22px;font-weight:bold">${esc(hh.name)}</div>
      <div style="font-size:13px;color:#5c6b74">${esc(hh.phone)} · ${esc(hh.email)}</div></td>
    <td style="vertical-align:top;text-align:right"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5c6b74">Monthly activity statement</div>
      <div style="font-size:20px;font-weight:bold">${esc(st.label)}</div></td>
  </tr></table>
  <div style="margin:18px 0 14px;padding:12px 14px;background:#f6f2e8;border:1px solid #e6e0d0;border-radius:6px;font-size:14px">
    <b>${esc(c.name)}</b>${c.billing_contact ? `<br/>Attn: ${esc(c.billing_contact)}` : ""}${addr ? `<br/>${esc(addr)}` : ""}${c.email ? `<br/>${esc(c.email)}` : ""}
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <thead><tr><th ${th}>Date</th><th ${th}>Job / property</th><th ${th}>Client</th><th ${th}>Inspector</th><th ${th} style="padding:7px 8px;border-bottom:2px solid #132430;font-size:12px;text-align:right;color:#5c6b74;text-transform:uppercase;letter-spacing:.04em">Amount</th><th ${th}>Payment</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <table cellpadding="0" cellspacing="0" style="margin:14px 0 0 auto;min-width:280px">
    ${line("Jobs", String(st.totals.jobs))}
    ${line("Charged", money(st.totals.charged))}
    ${line("Paid", money(st.totals.paid))}
    ${st.totals.processing ? line("Processing (bank transfers)", money(st.totals.processing)) : ""}
    ${line("Balance", money(st.totals.balance), true)}
  </table>
  <p style="font-size:12px;color:#5c6b74;margin-top:18px">This is a summary of your activity, not a bill. Each job is charged automatically when it's submitted${c.payment_method_label ? ` (payment method on file: ${esc(c.payment_method_label)})` : ""}.${st.totals.balance ? " A balance means a charge didn't go through; please update your payment method." : ""}${portalUrl ? ` <a href="${portalUrl}">View in the portal</a>.` : ""}</p>
</div>`;
}
