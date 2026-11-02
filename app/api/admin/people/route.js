import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { invitePerson } from "../../../../lib/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["admin", "company_owner", "inspector"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function listAll(db) {
  const [{ data: people, error: e1 }, { data: companies, error: e2 }] = await Promise.all([
    db.from("profiles").select("id, email, full_name, phone, role, company_id, active, created_at").order("created_at"),
    db.from("companies").select("id, name, is_internal").order("name"),
  ]);
  if (e1 || e2) throw e1 || e2;
  return { people, companies };
}

// List everyone + companies (admins only).
export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  try {
    return NextResponse.json({ ok: true, ...(await listAll(db)), me: auth.profile && auth.profile.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || "Load failed" }, { status: 500 });
  }
}

// Invite a person, or add a company. Body: { action: "invite", email, fullName, role, companyId, newCompany }
export async function POST(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.fullName || "").trim();
  const role = ROLES.includes(body.role) ? body.role : "inspector";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });

  try {
    // Optional: create the company on the spot.
    let companyId = body.companyId || null;
    const newCompany = String(body.newCompany || "").trim();
    if (newCompany) {
      const { data: existing } = await db.from("companies").select("id").ilike("name", newCompany).maybeSingle();
      if (existing) companyId = existing.id;
      else {
        const { data: created, error } = await db.from("companies").insert({ name: newCompany }).select("id").single();
        if (error) throw error;
        companyId = created.id;
      }
    }
    if (role !== "admin" && !companyId) {
      return NextResponse.json({ ok: false, error: "Pick a company for inspectors and company owners." }, { status: 400 });
    }

    const r = await invitePerson(db, {
      email, fullName, role, companyId,
      invitedBy: auth.profile && (auth.profile.full_name || "House & Home"),
      origin: new URL(req.url).origin,
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status || 400 });
    const emailed = r.emailed;
    return NextResponse.json({ ok: true, emailed, ...(await listAll(db)) });
  } catch (err) {
    console.error("invite error", err);
    return NextResponse.json({ ok: false, error: err.message || "Invite failed" }, { status: 500 });
  }
}

// Update a person. Body: { id, role?, companyId?, active?, fullName? }
export async function PATCH(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ ok: false, error: "Missing person" }, { status: 400 });

  const me = auth.profile && auth.profile.id;
  if (me && body.id === me && ((body.role && body.role !== "admin") || body.active === false)) {
    return NextResponse.json({ ok: false, error: "You can't remove your own admin access." }, { status: 400 });
  }

  const patch = {};
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return NextResponse.json({ ok: false, error: "Unknown role" }, { status: 400 });
    patch.role = body.role;
  }
  if (body.companyId !== undefined) patch.company_id = body.companyId || null;
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.fullName !== undefined) patch.full_name = String(body.fullName).trim() || null;

  try {
    const { error } = await db.from("profiles").update(patch).eq("id", body.id);
    if (error) throw error;
    if (patch.active === false) {
      // Sign them out everywhere and block sign-in until reactivated.
      await db.auth.admin.updateUserById(body.id, { ban_duration: "876000h" });
    } else if (patch.active === true) {
      await db.auth.admin.updateUserById(body.id, { ban_duration: "none" });
    }
    return NextResponse.json({ ok: true, ...(await listAll(db)) });
  } catch (err) {
    console.error("people update error", err);
    return NextResponse.json({ ok: false, error: err.message || "Update failed" }, { status: 500 });
  }
}
