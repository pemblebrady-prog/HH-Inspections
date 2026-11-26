import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

// The signed-in person's basic profile (for headers and menus).
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const p = auth.profile;
  if (!p) return NextResponse.json({ ok: true, profile: null });
  return NextResponse.json({ ok: true, profile: {
    id: p.id, email: p.email, full_name: p.full_name, role: p.role, site_role: p.site_role || null, company_role: p.company_role || null,
    company: p.company ? { name: p.company.name, is_internal: p.company.is_internal } : null,
    viewingAs: p.viewingAs || null, realRole: p.realRole || p.role,
  } });
}

// Change your own name. Body: { fullName }
export async function PATCH(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const p = auth.profile;
  if (!p) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (p.viewingAs) return NextResponse.json({ ok: false, error: "Switch back from previewing first." }, { status: 400 });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const fullName = String(b.fullName || "").trim().slice(0, 120);
  if (!fullName) return NextResponse.json({ ok: false, error: "Enter your name." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  const { error } = await db.from("profiles").update({ full_name: fullName }).eq("id", p.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, full_name: fullName });
}
