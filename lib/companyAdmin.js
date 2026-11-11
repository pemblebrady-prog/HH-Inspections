import { getDefaultPriceCents, effectivePriceCents, parseDollars } from "./pricing";
import { getDrive, rootFolderId, uploadCompanyLogo, addOrUpdateCompany } from "./drive";

const s = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const COMPANY_COLS = "id, name, phone, email, billing_contact, billing_address, billing_city, billing_state, billing_zip, logo_drive_file_id, "
  + "is_internal, price_cents, active, deactivated_at, pay_per_job, created_at, onboarded_at, stripe_customer_id, default_payment, payment_method_label, payment_ready_at, payment_status_note";

// Some columns arrive with later database updates; read without them if they're not there yet.
async function companies(db, build) {
  let res = await build(COMPANY_COLS);
  if (res.error && /pay_per_job/.test(res.error.message || "")) res = await build(COMPANY_COLS.replace(" pay_per_job,", ""));
  return res;
}

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };

// Every company with its price, status and a few counts (admin Companies page).
export async function listCompanies(db) {
  const [{ data: list, error }, { data: people }, { data: jobs }, def] = await Promise.all([
    companies(db, (cols) => db.from("companies").select(cols).order("name")),
    db.from("profiles").select("company_id, role, active"),
    db.from("submissions").select("company_id, submitted_at, payment_status").eq("is_demo", false).order("submitted_at", { ascending: false }).limit(5000),
    getDefaultPriceCents(db),
  ]);
  if (error) throw error;
  const since = monthStart();
  return {
    defaultPriceCents: def,
    companies: list.map((c) => {
      const mine = (jobs || []).filter((j) => j.company_id === c.id);
      return {
        ...c,
        active: c.active !== false,
        effective_price_cents: effectivePriceCents(c, def),
        people: (people || []).filter((p) => p.company_id === c.id && p.active).length,
        owners: (people || []).filter((p) => p.company_id === c.id && p.active && p.role === "company_owner").length,
        jobs_total: mine.length,
        jobs_this_month: mine.filter((j) => j.submitted_at >= since).length,
        last_job_at: mine[0] ? mine[0].submitted_at : null,
        failed_payments: mine.filter((j) => j.payment_status === "failed").length,
      };
    }),
  };
}

// One company with its people and jobs (admin company page).
export async function companyDetail(db, id) {
  const [{ data: company, error }, { data: people }, { data: jobs }, def] = await Promise.all([
    companies(db, (cols) => db.from("companies").select(cols).eq("id", id).maybeSingle()),
    db.from("profiles").select("id, email, full_name, phone, role, active, certificate_number, created_at").eq("company_id", id).order("created_at"),
    db.from("submissions").select("id, ref, status, payment_status, amount_cents, property_address, client_name, inspector_name, inspection_date, submitted_at")
      .eq("company_id", id).eq("is_demo", false).order("submitted_at", { ascending: false }).limit(200),
    getDefaultPriceCents(db),
  ]);
  if (error) throw error;
  if (!company) return null;
  const all = jobs || [];
  const sum = (arr) => arr.reduce((a, j) => a + (j.amount_cents || 0), 0);
  return {
    company: { ...company, active: company.active !== false, effective_price_cents: effectivePriceCents(company, def) },
    defaultPriceCents: def,
    people: people || [],
    jobs: all,
    totals: {
      jobs: all.length,
      charged: sum(all.filter((j) => ["paid", "processing", "failed"].includes(j.payment_status))),
      paid: sum(all.filter((j) => j.payment_status === "paid")),
      processing: sum(all.filter((j) => j.payment_status === "processing")),
      failed: all.filter((j) => j.payment_status === "failed").length,
    },
  };
}

// Admin edits. body: { details?: {...}, price?: "" | "150", active?: bool }
export async function updateCompany(db, id, body) {
  const { data: current, error: e0 } = await companies(db, (cols) => db.from("companies").select(cols).eq("id", id).maybeSingle());
  if (e0) throw e0;
  if (!current) return { error: "Company not found.", status: 404 };
  const patch = {};

  if (body.details) {
    const d = body.details;
    const map = { phone: "phone", email: "email", billingContact: "billing_contact", billingAddress: "billing_address", billingCity: "billing_city", billingState: "billing_state", billingZip: "billing_zip" };
    for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) patch[col] = s(d[k]) || null;
    if (patch.email) patch.email = patch.email.toLowerCase();
    if (patch.email && !EMAIL_RE.test(patch.email)) return { error: "Check the company email.", status: 400 };
    if (patch.billing_state) patch.billing_state = /^(az|arizona)$/i.test(patch.billing_state) ? "AZ" : patch.billing_state;
  }
  if (body.price !== undefined) {
    if (current.is_internal) return { error: "House & Home's own jobs are never charged.", status: 400 };
    const cents = parseDollars(body.price);
    if (Number.isNaN(cents)) return { error: "Enter a price like 135 or 135.00, or leave it blank to use the default.", status: 400 };
    if (cents != null && cents > 100000) return { error: "That price looks too high.", status: 400 };
    patch.price_cents = cents;
  }
  if (body.payPerJob !== undefined) {
    if (current.is_internal) return { error: "House & Home's own jobs are never charged.", status: 400 };
    patch.pay_per_job = Boolean(body.payPerJob);
  }
  if (body.active !== undefined) {
    if (current.is_internal && body.active === false) return { error: "House & Home's own company can't be turned off.", status: 400 };
    patch.active = Boolean(body.active);
    patch.deactivated_at = body.active ? null : new Date().toISOString();
  }
  if (!Object.keys(patch).length) return { ok: true };

  const { error } = await db.from("companies").update(patch).eq("id", id);
  if (error) {
    if (/pay_per_job/i.test(error.message)) return { error: "Run database update 0013 in Supabase first.", status: 500 };
    if (/active|deactivated_at|null value/i.test(error.message)) return { error: "Run database update 0008 in Supabase first.", status: 500 };
    throw error;
  }
  if (body.details) await syncDrive({ ...current, ...patch }).catch((e) => console.error("drive company sync failed", e.message));
  return { ok: true };
}

// Logo upload (letters read the logo from Drive).
export async function saveCompanyLogo(db, id, file) {
  const drive = await getDrive();
  if (!drive) return { error: "Google Drive isn't connected.", status: 500 };
  const { data: c } = await companies(db, (cols) => db.from("companies").select(cols).eq("id", id).maybeSingle());
  if (!c) return { error: "Company not found.", status: 404 };
  const buffer = Buffer.from(await file.arrayBuffer());
  const logoId = await uploadCompanyLogo(drive, rootFolderId(), `${c.name}-logo.png`, file.type, buffer);
  const { error } = await db.from("companies").update({ logo_drive_file_id: logoId }).eq("id", id);
  if (error) throw error;
  await syncDrive({ ...c, logo_drive_file_id: logoId }).catch((e) => console.error("drive company sync failed", e.message));
  return { ok: true, logoId };
}

// Keep the Drive company list (used by the letter generator) matching the database.
async function syncDrive(c) {
  const drive = await getDrive();
  if (!drive) return;
  await addOrUpdateCompany(drive, rootFolderId(), {
    name: c.name, logoFileId: c.logo_drive_file_id || undefined, phone: c.phone || "", email: c.email || "",
    billingContact: c.billing_contact || "", billingAddress: c.billing_address || "",
    billingCity: c.billing_city || "", billingState: c.billing_state || "", billingZip: c.billing_zip || "",
  });
}
