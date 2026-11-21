import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import TeamManager from "../TeamManager";
import AppHeader from "../AppHeader";
import { isCompanyManager } from "../../lib/roles";

export const dynamic = "force-dynamic";

// Company owners and office managers: manage the people in their company.
export default async function TeamPage() {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/team");
  if (!isCompanyManager(profile)) redirect("/");
  return (
    <>
      <AppHeader title="My team" profile={profile} />
      <div className="shell" style={{ maxWidth: 900 }}>
        <section className="card">
          <h2>{(profile.company && profile.company.name) || "Your company"}: team</h2>
          <p className="intro">{profile.role === "company_owner" ? "Invite inspectors and office managers, change their role, or deactivate anyone who's left." : "Invite inspectors to submit jobs for your company, or deactivate anyone who's left."}</p>
          <TeamManager />
        </section>
      </div>
    </>
  );
}
