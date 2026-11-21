import { redirect, notFound } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../../lib/supabase/server";
import { listRounds, openRound, canDoFollowup } from "../../../lib/corrections";
import AppHeader from "../../AppHeader";
import FollowupForm from "./FollowupForm";

export const dynamic = "force-dynamic";

const money = (c) => `$${(Number(c || 0) / 100).toFixed(Number(c) % 100 ? 2 : 0)}`;

// /follow-up/HH-1015: after a corrections letter, the inspector (or a House & Home re-inspector)
// sends a photo of each correction. It goes back to the engineer on the same job.
export default async function FollowupPage({ params }) {
  const ref = decodeURIComponent(params.ref);
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/follow-up/${ref}`)}`);
  const db = createAdminClient();
  if (!db) notFound();
  const { data: sub } = await db.from("submissions").select("id, ref, status, property_address, client_name, inspector_id, company_id, inspection_date").eq("ref", ref).maybeSingle();
  if (!sub) notFound();
  const { rounds, missing } = await listRounds(db, sub.id);
  const round = openRound(rounds);
  const last = rounds.filter((r) => r.status !== "canceled").pop();
  const mine = round && canDoFollowup(profile, sub, round);
  const reinspect = round && round.followup_by === "house_and_home";

  let body;
  if (missing || (!round && !last)) body = <p className="intro">There's no follow-up needed on this job.</p>;
  else if (round && !mine) body = <p className="intro">This follow-up is assigned to someone else. If that's wrong, call House &amp; Home at 520-599-7798.</p>;
  else if (!round) body = <p className="intro">{last.status === "cleared" ? "The follow-up was accepted. The clear letter is being sent." : "There's no follow-up waiting on this job."} <a href="/jobs">My jobs</a></p>;
  else if (round.status === "draft") body = <p className="intro">The engineer is still preparing the corrections letter. You'll get an email when it's time to send photos.</p>;
  else if (round.status === "awaiting_payment") body = (
    <><p className="intro">Your photos are in. One more step: pay the {money(round.fee_cents)} re-inspection fee and they go to the engineer.</p>
      <a className="btn" href={`/pay/${encodeURIComponent(sub.ref)}?round=${round.id}`}>Pay {money(round.fee_cents)}</a></>
  );
  else if (round.status === "submitted") body = <p className="intro">Sent. The engineer is reviewing your follow-up; the clear letter is emailed once it's accepted. <a href="/jobs">My jobs</a></p>;
  else body = (
    <FollowupForm ref_={sub.ref} round={{ id: round.id, round: round.round, corrections: round.corrections, fee: round.fee_cents, reinspect }}
      today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" })} />
  );

  return (
    <>
      <AppHeader title={reinspect ? "Re-inspection" : "Corrections follow-up"} profile={profile} />
      <div className="shell" style={{ maxWidth: 720 }}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>{sub.property_address || sub.ref}</h2>
          <p className="hint" style={{ marginTop: 4 }}>{sub.ref}{sub.client_name ? ` · ${sub.client_name}` : ""}{sub.inspection_date ? ` · inspected ${sub.inspection_date}` : ""}</p>
          {body}
        </section>
      </div>
    </>
  );
}
