import { redirect, notFound } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import { buildStatement, statementHtml, previousMonth } from "../../lib/activityStatement";
import { statementCompanyId } from "../../lib/statementAccess";
import AppHeader from "../AppHeader";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

// Printable monthly activity statement: /statement?month=2026-10 (admins add &company=<id>).
export default async function StatementPage({ searchParams }) {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/billing");
  const companyId = statementCompanyId(profile, searchParams && searchParams.company);
  if (!companyId) notFound();
  const month = (searchParams && searchParams.month) || previousMonth();
  const db = createAdminClient();
  if (!db) notFound();
  let st;
  try { st = await buildStatement(db, companyId, month); } catch { notFound(); }
  const back = profile.role === "admin" ? "/admin/statements" : "/billing";
  return (
    <>
      <div className="no-print"><AppHeader title="Statement" profile={profile} wide /></div>
      <div className="shell" style={{ maxWidth: 900 }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <a className="hint" href={back}>← Back</a>
          <PrintButton />
        </div>
        <section className="card statement-card" dangerouslySetInnerHTML={{ __html: statementHtml(st) }} />
      </div>
    </>
  );
}
