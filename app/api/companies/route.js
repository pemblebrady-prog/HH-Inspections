import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../lib/supabase/server";
import { getDrive, rootFolderId, readCompanies } from "../../../lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always re-fetch; never cache this response

// Companies for the form's "Inspecting on behalf of a company?" list.
// From the database (so renamed or turned-off companies show correctly); the old Drive list is a fallback.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (db) {
    const { data, error } = await db.from("companies").select("name, is_internal, active").order("name");
    if (!error && data) {
      const companies = data.filter((c) => !c.is_internal && c.active !== false).map((c) => ({ name: c.name }));
      return NextResponse.json({ ok: true, companies });
    }
    if (error) console.error("companies read error (database)", error.message);
  }
  const drive = await getDrive();
  if (!drive) return NextResponse.json({ ok: true, companies: [], simulated: true });
  try {
    const { companies } = await readCompanies(drive, rootFolderId());
    companies.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, companies });
  } catch (err) {
    console.error("companies read error", err);
    return NextResponse.json({ ok: false, error: err.message || "Read failed" }, { status: 500 });
  }
}
