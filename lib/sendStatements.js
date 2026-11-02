import { buildStatement, statementHtml, previousMonth } from "./activityStatement";
import { sendEmail } from "./email";

// Email each company's owners (and billing email) their statement for a month.
// Companies with no jobs that month are skipped. Returns a per-company summary.
export async function sendMonthlyStatements(db, { month = previousMonth(), origin, onlyCompanyId } = {}) {
  let q = db.from("companies").select("id, name, email, is_internal").eq("is_internal", false);
  if (onlyCompanyId) q = q.eq("id", onlyCompanyId);
  const { data: companies, error } = await q;
  if (error) throw error;
  const out = [];
  for (const c of companies || []) {
    const st = await buildStatement(db, c.id, month);
    if (!st.rows.length) { out.push({ company: c.name, skipped: "no jobs" }); continue; }
    const { data: owners } = await db.from("profiles").select("email").eq("company_id", c.id).eq("role", "company_owner").eq("active", true);
    const to = [...new Set([...(owners || []).map((o) => o.email), c.email].filter(Boolean).map((e) => e.toLowerCase()))];
    if (!to.length) { out.push({ company: c.name, skipped: "no recipients" }); continue; }
    const html = statementHtml(st, { portalUrl: origin ? `${origin}/statement?month=${month}` : null });
    const results = [];
    for (const addr of to) {
      try { const r = await sendEmail({ to: addr, subject: `${st.label} activity statement: ${c.name}`, html }); results.push({ to: addr, ok: !r.simulated }); }
      catch (e) { results.push({ to: addr, ok: false, error: e.message }); }
    }
    out.push({ company: c.name, jobs: st.totals.jobs, results });
  }
  return { month, companies: out };
}
