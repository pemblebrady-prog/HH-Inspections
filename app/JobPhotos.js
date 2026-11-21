"use client";
import { useEffect, useRef, useState } from "react";
import SketchBuilder from "./SketchBuilder";
import { PHOTO_SLOTS, compress } from "../lib/formConfig";

const SLOTS = [{ id: "sketch", n: "", label: "Home sketch" }, ...PHOTO_SLOTS];

// Add or replace photos and the sketch on a submitted job (lib/jobFiles.js). Each file uploads as soon
// as it's picked; staff are told once when the inspector is done.
export default function JobPhotos({ jobRef, staff, photos: initial, home, hasLetter }) {
  const [photos, setPhotos] = useState(initial);
  const [busy, setBusy] = useState({}); // slot -> number uploading
  const [err, setErr] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [done, setDone] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sketchData, setSketchData] = useState(home.sketchData || null); // the in-app drawing, so it can be edited again
  const changes = useRef({ added: 0, removed: 0 });
  const api = `/api/jobs/files/${encodeURIComponent(jobRef)}`;
  const src = (id) => (staff ? `/api/admin/photo?id=${encodeURIComponent(id)}` : `${api}?id=${encodeURIComponent(id)}`);
  const uploading = Object.values(busy).some(Boolean);

  const report = (keepalive) => {
    const c = changes.current;
    if (!c.added && !c.removed) return Promise.resolve();
    changes.current = { added: 0, removed: 0 };
    return fetch(api, { method: "PUT", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).catch(() => {});
  };
  useEffect(() => { // leaving without tapping Done still lets the office know
    const bye = () => report(true);
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(slot, file, { replace, sketchData } = {}) {
    setErr(""); setDone(false);
    setBusy((b) => ({ ...b, [slot]: (b[slot] || 0) + 1 }));
    let f = file;
    if (slot !== "sketch" || !/png/.test(file.type)) { try { f = await compress(file, 1800, 0.75); } catch { /* original */ } }
    const body = new FormData();
    body.append("file", f, f.name || "photo.jpg"); body.append("slot", slot);
    if (replace) body.append("replace", "1");
    if (sketchData) body.append("sketchData", JSON.stringify(sketchData));
    let d = null;
    for (let i = 0; i < 3 && !(d && (d.ok || d.status === 403)); i++) {
      d = await fetch(api, { method: "POST", body }).then(async (r) => ({ status: r.status, ...(await r.json()) })).catch((e) => ({ ok: false, error: e.message }));
      if (!d.ok && d.status !== 403) await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
    setBusy((b) => ({ ...b, [slot]: b[slot] - 1 }));
    if (!d.ok) { setErr(d.error || "A photo didn't upload. Try again."); return; }
    setPhotos(d.photos); changes.current.added++;
    if (slot === "sketch" && replace && !sketchData) setSketchData(null); // a photo of a drawing replaced the in-app one
  }
  async function addFiles(slot, files, opts) { for (const file of Array.from(files || [])) await upload(slot, file, opts); }

  async function remove(p) {
    if (!window.confirm(`Take this photo off the job? (It stays in the job's Drive folder.)`)) return;
    setErr(""); setDone(false);
    const d = await fetch(api, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) }).then((r) => r.json()).catch((e) => ({ ok: false, error: e.message }));
    if (!d.ok) { setErr(d.error || "Couldn't remove it."); return; }
    setPhotos(d.photos); changes.current.removed++;
  }

  async function finish() { await report(false); setDone(true); }

  const bySlot = (id) => photos.filter((p) => p.slot === id);
  const shown = SLOTS.filter((s) => s.id === "sketch" || showAll || bySlot(s.id).length);
  const hidden = SLOTS.length - shown.length;

  const picker = (slot, label, opts) => (
    <label className="btn ghost" style={{ display: "inline-flex", cursor: "pointer", padding: "8px 14px" }}>
      {label}
      <input type="file" accept="image/*" multiple={!opts} style={{ display: "none" }} onChange={(e) => { addFiles(slot, opts ? [e.target.files[0]].filter(Boolean) : e.target.files, opts); e.target.value = ""; }} />
    </label>
  );

  return (
    <div>
      <p className="intro">Add anything that was missed, or replace a photo. {staff ? "" : "You can change photos until the engineer certifies the job. "}Everything goes into the job's Drive folder{staff ? "" : ", and House & Home is told when you're done"}.</p>
      {shown.map((s) => {
        const list = bySlot(s.id);
        return (
          <div key={s.id} className="send-box" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <b>{s.n ? `${s.n}. ` : ""}{s.label}</b>
              <span className="hint">{busy[s.id] ? "Uploading…" : list.length ? `${list.length} photo${list.length === 1 ? "" : "s"}` : s.id === "sketch" ? "No sketch yet" : ""}</span>
            </div>
            {list.length > 0 && (
              <div className="photo-grid" style={{ marginTop: 8 }}>
                {list.map((p) => (
                  <div key={p.id} className="photo">
                    <img src={src(p.id)} alt={p.label} loading="lazy" />
                    <span>{p.added_at ? "Added after submitting" : "From the submission"}</span>
                    <button type="button" className="linklike" style={{ fontSize: 13 }} onClick={() => remove(p)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {s.id === "sketch" ? (
                <>
                  <button type="button" className="btn" style={{ padding: "8px 14px" }} onClick={() => setDrawing(true)}>{sketchData ? "Edit the drawing" : "Draw the sketch"}</button>
                  {picker("sketch", list.length ? "Replace with a photo" : "Upload a photo of a drawing", { replace: true })}
                </>
              ) : picker(s.id, "+ Add photo")}
            </div>
          </div>
        );
      })}
      {hidden > 0 && <button type="button" className="linklike" style={{ margin: "0 0 14px" }} onClick={() => setShowAll(true)}>Add photos to another section ({hidden} more)</button>}
      {err && <p className="err">{err}</p>}
      {done
        ? <p className="ok-msg">Saved.{staff ? (hasLetter ? " Tap Regenerate letter on the job page to put the new photos in the letter." : "") : " House & Home has been told about the changes."}</p>
        : <button type="button" className="btn" disabled={uploading} onClick={finish}>{uploading ? "Waiting for photos to upload…" : "Done"}</button>}
      {drawing && (
        <SketchBuilder f={home} initial={sketchData} onClose={() => setDrawing(false)}
          onSave={async (file, data) => { setDrawing(false); await upload("sketch", file, { replace: true, sketchData: data }); setSketchData(data); }} />
      )}
    </div>
  );
}
