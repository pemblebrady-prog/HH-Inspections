"use client";
import { useEffect, useRef, useState } from "react";
import { normalizeLogo } from "../../lib/formConfig";

function logoUrl(fileId) {
  return fileId ? `https://drive.google.com/uc?export=view&id=${fileId}` : null;
}

export default function Companies() {
  const [companies, setCompanies] = useState(null);
  const [err, setErr] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logo, setLogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(null); // name of company whose logo we're replacing
  const fileRef = useRef(null);

  function load() {
    fetch("/api/companies").then((r) => r.json()).then((d) => {
      if (d.ok) setCompanies(d.companies || []); else setErr(d.error || "Could not load");
    }).catch((e) => setErr(String(e)));
  }
  useEffect(load, []);

  const [normalizing, setNormalizing] = useState(false);
  async function pickFile(e) {
    const raw = e.target.files[0];
    if (!raw) { setLogo(null); setPreview(null); return; }
    setNormalizing(true);
    const f = await normalizeLogo(raw); // resize + flatten to a sane letterhead size, whatever was uploaded
    setLogo(f);
    setPreview(URL.createObjectURL(f));
    setNormalizing(false);
  }

  async function save(e) {
    e.preventDefault();
    const finalName = editingName || name.trim();
    if (!finalName) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", finalName);
      if (phone) fd.append("phone", phone);
      if (email) fd.append("email", email);
      if (logo) fd.append("logo", logo);
      const res = await fetch("/api/companies/save", { method: "POST", body: fd }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Save failed");
      setName(""); setPhone(""); setEmail(""); setLogo(null); setPreview(null); setEditingName(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err) {
      alert("Couldn't save: " + err.message);
    } finally { setBusy(false); }
  }

  function startReplace(company) {
    setEditingName(company.name);
    setName(company.name);
    setPhone(company.phone || ""); setEmail(company.email || "");
    setLogo(null); setPreview(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() {
    setEditingName(null); setName(""); setLogo(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <header><div className="bar">
        <a className="brand" href="/"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspector Companies</span></a>
        <div className="who"><a className="viewswitch" href="/tracker">View tracker</a></div>
      </div></header>

      <div className="shell" style={{ maxWidth: 720 }}>
        <div className="track-head"><h2>Inspector companies</h2></div>
        <p className="intro" style={{ marginTop: -10 }}>
          Add the inspection companies that submit reports here. Once added, they appear as an option in the
          submission wizard so their reports carry their own branding.
        </p>

        <section className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.15rem" }}>{editingName ? `Replace logo for “${editingName}”` : "Add a company"}</h2>
          <form onSubmit={save}>
            <div className="field" style={{ marginTop: 16 }}>
              <label className="req" htmlFor="cname">Company name</label>
              <input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. StarCrest Inspections" disabled={!!editingName} />
            </div>
            <div className="row c2">
              <div className="field">
                <label htmlFor="cphone">Sign-off phone (optional)</label>
                <input id="cphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="520-555-0100" />
              </div>
              <div className="field">
                <label htmlFor="cemail">Sign-off email (optional)</label>
                <input id="cemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="company@example.com" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="clogo">Logo (optional — automatically resized to fit the letterhead; a bold text header is used if none is provided)</label>
              <input ref={fileRef} id="clogo" type="file" accept="image/*" onChange={pickFile} />
            </div>
            {normalizing && <p className="hint">Resizing logo…</p>}
            {preview && !normalizing && (
              <div className="thumb" style={{ width: 140, height: 90, marginBottom: 14 }}>
                <img src={preview} alt="Logo preview" style={{ objectFit: "contain", background: "#fff" }} />
              </div>
            )}
            <div className="actions" style={{ marginTop: 4 }}>
              {editingName && <button type="button" className="btn ghost" onClick={cancelEdit}>Cancel</button>}
              <button className="btn" disabled={busy || normalizing || !(name || editingName)}>{busy ? "Saving…" : editingName ? "Save new logo" : "Add company"}</button>
            </div>
          </form>
        </section>

        {err && <div className="card"><p className="err">Couldn't load companies: {err}</p></div>}
        {!companies && !err && <div className="card"><p className="intro">Loading…</p></div>}
        {companies && companies.length === 0 && <div className="card"><p className="intro">No companies added yet. Add one above — inspectors will then see it in the wizard.</p></div>}

        {companies && companies.length > 0 && (
          <div className="table-wrap">
            <table className="track">
              <thead><tr><th>Logo</th><th>Company</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.name}>
                    <td>
                      {c.logoFileId
                        ? <img src={logoUrl(c.logoFileId)} alt={c.name} style={{ height: 32, maxWidth: 110, objectFit: "contain" }} />
                        : <span className="hint">text only</span>}
                    </td>
                    <td>{c.name}</td>
                    <td>{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                    <td><button className="viewswitch" onClick={() => startReplace(c)}>Replace logo</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
