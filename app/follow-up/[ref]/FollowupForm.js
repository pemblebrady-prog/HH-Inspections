"use client";
import { useEffect, useRef, useState } from "react";
import { compress } from "../../../lib/formConfig";

const money = (c) => `$${(Number(c || 0) / 100).toFixed(Number(c) % 100 ? 2 : 0)}`;
const key = (ref, round) => `followup:${ref}:${round}`;
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

// One card per correction: photos (uploaded as soon as they're picked) and an optional note.
// Notes and finished uploads are kept on the phone, so closing the page doesn't lose them.
export default function FollowupForm({ ref_: ref, round, today }) {
  const k = key(ref, round.round);
  const blank = () => ({ items: round.corrections.map(() => ({ note: "", photos: [] })), extra: [], notes: "", date: today });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const loaded = useRef(false);

  useEffect(() => { // restore a draft (uploaded photos only)
    const d = load(k);
    if (d && Array.isArray(d.items) && d.items.length === round.corrections.length) {
      const keep = (list) => (list || []).filter((p) => p.id).map((p) => ({ id: p.id, name: p.name, state: "done" }));
      setF({ ...d, items: d.items.map((it) => ({ note: it.note || "", photos: keep(it.photos) })), extra: keep(d.extra) });
    }
    loaded.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loaded.current) return;
    const strip = (list) => list.filter((p) => p.id).map((p) => ({ id: p.id, name: p.name }));
    save(k, { ...f, items: f.items.map((it) => ({ note: it.note, photos: strip(it.photos) })), extra: strip(f.extra) });
  }, [f, k]);

  // where: item index, or "extra"
  const update = (where, fn) => setF((s) => (where === "extra" ? { ...s, extra: fn(s.extra) } : { ...s, items: s.items.map((it, i) => (i === where ? { ...it, photos: fn(it.photos) } : it)) }));

  async function addPhotos(where, files) {
    for (const file of Array.from(files || [])) {
      const tmp = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      const preview = URL.createObjectURL(file);
      update(where, (list) => [...list, { tmp, preview, name: file.name, state: "uploading" }]);
      let small = file;
      try { small = await compress(file, 1800, 0.75); } catch { /* send the original */ }
      const body = new FormData();
      const n = where === "extra" ? "other" : `correction-${where + 1}`;
      body.append("file", small, `${n}-${Date.now()}.jpg`);
      body.append("name", `${n}-${Date.now()}.jpg`);
      let d = null;
      for (let i = 0; i < 3 && !(d && d.ok); i++) {
        d = await fetch(`/api/follow-up/${encodeURIComponent(ref)}`, { method: "POST", body }).then((r) => r.json()).catch((e) => ({ ok: false, error: e.message }));
        if (!d.ok) await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
      }
      update(where, (list) => list.map((p) => (p.tmp === tmp ? (d.ok ? { ...p, id: d.id, state: "done" } : { ...p, state: "failed", error: d.error }) : p)));
    }
  }

  const all = [...f.items.flatMap((it) => it.photos), ...f.extra];
  const uploading = all.some((p) => p.state === "uploading");
  const ready = all.filter((p) => p.state === "done").length;
  const missingPhoto = f.items.map((it, i) => (it.photos.some((p) => p.state === "done") ? null : i + 1)).filter(Boolean);

  async function submit(e) {
    e.preventDefault();
    if (missingPhoto.length && !window.confirm(`No photo yet for correction${missingPhoto.length > 1 ? "s" : ""} ${missingPhoto.join(", ")}. Send anyway?`)) return;
    setBusy(true); setErr("");
    const ids = (list) => list.filter((p) => p.state === "done").map((p) => ({ id: p.id }));
    const d = await fetch(`/api/follow-up/${encodeURIComponent(ref)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: f.items.map((it) => ({ note: it.note, photos: ids(it.photos) })), extra: ids(f.extra), notes: f.notes, date: f.date }),
    }).then((r) => r.json()).catch((e2) => ({ ok: false, error: String(e2) }));
    setBusy(false);
    if (!d.ok) { setErr(d.error || "Couldn't send. Try again."); return; }
    try { localStorage.removeItem(k); } catch { /* ignore */ }
    if (d.needsPayment) { window.location.href = `/pay/${encodeURIComponent(ref)}?round=${d.round}`; return; }
    setDone(d);
  }

  if (done) return (
    <div>
      <p className="ok-msg">Sent to the engineer. You'll get the clear letter by email once the corrections are accepted.</p>
      <a className="btn ghost" href="/jobs">My jobs</a>
    </div>
  );

  const photoRow = (where, list) => (
    <>
      {list.length > 0 && (
        <div className="photo-grid" style={{ marginTop: 8 }}>
          {list.map((p) => (
            <div key={p.tmp || p.id} className="photo" style={{ position: "relative" }}>
              {p.preview ? <img src={p.preview} alt="" /> : <div className="hint" style={{ padding: 12 }}>Photo saved</div>}
              <span>{p.state === "uploading" ? "Uploading…" : p.state === "failed" ? `Didn't upload: ${p.error || "try again"}` : "Uploaded"}</span>
              <button type="button" className="linklike" style={{ fontSize: 13 }} onClick={() => update(where, (l) => l.filter((x) => x !== p))}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <label className="btn ghost" style={{ marginTop: 8, display: "inline-flex", cursor: "pointer" }}>
        + Add photo
        <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { addPhotos(where, e.target.files); e.target.value = ""; }} />
      </label>
    </>
  );

  return (
    <form onSubmit={submit}>
      <p className="intro">{round.reinspect ? "Re-inspect the home and take" : "Take"} a clear photo showing each of these fixed. Add a note if it helps the engineer (what was done, by whom).</p>
      {f.items.map((it, i) => (
        <div key={i} className="send-box" style={{ marginBottom: 12 }}>
          <b>{i + 1}. {round.corrections[i]}</b>
          {photoRow(i, it.photos)}
          <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
            <label htmlFor={`n${i}`} className="hint">Note (optional)</label>
            <textarea id={`n${i}`} rows={2} value={it.note} onChange={(e) => setF((s) => ({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) }))} placeholder="e.g. 4 new tie-downs installed per side" />
          </div>
        </div>
      ))}
      <div className="send-box" style={{ marginBottom: 12 }}>
        <b>Other photos (optional)</b>
        {photoRow("extra", f.extra)}
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="fdate">{round.reinspect ? "Re-inspection date" : "Date the photos were taken"}</label>
          <input id="fdate" type="date" value={f.date} max={today} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="fnotes">Comments for the engineer (optional)</label>
        <textarea id="fnotes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      {round.fee > 0 && <p className="hint">A re-inspection fee of <b>{money(round.fee)}</b> is charged when you send this.</p>}
      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={busy || uploading || !ready}>{busy ? "Sending…" : uploading ? "Waiting for photos to upload…" : "Send to the engineer"}</button>
      {!ready && !uploading && <p className="hint">Add at least one photo to send.</p>}
    </form>
  );
}
