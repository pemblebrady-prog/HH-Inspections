"use client";
import { useState } from "react";
import { PHOTO_SLOTS, UNSORTED } from "../../../../lib/formConfig";

const SECTIONS = [UNSORTED, ...PHOTO_SLOTS];
const sectionName = (s) => (s.id === "unsorted" ? "Not sorted yet" : `${s.n}. ${s.label}`);

// The job's photos, grouped by section. Inspectors upload them unsorted (Nov 24); the engineer picks photos
// and moves them into sections, so the letter shows each one next to its finding.
export default function PhotoSorter({ jobRef, photos: initial, hasLetter, canSort }) {
  const [photos, setPhotos] = useState(initial);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [moved, setMoved] = useState(false);
  const src = (id) => `/api/admin/photo?id=${encodeURIComponent(id)}`;

  async function move(ids, slot) {
    if (!ids.length || !slot) return;
    setBusy(true); setErr("");
    const d = await fetch(`/api/jobs/files/${encodeURIComponent(jobRef)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, slot }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy(false);
    if (!d.ok) { setErr(d.error || "Couldn't move them."); return; }
    setPhotos(d.photos); setPicked(new Set()); setMoved(true);
  }
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sketch = photos.filter((p) => p.slot === "sketch");
  const known = new Set(["sketch", ...SECTIONS.map((s) => s.id)]);
  const groups = SECTIONS.map((s) => ({ s, items: photos.filter((p) => (p.slot || "unsorted") === s.id || (s.id === "unsorted" && !known.has(p.slot || "unsorted"))) }))
    .filter((g) => g.items.length);
  const unsorted = (groups.find((g) => g.s.id === "unsorted") || { items: [] }).items.length;

  return (
    <div>
      {canSort && unsorted > 0 && (
        <p className="hint" style={{ background: "#f9eeda", padding: "8px 12px", borderRadius: 6, marginTop: 0 }}>
          {unsorted} photo{unsorted === 1 ? " isn't" : "s aren't"} sorted yet. Tick the photos that go together, then pick their section, so the letter shows them next to the right finding.
        </p>
      )}
      {canSort && (
        <div className="sort-bar">
          <span className="hint" style={{ margin: 0 }}>{picked.size ? `${picked.size} selected` : "Tick photos to move them"}</span>
          <select value="" disabled={!picked.size || busy} onChange={(e) => move([...picked], e.target.value)} aria-label="Move selected photos to section">
            <option value="">{busy ? "Moving…" : "Move selected to…"}</option>
            {SECTIONS.map((s) => <option key={s.id} value={s.id}>{sectionName(s)}</option>)}
          </select>
          {picked.size > 0 && <button type="button" className="linklike" onClick={() => setPicked(new Set())}>Clear</button>}
        </div>
      )}
      {err && <p className="err">{err}</p>}
      {moved && hasLetter && <p className="ok-msg">Sorted. Tap Regenerate letter to put the photos in place in the letter.</p>}

      {[...(sketch.length ? [{ s: { id: "sketch", label: "Home sketch" }, items: sketch }] : []), ...groups].map(({ s, items }) => (
        <div key={s.id} style={{ marginTop: 14 }}>
          <div className="sort-head">{s.id === "sketch" ? "Home sketch" : sectionName(s)} <span className="hint" style={{ margin: 0 }}>({items.length})</span></div>
          <div className="photo-grid">
            {items.map((p) => (
              <div key={p.id} className={"photo sortable" + (picked.has(p.id) ? " picked" : "")}>
                <a href={src(p.id)} target="_blank" rel="noreferrer"><img src={src(p.id)} alt={p.label} loading="lazy" /></a>
                {canSort && s.id !== "sketch" && (
                  <label className="photo-pick">
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.label}`} />
                  </label>
                )}
                {canSort && s.id !== "sketch" ? (
                  <select value={SECTIONS.some((x) => x.id === p.slot) ? p.slot : "unsorted"} disabled={busy} onChange={(e) => move([p.id], e.target.value)} aria-label="Section">
                    {SECTIONS.map((x) => <option key={x.id} value={x.id}>{sectionName(x)}</option>)}
                  </select>
                ) : <span>{p.label}</span>}
                {p.added_at && <span className="hint" style={{ margin: 0 }}>added after submitting</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
