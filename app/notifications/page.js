import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import AppHeader from "../AppHeader";
import NotifySettings from "./NotifySettings";
import { isCompanyManager } from "../../lib/roles";

export const dynamic = "force-dynamic";

// Company owners and office managers: which company emails they get.
export default async function NotificationsPage() {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/notifications");
  if (!isCompanyManager(profile)) redirect("/");
  return (
    <>
      <AppHeader title="Notifications" profile={profile} />
      <div className="shell" style={{ maxWidth: 700 }}>
        <section className="card">
          <h2>Email notifications</h2>
          <p className="intro">Choose which emails you get about {(profile.company && profile.company.name) || "your company"}'s jobs. This only changes your own emails; others at your company set their own.</p>
          <NotifySettings initial={profile.notify || {}} preview={Boolean(profile.viewingAs)} />
        </section>
      </div>
    </>
  );
}
