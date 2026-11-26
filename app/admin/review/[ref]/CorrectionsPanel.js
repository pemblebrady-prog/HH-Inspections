"use client";
import { useState } from "react";

// Failed inspection on Ron's job page: corrections letter → follow-up → clear letter.
// The round flow lives in lib/corrections.js; this is the screen for it.
const money = (c) => `$${(Number(c || 0) / 100).toFixed(Number(c) % 100 ? 2 : 0)}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" }) : "");
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : s || ""; };
const FEE = { none: "No fee", unpaid: "Not paid yet", processing: "Processing (bank transfer)", paid: "Paid", failed: "Charge failed", waived: "Waived", refunded: "Refunded" };
const OPEN = ["draft", "waiting", "awaiting_payment", "submitted"];

// engineer=false (House & Home office managers, Nov 25): see the rounds and handle the fee, nothing else.
export default function CorrectionsPanel({ job, rounds: initial, suggested, people, defaultFee, office, inspectorName, missing, engineer = true }) {
  const [rounds, setRounds] = useState(initial || []);
  const [status, setStatus] = useState(job.status);
  const [form, setForm] = useState(null); // { corrections, followupBy, assignedTo, fee, redo, editing }
  const [to, setTo] = useState((job.recipients || []).join("\n"));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [refund, setRefund] = useState(null); // { roundId, kind: "full" | "part", amount, reason }

  const open = [...rounds].reverse().find((r) => OPEN.includes(r.status)) || null;
  const last = rounds.filter((r) => r.status !== "canceled").pop() || null;
  const cleared = !open && last && last.status === "cleared" ? last : null;
  const shown = open || cleared;
  const earlier = rounds.filter((r) => r !== shown);
  const personName = (id) => (people.find((p) => p.id === id) || {}).name || "";
  const who = (r) => (r.followup_by === "house_and_home"
    ? (r.assigned_to ? `${personName(r.assigned_to) || "House & Home"} (House & Home re-inspection)` : "House & Home re-inspection, no one assigned yet")
    : `${inspectorName || "The inspector"} (new photos)`);

  async function call(action, extra = {}, { reload } = {}) {
    setBusy(action); setErr(""); setMsg("");
    const d = await fetch("/api/admin/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: job.ref, action, ...extra }) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy("");
    if (d.needsConfirm) {
      if (window.confirm("This letter doesn't look final yet:\n\n- " + d.problems.join("\n- ") + "\n\nFix it in the Google Doc first (recommended), or send anyway?")) return call(action, { ...extra, force: true }, { reload });
      return null;
    }
    if (!d.ok) { setErr(d.error || "Something went wrong"); return null; }
    if (d.rounds) setRounds(d.rounds);
    if (d.job) setStatus(d.job.status);
    if (d.warning) setErr(d.warning);
    if (d.message) setMsg(d.message);
    if (reload) setTimeout(() => window.location.reload(), 1500);
    return d;
  }

  const startForm = (redo) => {
    const base = redo && last ? last.corrections : suggested;
    setForm({ corrections: (base || []).join("\n"), followupBy: "inspector", assignedTo: "", fee: ((job.internal ? 0 : defaultFee) / 100).toFixed(defaultFee % 100 ? 2 : 0), redo });
    setErr(""); setMsg("");
  };
  const editForm = (r) => setForm({ corrections: r.corrections.join("\n"), followupBy: r.followup_by, assignedTo: r.assigned_to || "", fee: (r.fee_cents / 100).toFixed(r.fee_cents % 100 ? 2 : 0), editing: r.status });

  async function saveForm(e) {
    e.preventDefault();
    const body = { corrections: form.corrections, followupBy: form.followupBy, assignedTo: form.followupBy === "house_and_home" ? form.assignedTo : "", fee: form.fee };
    const d = form.editing
      ? await call("update", form.editing === "draft" ? body : { followupBy: body.followupBy, assignedTo: body.assignedTo, fee: body.fee })
      : await call("start", { ...body, redo: Boolean(form.redo) });
    if (d) { setForm(null); if (!d.warning) setMsg(form.editing ? "Saved." + (form.editing === "draft" ? " Tap \"Remake letter\" to update the Google Doc." : "") : "Corrections letter made. Open it, check it, then send it."); }
  }

  async function send() {
    const d = await call("send", { recipients: to.split(/[\s,;]+/).filter(Boolean) });
    if (!d) return;
    const stampNote = d.stamped === "placed" ? " Your stamp and signature were added to the PDF."
      : d.stamped === "box not found" ? " The grey stamp box wasn't in the letter, so no stamp was added automatically."
      : d.stamped && d.stamped !== "no images" ? " The stamp couldn't be added automatically; check the PDF in the job's Drive folder." : "";
    const failed = (d.results || []).filter((r) => !r.ok);
    setMsg(`Corrections letter sent. The job now shows "Needs corrections" until the follow-up comes in.${stampNote}${failed.length ? ` Not sent to: ${failed.map((r) => r.to).join(", ")}.` : ""}`);
    setTimeout(() => window.location.reload(), 4000);
  }

  if (missing) return <section className="card" style={{ marginTop: 18 }}><h3 style={{ marginTop: 0 }}>Corrections</h3><p className="hint">Run database update 0018 in Supabase to turn on corrections letters.</p></section>;

  const canStart = !open && !cleared && ["submitted", "under_review", "certified"].includes(status);
  const canRedo = (open && open.status === "submitted") || (cleared && status !== "delivered");

  const formHtml = form && (
    <form onSubmit={saveForm} className="send-box" style={{ marginTop: 10 }}>
      {(!form.editing || form.editing === "draft") && (
        <div className="field"><label htmlFor="corr">What needs correcting (one per line)</label>
          <textarea id="corr" rows={Math.min(10, Math.max(4, form.corrections.split("\n").length + 1))} value={form.corrections} onChange={(e) => setForm({ ...form, corrections: e.target.value })} required />
          <div className="hint">Filled in from the checklist. Edit, add or remove lines; each line is a numbered item in the letter.</div></div>
      )}
      <div className="field"><div style={{ fontWeight: 600, fontSize: ".9rem" }}>Who does the follow-up</div>
        <div className="chips" style={{ margin: "6px 0 0" }}>
          <button type="button" className={"chip" + (form.followupBy === "inspector" ? " on" : "")} onClick={() => setForm({ ...form, followupBy: "inspector" })}>{inspectorName || "Inspector"} sends photos</button>
          <button type="button" className={"chip" + (form.followupBy === "house_and_home" ? " on" : "")} onClick={() => setForm({ ...form, followupBy: "house_and_home" })}>House &amp; Home re-inspects</button>
        </div>
        {form.followupBy === "house_and_home" && (
          <select aria-label="Who re-inspects" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} style={{ marginTop: 6 }}>
            <option value="">Decide later (the office is emailed)</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="hint">The letter lists both options either way; you can change this later.</div></div>
      <div className="field"><label htmlFor="fee">Re-inspection fee ($)</label>
        <input id="fee" inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} disabled={job.internal} style={{ width: 120 }} />
        <div className="hint">{job.internal ? "House & Home jobs aren't charged." : `0 for no fee. Default ${money(defaultFee)}. Charged when the follow-up comes in, and named in the letter.`}</div></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={!!busy}>{busy ? "Saving…" : form.editing ? "Save" : "Make corrections letter"}</button>
        <button type="button" className="btn ghost" onClick={() => setForm(null)} disabled={!!busy}>Cancel</button>
      </div>
    </form>
  );

  const feeLine = (r) => r.fee_cents > 0 && (
    <tr><th>Fee</th><td>{money(r.fee_cents)} · {r.followup_submitted_at ? FEE[r.fee_status] || r.fee_status : "charged when the follow-up comes in"}
      {office && ["unpaid", "failed"].includes(r.fee_status) && r.followup_submitted_at && (
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <button type="button" className="viewswitch" disabled={!!busy} onClick={() => call("fee_charge")}>{busy === "fee_charge" ? "Charging…" : "Charge now"}</button>
          <button type="button" className="viewswitch" disabled={!!busy} onClick={() => { if (window.confirm(`Waive the ${money(r.fee_cents)} re-inspection fee?`)) call("fee_waive"); }}>Waive</button>
        </div>
      )}
      {r.fee_refunded_cents > 0 && <div className="hint">{money(r.fee_refunded_cents)} refunded</div>}
      {office && ["paid", "refunded"].includes(r.fee_status) && r.fee_refunded_cents < r.fee_cents && (!refund || refund.roundId !== r.id) && (
        <button type="button" className="viewswitch" style={{ marginTop: 6 }} onClick={() => setRefund({ roundId: r.id, kind: "full", amount: "", reason: "" })}>Refund fee…</button>
      )}
      {refund && refund.roundId === r.id && (
        <div className="send-box" style={{ marginTop: 8 }}>
          <div className="chips" style={{ marginBottom: 8 }}>
            <button type="button" className={"chip" + (refund.kind === "full" ? " on" : "")} onClick={() => setRefund({ ...refund, kind: "full" })}>Full: {money(r.fee_cents - (r.fee_refunded_cents || 0))}</button>
            <button type="button" className={"chip" + (refund.kind === "part" ? " on" : "")} onClick={() => setRefund({ ...refund, kind: "part" })}>Part of it</button>
          </div>
          {refund.kind === "part" && <div className="field" style={{ marginBottom: 8 }}><label htmlFor="frf-amt">Amount ($)</label><input id="frf-amt" inputMode="decimal" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} style={{ width: 120 }} /></div>}
          <div className="field" style={{ marginBottom: 8 }}><label htmlFor="frf-why">Reason (on the receipt)</label><input id="frf-why" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={!!busy || (refund.kind === "part" && !refund.amount)} onClick={async () => {
              const amt = refund.kind === "full" ? "" : refund.amount;
              if (!window.confirm(`Refund ${amt ? "$" + amt : money(r.fee_cents - (r.fee_refunded_cents || 0))} of the re-inspection fee to the card or bank account it came from?`)) return;
              const d = await call("fee_refund", { roundId: r.id, amount: amt, reason: refund.reason });
              if (d) setRefund(null);
            }}>{busy === "fee_refund" ? "Refunding…" : "Refund"}</button>
            <button type="button" className="btn ghost" onClick={() => setRefund(null)}>Cancel</button>
          </div>
        </div>
      )}</td></tr>
  );

  const followupDetails = (r) => (
    <>
      <p style={{ margin: "12px 0 6px" }}><b>Follow-up</b> · {r.followup_by === "house_and_home" ? "re-inspected" : "photos taken"} {ymd(r.reinspection_date)}{r.followup_submitted_at ? `, sent ${day(r.followup_submitted_at)}` : ""}</p>
      {(r.followup_items || []).map((it, i) => (
        <div key={i} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
          <div><b>{i + 1}.</b> {it.correction}</div>
          {it.note && <div className="hint" style={{ marginTop: 2 }}>“{it.note}”</div>}
          {(it.photos || []).length > 0
            ? <div className="photo-grid" style={{ marginTop: 6 }}>{it.photos.map((p) => (
                <a key={p.id} href={`/api/admin/photo?id=${encodeURIComponent(p.id)}`} target="_blank" rel="noreferrer" className="photo"><img src={`/api/admin/photo?id=${encodeURIComponent(p.id)}`} alt={p.label} loading="lazy" /></a>))}</div>
            : <div className="hint" style={{ color: "#A2382A" }}>No photo for this one.</div>}
        </div>
      ))}
      {(() => { const listed = new Set((r.followup_items || []).flatMap((it) => (it.photos || []).map((p) => p.id))); const extra = (r.followup_photos || []).filter((p) => !listed.has(p.id)); return extra.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}><div><b>Other photos</b></div><div className="photo-grid" style={{ marginTop: 6 }}>{extra.map((p) => (
          <a key={p.id} href={`/api/admin/photo?id=${encodeURIComponent(p.id)}`} target="_blank" rel="noreferrer" className="photo"><img src={`/api/admin/photo?id=${encodeURIComponent(p.id)}`} alt={p.label} loading="lazy" /></a>))}</div></div>); })()}
      {r.followup_notes && <p className="hint">Comments: {r.followup_notes}</p>}
    </>
  );

  if (!engineer && !shown && !earlier.length) return null;
  return (
    <section className="card" style={{ marginTop: 18 }}>
      <h3 style={{ marginTop: 0 }}>Corrections{shown && shown.round > 1 ? ` (round ${shown.round})` : ""}</h3>

      {engineer && canStart && !form && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>Can't certify it? Send a corrections letter instead: what needs fixing and how to get it cleared. The follow-up stays on this job.</p>
          <button type="button" className="btn ghost" onClick={() => startForm(false)}>Corrections needed…</button>
        </>
      )}

      {shown && !form && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>{{
            draft: "Corrections letter being prepared. Check it in Google Docs, then send it.",
            waiting: `Corrections letter sent. Waiting for ${who(shown)}.`,
            awaiting_payment: `The follow-up is in, waiting for the ${money(shown.fee_cents)} fee to be paid by card. It comes to the queue once paid.`,
            submitted: "The follow-up is in. Check each correction below, then make the clear letter, or ask for more corrections.",
            cleared: status === "delivered" ? "Cleared: the clear letter was sent." : "Clear letter made. Check it, then mark the job certified and send it (Actions, above).",
          }[shown.status]}</p>
          <ol style={{ margin: "0 0 10px 20px" }}>{shown.corrections.map((c, i) => <li key={i}>{c}</li>)}</ol>
          <table className="kv small"><tbody>
            <tr><th>Follow-up</th><td>{who(shown)}</td></tr>
            {shown.sent_at && <tr><th>Letter sent</th><td>{day(shown.sent_at)}{shown.sent_to && shown.sent_to.length ? <><br /><span className="hint">to {shown.sent_to.join(", ")}</span></> : null}{shown.pdf_link && <><br /><a href={shown.pdf_link} target="_blank" rel="noreferrer">Sent PDF</a></>}</td></tr>}
            {feeLine(shown)}
          </tbody></table>

          {engineer && shown.status === "draft" && (
            <div className="stack" style={{ marginTop: 12 }}>
              {shown.letter_link ? <a className="btn" href={shown.letter_link} target="_blank" rel="noreferrer">Open corrections letter</a> : <p className="hint">No letter yet.</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="viewswitch" disabled={!!busy} onClick={() => call("letter").then((d) => d && setMsg("New corrections letter made."))}>{busy === "letter" ? "Making…" : shown.letter_link ? "Remake letter" : "Make letter"}</button>
                <button type="button" className="viewswitch" disabled={!!busy} onClick={() => editForm(shown)}>Edit</button>
                <button type="button" className="viewswitch" disabled={!!busy} onClick={() => { if (window.confirm("Cancel this corrections letter? Nothing has been sent.")) call("cancel"); }}>Cancel</button>
              </div>
              {shown.letter_link && (
                <div className="send-box">
                  <b>Send corrections letter</b>
                  <p className="hint" style={{ margin: "4px 0 8px" }}>Delete the yellow DRAFT note first. It's emailed as a PDF{job.stampOnFile ? " with your stamp and signature" : ""}, saved to the Drive folder, and {shown.followup_by === "house_and_home" ? (shown.assigned_to ? `${personName(shown.assigned_to)} gets a link to do the re-inspection` : "the office is asked to assign a re-inspector") : `${inspectorName || "the inspector"} gets a link to send new photos`}.</p>
                  <label htmlFor="cto" className="hint">Send to (one per line)</label>
                  <textarea id="cto" rows={3} value={to} onChange={(e) => setTo(e.target.value)} />
                  <button className="btn" type="button" disabled={!!busy} onClick={send}>{busy === "send" ? "Sending…" : "Send corrections letter"}</button>
                </div>
              )}
            </div>
          )}

          {shown.status === "waiting" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {engineer && <button type="button" className="viewswitch" disabled={!!busy} onClick={() => editForm(shown)}>Change follow-up or fee</button>}
              <button type="button" className="viewswitch" onClick={() => { const link = `${window.location.origin}/follow-up/${encodeURIComponent(job.ref)}`; navigator.clipboard && navigator.clipboard.writeText(link).then(() => setMsg(`Copied: ${link}`), () => setMsg(link)); }}>Copy follow-up link</button>
              {engineer && <button type="button" className="viewswitch" disabled={!!busy} onClick={() => { if (window.confirm("Cancel the corrections? The job goes back to Under review. (The letter that was sent isn't recalled.)")) call("cancel", {}, { reload: true }); }}>Cancel corrections</button>}
            </div>
          )}

          {["submitted", "cleared"].includes(shown.status) && followupDetails(shown)}

          {engineer && shown.status === "submitted" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button type="button" className="btn" disabled={!!busy} onClick={() => call("clear", {}, { reload: true }).then((d) => d && setMsg("Clear letter made. Reloading…"))}>{busy === "clear" ? "Making clear letter…" : "Make clear letter"}</button>
            </div>
          )}
          {engineer && canRedo && (
            <button type="button" className="btn ghost" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => startForm(true)}>Still needs corrections…</button>
          )}
        </>
      )}

      {formHtml}

      {earlier.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="linklike" onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Hide" : "Show"} earlier rounds ({earlier.length})</button>
          {showHistory && earlier.map((r) => (
            <div key={r.id} className="hint" style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
              <b>Round {r.round}</b> · {{ redo: "more corrections were needed", canceled: "canceled", cleared: "cleared" }[r.status] || r.status}{r.sent_at ? ` · letter sent ${day(r.sent_at)}` : ""}{r.pdf_link && <> · <a href={r.pdf_link} target="_blank" rel="noreferrer">PDF</a></>}
              <ol style={{ margin: "4px 0 0 18px" }}>{r.corrections.map((c, i) => <li key={i}>{c}</li>)}</ol>
              {r.followup_submitted_at && followupDetails(r)}
            </div>
          ))}
        </div>
      )}
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
    </section>
  );
}
