import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { invitePerson } from "../../../../lib/invite";
import { deriveRole } from "../../../../lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// People: admins and House & Home office managers. Only admins give or change site-wide roles
// (admin / office manager / engineer); office managers manage company roles.
const SITE = ["admin", "office_manager", "engineer"];
const COMPANY = ["company_owner", "office_manager", "inspector"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const bad = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });

// Before migration 0016 there are no site_role/company_role columns: work them out from `role`.
function withLayers(p) {
  if (p.site_role !== undefined) return p;
  const site = SITE.includes(p.role) ? p.role : null;
  return { ...p, site_role: site, company_role: site ? null : p.company_id ? (p.role === "company_office" ? "office_manager" : p.role) : null };
}

async function listAll(db) {
  const [{ data: people, error: e1 }, { data: companies, error: e2 }] = await Promise.all([
    db.from("profiles").select("*").order("created_at"),
    db.from("companies").select("id, name, is_internal").order("name"),
  ]);
  if (e1 || e2) throw e1 || e2;
  return {
    people: people.map((p) => withLayers({ id: p.id, email: p.email, full_name: p.full_name, phone: p.phone, role: p.role, company_id: p.company_id,
      active: p.active, created_at: p.created_at, ...(p.site_role !== undefined ? { site_role: p.site_role, company_role: p.company_role } : {}) })),
    companies,
  };
}
const internalId = (companies) => (companies.find((c) => c.is_internal) || {}).id || null;

async function ctx() {
  const auth = await requireUser(["admin"]); // admins and office managers
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!db) return { error: bad("Database isn't configured.", 500) };
  const me = auth.profile;
  return { db, me, isAdmin: !me || me.role === "admin" };
}

// Check a site role + company + company role combination. Returns { siteRole, companyId, companyRole } or { error }.
function settle({ siteRole, companyId, companyRole }, companies) {
  siteRole = siteRole || null; companyId = companyId || null; companyRole = companyRole || null;
  if (siteRole && !SITE.includes(siteRole)) return { error: "Unknown site-wide role." };
  if (companyRole && !COMPANY.includes(companyRole)) return { error: "Unknown company role." };
  const co = companies.find((c) => c.id === companyId);
  if (companyId && !co) return { error: "That company doesn't exist." };
  if (siteRole && co && !co.is_internal) return { error: "House & Home staff can only have a company role at House & Home." };
  if (siteRole === "engineer" && !companyId) { companyId = internalId(companies); companyRole = companyId ? companyRole || "inspector" : null; } // engineers default to House & Home
  if (!companyId) companyRole = null;
  else if (!companyRole) companyRole = "inspector";
  if (!siteRole && !companyId) return { error: "Pick a company (or, for House & Home staff, a site-wide role)." };
  return { siteRole, companyId, companyRole };
}

export async function GET() {
  const c = await ctx(); if (c.error) return c.error;
  try {
    return NextResponse.json({ ok: true, ...(await listAll(c.db)), me: c.me && c.me.id, canSiteRoles: c.isAdmin });
  } catch (err) {
    return bad(err.message || "Load failed", 500);
  }
}

// Invite a person. Body: { email, fullName, siteRole, companyId, companyRole, newCompany, sendEmail (default true) }
export async function POST(req) {
  const c = await ctx(); if (c.error) return c.error;
  let body;
  try { body = await req.json(); } catch { return bad("Bad request"); }
  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.fullName || "").trim();
  if (!EMAIL_RE.test(email)) return bad("Enter a valid email.");
  if (body.siteRole && !c.isAdmin) return bad("Only admins can give site-wide roles.", 403);

  try {
    let { companies } = await listAll(c.db);
    let companyId = body.companyId || null;
    const newCompany = String(body.newCompany || "").trim();
    if (newCompany) {
      const { data: existing } = await c.db.from("companies").select("id").ilike("name", newCompany).maybeSingle();
      if (existing) companyId = existing.id;
      else {
        const { data: created, error } = await c.db.from("companies").insert({ name: newCompany }).select("id, name, is_internal").single();
        if (error) throw error;
        companyId = created.id; companies = [...companies, created];
      }
    }
    const s = settle({ siteRole: body.siteRole, companyId, companyRole: body.companyRole }, companies);
    if (s.error) return bad(s.error);

    const r = await invitePerson(c.db, {
      email, fullName, siteRole: s.siteRole, companyRole: s.companyRole, companyId: s.companyId,
      invitedBy: c.me && (c.me.full_name || "House & Home"),
      origin: new URL(req.url).origin, sendWelcome: body.sendEmail !== false,
    });
    if (!r.ok) return bad(r.error, r.status || 400);
    return NextResponse.json({ ok: true, emailed: r.emailed, skipped: Boolean(r.skipped), ...(await listAll(c.db)) });
  } catch (err) {
    console.error("invite error", err);
    return bad(err.message || "Invite failed", 500);
  }
}

// Update a person. Body: { id, siteRole?, companyId?, companyRole?, active?, fullName? }
export async function PATCH(req) {
  const c = await ctx(); if (c.error) return c.error;
  let body;
  try { body = await req.json(); } catch { return bad("Bad request"); }
  if (!body.id) return bad("Missing person");

  try {
    const { people, companies } = await listAll(c.db);
    const person = people.find((p) => p.id === body.id);
    if (!person) return bad("That person doesn't exist.", 404);
    const meId = c.me && c.me.id;

    if (body.siteRole !== undefined && (body.siteRole || null) !== person.site_role && !c.isAdmin) return bad("Only admins can change site-wide roles.", 403);
    if (!c.isAdmin && person.site_role && body.active !== undefined) return bad("Only admins can deactivate House & Home staff.", 403);
    if (!c.isAdmin && person.site_role === "admin") return bad("Only admins can change an admin.", 403);
    if (meId && body.id === meId && ((body.siteRole !== undefined && body.siteRole !== person.site_role && person.site_role === "admin") || body.active === false)) {
      return bad("You can't remove your own admin access.");
    }

    const patch = {};
    const touchesRoles = body.siteRole !== undefined || body.companyId !== undefined || body.companyRole !== undefined;
    if (touchesRoles) {
      const s = settle({
        siteRole: body.siteRole !== undefined ? body.siteRole : person.site_role,
        companyId: body.companyId !== undefined ? body.companyId : person.company_id,
        companyRole: body.companyRole !== undefined ? body.companyRole : (body.companyId !== undefined && body.companyId !== person.company_id ? null : person.company_role),
      }, companies);
      if (s.error) return bad(s.error);
      Object.assign(patch, { site_role: s.siteRole, company_id: s.companyId, company_role: s.companyRole, role: deriveRole(s.siteRole, s.companyRole) });
    }
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.fullName !== undefined) patch.full_name = String(body.fullName).trim() || null;

    let { error } = await c.db.from("profiles").update(patch).eq("id", body.id);
    if (error && /site_role|company_role|column/i.test(error.message || "")) { // before migration 0016
      const { site_role, company_role, ...rest } = patch; // eslint-disable-line no-unused-vars
      ({ error } = await c.db.from("profiles").update(rest).eq("id", body.id));
    }
    if (error) throw error;
    if (patch.active === false) {
      // Sign them out everywhere and block sign-in until reactivated.
      await c.db.auth.admin.updateUserById(body.id, { ban_duration: "876000h" });
    } else if (patch.active === true) {
      await c.db.auth.admin.updateUserById(body.id, { ban_duration: "none" });
    }
    return NextResponse.json({ ok: true, ...(await listAll(c.db)) });
  } catch (err) {
    console.error("people update error", err);
    return bad(err.message || "Update failed", 500);
  }
}
