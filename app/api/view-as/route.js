import { NextResponse } from "next/server";
import { getRealProfile, createAdminClient } from "../../../lib/supabase/server";
import { VIEW_AS_COOKIE, VIEW_ROLES } from "../../../lib/viewAs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOME = { engineer: "/admin/review", company_owner: "/", inspector: "/", admin: "/admin/review" };

async function adminOnly() {
  const me = await getRealProfile();
  if (!me) return { error: NextResponse.json({ ok: false, error: "Please sign in." }, { status: 401 }) };
  if (me.role !== "admin") return { error: NextResponse.json({ ok: false, error: "Only admins can preview other roles." }, { status: 403 }) };
  return { me };
}

// Companies to preview as (owner / inspector).
export async function GET() {
  const a = await adminOnly(); if (a.error) return a.error;
  const db = createAdminClient();
  const { data } = await db.from("companies").select("id, name, is_internal").order("name");
  return NextResponse.json({ ok: true, companies: (data || []).filter((c) => !c.is_internal) });
}

// Start a preview. Body: { role: "engineer" | "company_owner" | "inspector", companyId? }
export async function POST(req) {
  const a = await adminOnly(); if (a.error) return a.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  if (!VIEW_ROLES.includes(b.role)) return NextResponse.json({ ok: false, error: "Pick a role." }, { status: 400 });
  let value = b.role;
  if (b.role !== "engineer") {
    const db = createAdminClient();
    const { data: c } = await db.from("companies").select("id").eq("id", String(b.companyId || "")).maybeSingle();
    if (!c) return NextResponse.json({ ok: false, error: "Pick a company to preview." }, { status: 400 });
    value = `${b.role}:${c.id}`;
  }
  const res = NextResponse.json({ ok: true, go: HOME[b.role] });
  res.cookies.set(VIEW_AS_COOKIE, value, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 8 * 3600 });
  return res;
}

// Switch back to admin.
export async function DELETE() {
  const res = NextResponse.json({ ok: true, go: HOME.admin });
  res.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
