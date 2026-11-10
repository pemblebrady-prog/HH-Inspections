import { getCurrentProfile } from "../../../lib/supabase/server";
import AdminHeader from "../../AdminHeader";
import EmailSettings from "./EmailSettings";

export const dynamic = "force-dynamic";

export default async function EmailPage({ searchParams }) {
  const profile = await getCurrentProfile();
  return (
    <>
      <AdminHeader title="Email" profile={profile} />
      <div className="shell" style={{ maxWidth: 720 }}>
        <EmailSettings me={profile ? profile.email : ""} connected={(searchParams && searchParams.connected) || ""} error={(searchParams && searchParams.error) || ""} />
      </div>
    </>
  );
}
