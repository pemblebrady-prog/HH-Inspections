import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { getDrive } from "../../../../lib/drive";
import { canSeeJob } from "../../../../lib/jobAccess";

export const runtime = "nodejs";

// Download the certified report PDF for a delivered job (if you're allowed to see it).
export async function GET(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const ref = new URL(req.url).searchParams.get("ref");
  const round = new URL(req.url).searchParams.get("round"); // a corrections letter (round number) instead of the final letter
  const db = createAdminClient(); const drive = await getDrive();
  if (!ref || !db || !drive) return new Response("Not found", { status: 404 });
  const { data: job } = await db.from("submissions").select("id, ref, company_id, inspector_id, final_pdf_id, property_address, client_name").eq("ref", ref).maybeSingle();
  let fileId = job && job.final_pdf_id, kind = "Certification Report";
  if (job && round) {
    const { data: r } = await db.from("correction_rounds").select("pdf_id, round, assigned_to").eq("submission_id", job.id).eq("round", Number(round) || 0).maybeSingle();
    if (!r || !r.pdf_id || !(canSeeJob(auth.profile, job) || r.assigned_to === (auth.profile && auth.profile.id))) return new Response("Not found", { status: 404 });
    fileId = r.pdf_id; kind = r.round > 1 ? `Corrections Letter ${r.round}` : "Corrections Letter";
  } else if (!job || !job.final_pdf_id || !canSeeJob(auth.profile, job)) return new Response("Not found", { status: 404 });
  try {
    const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    const name = `${job.client_name || "Client"} - ${job.property_address || job.ref} - ${kind}.pdf`.replace(/[^\w .,&()-]/g, "-");
    return new Response(Buffer.from(res.data), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, max-age=300",
    } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
