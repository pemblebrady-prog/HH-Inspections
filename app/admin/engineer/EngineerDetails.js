"use client";
import { useEffect, useState } from "react";

const api = (url, opts) => fetch(url, opts).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
const longDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
function daysLeft(d) {
  if (!d) return null;
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }) + "T00:00:00Z");
  return Math.round((new Date(d + "T00:00:00Z") - today) / 86400000);
}

export default function EngineerDetails({ id }) {
  const q = id ? `?id=${encodeURIComponent(id)}` : "";
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api(`/api/admin/engineer${q}`).then((r) => (r.ok ? setD(r) : setErr(r.error || "Couldn't load"))); }, [q]);

  if (err) return <div className="card"><p className="err">{err}</p></div>;
  if (!d) return <div className="card"><p className="hint">Loading…</p></div>;
  if (d.engineers) return <PickEngineer list={d.engineers} />;
  return <Editor key={d.engineer.id} initial={d.engineer} q={q} admin={d.canPickOthers} />;
}

function PickEngineer({ list }) {
  return (
    <section className="card">
      <h2>Engineers</h2>
      <p className="intro">Pick an engineer to see or edit their PE details. To add one, invite them on People with the Engineer role.</p>
      {list.length === 0 ? <p className="hint">No engineers yet. On People, invite Ron (or change his role) to Engineer.</p> : (
        <ul className="month-list">
          {list.map((e) => {
            const left = daysLeft(e.pe_license_expires);
            return (
              <li key={e.id}>
                <a href={`/admin/engineer?id=${e.id}`}>{e.full_name || e.email}</a>
                <span className="hint" style={{ marginTop: 0, color: left != null && left <= 60 ? "var(--err)" : undefined }}>
                  {!e.active ? "Deactivated" : !e.pe_license_number ? "Details missing" : left == null ? `PE #${e.pe_license_number}` : left < 0 ? "License expired" : `Expires ${longDay(e.pe_license_expires)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Editor({ initial, q, admin }) {
  const [e, setE] = useState(initial);
  const [f, setF] = useState({
    fullName: initial.full_name || "", title: initial.pe_title || "Professional Engineer",
    licenseNumber: initial.pe_license_number || "", licenseState: initial.pe_license_state || "AZ", licenseExpires: initial.pe_license_expires || "",
  });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.value }));
  const left = daysLeft(e.pe_license_expires);

  async function save(ev) {
    ev.preventDefault(); setBusy("save"); setErr(""); setMsg("");
    const r = await api(`/api/admin/engineer${q}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy("");
    if (!r.ok) { setErr(r.error || "Couldn't save"); return; }
    setE(r.engineer); setMsg("Saved. New and regenerated letters use these details.");
  }
  async function upload(kind, file) {
    if (!file) return;
    setBusy(kind); setErr(""); setMsg("");
    const fd = new FormData(); fd.append("kind", kind); fd.append("file", file);
    const r = await api(`/api/admin/engineer${q}`, { method: "POST", body: fd });
    setBusy("");
    if (!r.ok) { setErr(r.error || "Upload failed"); return; }
    setE(r.engineer); setMsg(kind === "stamp" ? "Stamp saved." : "Signature saved.");
  }
  const img = (fileId, alt, h) => fileId
    ? <img src={`/api/admin/photo?id=${encodeURIComponent(fileId)}`} alt={alt} style={{ maxHeight: h, maxWidth: "100%", background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: 6 }} />
    : <p className="hint" style={{ color: "var(--err)" }}>Not uploaded yet.</p>;

  return (
    <>
      {admin && <p style={{ margin: "0 0 10px" }}><a href="/admin/engineer">← All engineers</a></p>}
      {left != null && left <= 60 && (
        <div className="card" role="alert" style={{ marginBottom: 18, borderColor: "#e2b9b2", background: "#fbebeb" }}>
          <b>{left < 0 ? `PE license expired on ${longDay(e.pe_license_expires)}.` : `PE license expires in ${left} day${left === 1 ? "" : "s"} (${longDay(e.pe_license_expires)}).`}</b>
          <p style={{ margin: "6px 0 0" }}>{left < 0 ? "Final letters ask for confirmation before sending until the new date is entered." : "Enter the new expiration date here once it's renewed."}</p>
        </div>
      )}
      <section className="card">
        <h2>{e.full_name || e.email}</h2>
        <p className="intro">These go on every certification letter this engineer signs: the name and title in the letter, the license line under the signature, and the stamp and signature images.</p>
        <form onSubmit={save}>
          <div className="grid2">
            <div className="field"><label className="req" htmlFor="fullName">Name on letters</label><input id="fullName" value={f.fullName} onChange={set("fullName")} /></div>
            <div className="field"><label htmlFor="title">Title</label><input id="title" value={f.title} onChange={set("title")} /></div>
            <div className="field"><label htmlFor="licenseNumber">PE license number</label><input id="licenseNumber" value={f.licenseNumber} onChange={set("licenseNumber")} /></div>
            <div className="field"><label htmlFor="licenseState">License state</label><input id="licenseState" value={f.licenseState} onChange={set("licenseState")} /></div>
            <div className="field"><label htmlFor="licenseExpires">License expires</label><input id="licenseExpires" type="date" value={f.licenseExpires} onChange={set("licenseExpires")} /></div>
          </div>
          <button className="btn" disabled={!!busy}>{busy === "save" ? "Saving…" : "Save details"}</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Stamp and signature</h2>
        <p className="intro">Upload clear images, ideally PNGs with a transparent or white background. They're stored privately in Drive (no public link) and only placed on letters.</p>
        <div className="grid2" style={{ gap: 18 }}>
          <div>
            <label style={{ fontWeight: 600 }}>PE stamp</label>
            <div style={{ margin: "8px 0" }}>{img(e.stamp_drive_file_id, "PE stamp", 160)}</div>
            <input type="file" accept="image/png,image/jpeg" disabled={!!busy} onChange={(ev) => upload("stamp", ev.target.files[0])} />
            {busy === "stamp" && <p className="hint">Uploading…</p>}
          </div>
          <div>
            <label style={{ fontWeight: 600 }}>Signature</label>
            <div style={{ margin: "8px 0" }}>{img(e.signature_drive_file_id, "Signature", 80)}</div>
            <input type="file" accept="image/png,image/jpeg" disabled={!!busy} onChange={(ev) => upload("signature", ev.target.files[0])} />
            {busy === "signature" && <p className="hint">Uploading…</p>}
          </div>
        </div>
        <p className="hint" style={{ marginTop: 14 }}>Letters already made keep what they had. Use "Regenerate letter" on a job to update its draft.</p>
      </section>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
    </>
  );
}
