import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../lib/supabase/server";
import { invitePerson } from "../../../lib/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Company owners and office managers manage their own company's people. Both can invite inspectors
// and turn inspectors on/off; only owners can make someone an office manager (or change them back).
async function load(db, companyId) {
  const { data, error } = await db.from("profiles")
    .select("*")
    .eq("company_id", companyId).order("created_at");
  if (error) throw error;
  return data.map((p) => ({ id: p.id, email: p.email, full_name: p.full_name, phone: p.phone, role: p.role, active: p.active, onboarded_at: p.onboarded_at, created_at: p.created_at }));
}

async function ctx() {
  const auth = await requireUser(["company_owner"]);
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!auth.profile || !db) return { error: NextResponse.json({ ok: false, error: "Sign-in isn't configured." }, { status: 500 }) };
  if (!auth.profile.company_id) return { error: NextResponse.json({ ok: false, error: "Your account isn't linked to a company yet." }, { status: 400 }) };
  return { me: auth.profile, db };
}

export async function GET() {
  const c = await ctx(); if (c.error) return c.error;
  try { return NextResponse.json({ ok: true, team: await load(c.db, c.me.company_id), me: c.me.id, owner: c.me.role === "company_owner" }); }
  catch (e) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

// Invite an inspector into my company. Body: { email, fullName }
export async function POST(req) {
  const c = await ctx(); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const companyRole = b.companyRole === "office_manager" && c.me.role === "company_owner" ? "office_manager" : "inspector";
  const r = await invitePerson(c.db, {
    email: b.email, fullName: b.fullName, companyRole, companyId: c.me.company_id,
    invitedBy: c.me.full_name || (c.me.company && c.me.company.name), origin: new URL(req.url).origin,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status || 400 });
  return NextResponse.json({ ok: true, emailed: r.emailed, team: await load(c.db, c.me.company_id) });
}

// Deactivate / reactivate someone, or (owners) switch them between inspector and office manager.
// Body: { id, active } or { id, companyRole: "inspector" | "office_manager" }
export async function PATCH(req) {
  const c = await ctx(); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const { data: person } = await c.db.from("profiles").select("id, role, company_id").eq("id", b.id).maybeSingle();
  const isOwner = c.me.role === "company_owner";
  const changeable = person && person.company_id === c.me.company_id && person.id !== c.me.id
    && (person.role === "inspector" || (isOwner && person.role === "company_office"));
  if (!changeable) {
    return NextResponse.json({ ok: false, error: isOwner ? "You can only change inspectors and office managers in your company." : "You can only change inspectors in your company." }, { status: 403 });
  }
  if (b.companyRole !== undefined) {
    if (!isOwner || !["inspector", "office_manager"].includes(b.companyRole)) return NextResponse.json({ ok: false, error: "Only the company owner can change roles." }, { status: 403 });
    const { error } = await c.db.from("profiles").update({ company_role: b.companyRole, role: b.companyRole === "office_manager" ? "company_office" : "inspector" }).eq("id", person.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, team: await load(c.db, c.me.company_id) });
  }
  const active = Boolean(b.active);
  const { error } = await c.db.from("profiles").update({ active }).eq("id", person.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await c.db.auth.admin.updateUserById(person.id, { ban_duration: active ? "none" : "876000h" });
  return NextResponse.json({ ok: true, team: await load(c.db, c.me.company_id) });
}
