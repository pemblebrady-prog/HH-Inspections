import { getCurrentProfile } from "../../../lib/supabase/server";
import AdminHeader from "../../AdminHeader";
import StatementsAdmin from "./StatementsAdmin";

export const dynamic = "force-dynamic";

export default async function StatementsPage() {
  const profile = await getCurrentProfile();
  return (
    <>
      <AdminHeader title="Statements" profile={profile} />
      <div className="shell" style={{ maxWidth: 900 }}><StatementsAdmin /></div>
    </>
  );
}
