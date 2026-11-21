import { redirect, notFound } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../../../lib/supabase/server";
import { canSeeJob } from "../../../../lib/jobAccess";
import { isStaff } from "../../../../lib/roles";
import { canAddToJob } from "../../../../lib/jobFiles";
import { StatusPill } from "../../../../lib/statusLabels";
import AppHeader from "../../../AppHeader";
import JobPhotos from "../../../JobPhotos";

export const dynamic = "force-dynamic";

// /jobs/HH-1015/photos: add or replace photos and the sketch on a job that's already submitted.
export default async function JobPhotosPage({ params }) {
  const ref = decodeURIComponent(params.ref);
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/jobs/${ref}/photos`)}`);
  const db = createAdminClient();
  if (!db) notFound();
  const { data: sub } = await db.from("submissions").select("id, ref, status, property_address, client_name, inspector_id, company_id, photos, report, letter_link").eq("ref", ref).maybeSingle();
  if (!sub || !canSeeJob(profile, sub)) notFound();
  const staff = isStaff(profile);
  const open = canAddToJob(profile, sub);
  const r = sub.report || {};
  return (
    <>
      <AppHeader title="Job photos" profile={profile} />
      <div className="shell" style={{ maxWidth: 820 }}>
        <p className="hint"><a href={staff ? `/admin/review/${encodeURIComponent(sub.ref)}` : "/jobs"}>← {staff ? "Back to the job" : "My jobs"}</a></p>
        <section className="card">
          <div className="job-head" style={{ marginBottom: 6 }}>
            <div><h2 style={{ margin: 0 }}>{sub.property_address || sub.ref}</h2>
              <p className="hint" style={{ marginTop: 4 }}>{sub.ref}{sub.client_name ? ` · ${sub.client_name}` : ""}</p></div>
            <StatusPill status={sub.status} />
          </div>
          {open
            ? <JobPhotos jobRef={sub.ref} staff={staff} photos={Array.isArray(sub.photos) ? sub.photos : []} hasLetter={Boolean(sub.letter_link)}
                home={{ homeType: r.homeType || "", widthFt: r.widthFt || "", lengthFt: r.lengthFt || "", sketchData: r.sketchData || null }} />
            : <p className="intro">This job is {sub.status === "canceled" ? "canceled" : "already certified"}, so its photos can't change. If something's missing, call House &amp; Home at 520-599-7798.</p>}
        </section>
      </div>
    </>
  );
}
