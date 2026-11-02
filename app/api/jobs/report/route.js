import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { getDrive } from "../../../../lib/drive";
import { canSeeJob } from "../../../../lib/jobAccess";

export const runtime = "nodejs";

// Download the certified report PDF for a delivered job (if you're allowed to see it).
export async function GET(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const ref = new URL(req.url).searchParams.get("ref");
  const db = createAdminClient(); const drive = getDrive();
  if (!ref || !db || !drive) return new Response("Not found", { status: 404 });
  const { data: job } = await db.from("submissions").select("ref, company_id, inspector_id, final_pdf_id, property_address, client_name").eq("ref", ref).maybeSingle();
  if (!job || !job.final_pdf_id || !canSeeJob(auth.profile, job)) return new Response("Not found", { status: 404 });
  try {
    const res = await drive.files.get({ fileId: job.final_pdf_id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    const name = `${job.client_name || "Client"} - ${job.property_address || job.ref} - Certification Report.pdf`.replace(/[^\w .,&()-]/g, "-");
    return new Response(Buffer.from(res.data), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, max-age=300",
    } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
