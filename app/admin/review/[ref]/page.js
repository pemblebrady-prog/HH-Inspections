import { notFound } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../../../lib/supabase/server";
import { SINGLE, MULTI, DETAILS } from "../../../../lib/formConfig";
import { buildFindings } from "../../../../lib/letterContent";
import { StatusPill } from "../../../../lib/statusLabels";
import AdminHeader from "../../../AdminHeader";
import ReviewActions from "./ReviewActions";

export const dynamic = "force-dynamic";

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" });
}

export default async function ReviewJob({ params }) {
  const profile = await getCurrentProfile();
  const db = createAdminClient();
  if (!db) notFound();
  const ref = decodeURIComponent(params.ref);
  const { data: job } = await db.from("submissions")
    .select("*, company:companies(name, is_internal, phone, email), inspector:profiles!submissions_inspector_id_fkey(full_name, email, phone, certificate_number), reviewer:profiles!submissions_reviewed_by_fkey(full_name, email)")
    .eq("ref", ref).maybeSingle();
  if (!job) notFound();

  const f = job.report || {};
  const { tagLine, findings, corrections } = buildFindings(f);
  const photos = Array.isArray(job.photos) ? job.photos : [];
  const rows = [
    ["Property", job.property_address], ["Client", job.client_name], ["Date inspected", job.inspection_date],
    ["Inspection type", f.inspectionType], ["Company", job.company ? job.company.name : f.inspectionCompany],
    ["Inspector", job.inspector ? `${job.inspector.full_name || job.inspector.email}${job.inspector.certificate_number ? ` · Cert ${job.inspector.certificate_number}` : ""}${job.inspector.phone ? ` · ${job.inspector.phone}` : ""}` : job.inspector_name],
    ["Send report to", job.send_report_to], ["Year built", f.ageOfHome],
    ["Dimensions", f.widthFt || f.lengthFt ? `${f.widthFt || "?"}' x ${f.lengthFt || "?"}'` : ""],
    ...DETAILS.map((d) => [d.label, f[d.id]]),
    ...SINGLE.slice(1).map((s) => [s.label, f[s.id]]),
    ...MULTI.map((m) => [m.label, (f[m.id] || []).join(", ")]),
    ["Comments", f.generalComments],
  ];

  return (
    <>
      <AdminHeader title={`Job ${job.ref}`} profile={profile} />
      <div className="shell" style={{ maxWidth: 1080 }}>
        <p className="hint"><a href="/admin/review">← Review queue</a></p>
        <div className="job-head">
          <div>
            <h2 style={{ margin: 0 }}>{job.property_address || job.ref}</h2>
            <p className="intro" style={{ margin: "6px 0 0" }}>{job.ref} · submitted {fmt(job.submitted_at)}{job.is_demo ? " · demo" : ""}</p>
          </div>
          <StatusPill status={job.status} />
        </div>

        <div className="job-grid">
          <section className="card">
            <h3>Draft letter preview</h3>
            <p className="hint">What the generated letter says, based on the checklist.</p>
            {tagLine && <p>{tagLine}</p>}
            {findings.map((x, i) => <p key={i}>{x.text}</p>)}
            {corrections.length > 0
              ? (<><p><b>Areas requiring corrections:</b></p><ol>{corrections.map((c, i) => <li key={i}>{c}</li>)}</ol></>)
              : <p className="ok-msg">No corrections: the letter uses the compliance statement.</p>}

            <h3 style={{ marginTop: 24 }}>Checklist</h3>
            <table className="kv"><tbody>
              {rows.filter(([, v]) => v).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
            </tbody></table>
          </section>

          <aside>
            <section className="card">
              <ReviewActions job={{ ref: job.ref, status: job.status, letter_link: job.letter_link, drive_link: job.drive_link, review_notes: job.review_notes || "", photo_count: job.photo_count }} />
              <table className="kv small" style={{ marginTop: 16 }}><tbody>
                <tr><th>Payment</th><td>{job.payment_status}{job.amount_cents ? ` · $${(job.amount_cents / 100).toFixed(2)}` : ""}</td></tr>
                {job.reviewer && <tr><th>Reviewer</th><td>{job.reviewer.full_name || job.reviewer.email}</td></tr>}
                {job.certified_at && <tr><th>Certified</th><td>{fmt(job.certified_at)}</td></tr>}
                {job.delivered_at && <tr><th>Delivered</th><td>{fmt(job.delivered_at)}</td></tr>}
              </tbody></table>
            </section>
          </aside>
        </div>

        <section className="card" style={{ marginTop: 18 }}>
          <h3>Photos ({photos.length})</h3>
          {photos.length === 0 && <p className="hint">No photos recorded for this job yet. They appear once the inspector's upload finishes{job.drive_link ? "; you can also check the Drive folder" : ""}.</p>}
          <div className="photo-grid">
            {photos.map((p) => (
              <a key={p.id} href={`/api/admin/photo?id=${encodeURIComponent(p.id)}`} target="_blank" rel="noreferrer" className="photo">
                <img src={`/api/admin/photo?id=${encodeURIComponent(p.id)}`} alt={p.label} loading="lazy" />
                <span>{p.label}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
