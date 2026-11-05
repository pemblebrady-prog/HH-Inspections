import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../../lib/supabase/server";
import { companyDetail, updateCompany, saveCompanyLogo } from "../../../../../lib/companyAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const auth = await requireUser(["admin"]);
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!db) return { error: NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 }) };
  return { db };
}
const fail = (e) => NextResponse.json({ ok: false, error: /pay_per_job/.test(e.message || "") ? "Run database update 0013 in Supabase first." : e.message || String(e) }, { status: 500 });

export async function GET(_req, { params }) {
  const c = await ctx(); if (c.error) return c.error;
  try {
    const d = await companyDetail(c.db, params.id);
    if (!d) return NextResponse.json({ ok: false, error: "Company not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...d });
  } catch (e) { return fail(e); }
}

// Body: { details?, price?, active? }
export async function PATCH(req, { params }) {
  const c = await ctx(); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  try {
    const r = await updateCompany(c.db, params.id, b);
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: r.status || 400 });
    return NextResponse.json({ ok: true, ...(await companyDetail(c.db, params.id)) });
  } catch (e) { return fail(e); }
}

// Logo upload (multipart, field "logo").
export async function POST(req, { params }) {
  const c = await ctx(); if (c.error) return c.error;
  try {
    const file = (await req.formData()).get("logo");
    if (!file || typeof file === "string" || !file.size) return NextResponse.json({ ok: false, error: "Choose an image." }, { status: 400 });
    const r = await saveCompanyLogo(c.db, params.id, file);
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: r.status || 400 });
    return NextResponse.json({ ok: true, ...(await companyDetail(c.db, params.id)) });
  } catch (e) { return fail(e); }
}
