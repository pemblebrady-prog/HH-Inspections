import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { monthsWithActivity, monthLabel } from "../../../../lib/activityStatement";
import { statementCompanyId } from "../../../../lib/statementAccess";

export const dynamic = "force-dynamic";

// Months with activity for my company (or ?company= for admins).
export async function GET(req) {
  const auth = await requireUser(["company_owner", "admin"]);
  if (auth.error) return auth.error;
  const companyId = statementCompanyId(auth.profile, new URL(req.url).searchParams.get("company"));
  const db = createAdminClient();
  if (!companyId || !db) return NextResponse.json({ ok: false, error: "No company" }, { status: 400 });
  const months = await monthsWithActivity(db, companyId);
  return NextResponse.json({ ok: true, companyId, months: months.map((m) => ({ month: m, label: monthLabel(m) })) });
}
