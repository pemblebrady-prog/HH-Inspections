import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import TeamManager from "../TeamManager";
import UserMenu from "../UserMenu";

export const dynamic = "force-dynamic";

// Company owners: manage the inspectors in their company.
export default async function TeamPage() {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/team");
  if (profile.role !== "company_owner") redirect("/");
  return (
    <>
      <header><div className="bar">
        <a className="brand" href="/"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">My team</span></a>
        <div className="who"><a className="viewswitch" href="/">Portal</a><UserMenu profile={profile} /></div>
      </div></header>
      <div className="shell" style={{ maxWidth: 900 }}>
        <section className="card">
          <h2>{(profile.company && profile.company.name) || "Your company"}: inspectors</h2>
          <p className="intro">Invite inspectors to submit jobs for your company, or deactivate anyone who's left.</p>
          <TeamManager />
        </section>
      </div>
    </>
  );
}
