"use client";
import { useEffect, useRef, useState } from "react";
import { normalizeLogo } from "../../lib/formConfig";

function logoUrl(fileId) {
  return fileId ? `https://drive.google.com/uc?export=view&id=${fileId}` : null;
}

const BLANK = { name: "", phone: "", email: "", billingContact: "", billingAddress: "", billingCity: "", billingState: "AZ", billingZip: "" };

export default function Companies() {
  const [companies, setCompanies] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [logo, setLogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(null); // set while editing an existing company
  const [normalizing, setNormalizing] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  function load() {
    fetch("/api/companies").then((r) => r.json()).then((d) => {
      if (d.ok) setCompanies(d.companies || []); else setErr(d.error || "Could not load");
    }).catch((e) => setErr(String(e)));
  }
  useEffect(load, []);

  async function pickFile(e) {
    const raw = e.target.files[0];
    if (!raw) { setLogo(null); setPreview(null); return; }
    setNormalizing(true);
    const f = await normalizeLogo(raw);
    setLogo(f);
    setPreview(URL.createObjectURL(f));
    setNormalizing(false);
  }

  async function save(e) {
    e.preventDefault();
    const finalName = editingName || form.name.trim();
    if (!finalName) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", finalName);
      ["phone", "email", "billingContact", "billingAddress", "billingCity", "billingState", "billingZip"].forEach((k) => fd.append(k, form[k] || ""));
      if (logo) fd.append("logo", logo);
      const res = await fetch("/api/companies/save", { method: "POST", body: fd }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Save failed");
      setForm(BLANK); setLogo(null); setPreview(null); setEditingName(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err) {
      alert("Couldn't save: " + err.message);
    } finally { setBusy(false); }
  }

  function startEdit(c) {
    setEditingName(c.name);
    setForm({ name: c.name, phone: c.phone || "", email: c.email || "", billingContact: c.billingContact || "",
      billingAddress: c.billingAddress || "", billingCity: c.billingCity || "", billingState: c.billingState || "AZ", billingZip: c.billingZip || "" });
    setLogo(null); setPreview(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() {
    setEditingName(null); setForm(BLANK); setLogo(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // --- monthly statement generator ---
  const [stCompany, setStCompany] = useState("");
  const [stMonth, setStMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [stBusy, setStBusy] = useState(false);
  const [stResult, setStResult] = useState(null);
  const [stErr, setStErr] = useState(null);

  async function generateStatement(e) {
    e.preventDefault();
    setStBusy(true); setStResult(null); setStErr(null);
    try {
      const res = await fetch("/api/statements/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: stCompany, monthYear: stMonth }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Generation failed");
      setStResult(res);
    } catch (err) {
      setStErr(err.message);
    } finally { setStBusy(false); }
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
          submission wizard, and you can generate their monthly statement below.
        </p>

        <section className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.15rem" }}>{editingName ? `Edit “${editingName}”` : "Add a company"}</h2>
          <form onSubmit={save}>
            <div className="field" style={{ marginTop: 16 }}>
              <label className="req" htmlFor="cname">Company name</label>
              <input id="cname" value={form.name} onChange={set("name")} placeholder="e.g. StarCrest Inspections" disabled={!!editingName} />
            </div>

            <fieldset>
              <legend>Certification letter sign-off</legend>
              <div className="row c2">
                <div className="field"><label htmlFor="cphone">Phone</label><input id="cphone" value={form.phone} onChange={set("phone")} placeholder="520-555-0100" /></div>
                <div className="field"><label htmlFor="cemail">Email</label><input id="cemail" type="email" value={form.email} onChange={set("email")} placeholder="company@example.com" /></div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Monthly statement — bill to</legend>
              <p className="hint" style={{ marginTop: 0 }}>Used on the monthly statement's "Bill To" block. Leave blank if you won't be statementing this company.</p>
              <div className="field"><label htmlFor="bcontact">Billing contact name</label><input id="bcontact" value={form.billingContact} onChange={set("billingContact")} placeholder="e.g. Jordan Markona" /></div>
              <div className="field"><label htmlFor="baddr">Billing address</label><input id="baddr" value={form.billingAddress} onChange={set("billingAddress")} placeholder="4121 E Coburn Dr" /></div>
              <div className="row c3">
                <div className="field"><label htmlFor="bcity">City</label><input id="bcity" value={form.billingCity} onChange={set("billingCity")} placeholder="Flagstaff" /></div>
                <div className="field"><label htmlFor="bstate">State</label><input id="bstate" value={form.billingState} onChange={set("billingState")} /></div>
                <div className="field"><label htmlFor="bzip">ZIP</label><input id="bzip" value={form.billingZip} onChange={set("billingZip")} placeholder="86004" /></div>
              </div>
            </fieldset>

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
              <button className="btn" disabled={busy || normalizing || !(form.name || editingName)}>{busy ? "Saving…" : editingName ? "Save changes" : "Add company"}</button>
            </div>
          </form>
        </section>

        {err && <div className="card"><p className="err">Couldn't load companies: {err}</p></div>}
        {!companies && !err && <div className="card"><p className="intro">Loading…</p></div>}
        {companies && companies.length === 0 && <div className="card"><p className="intro">No companies added yet. Add one above — inspectors will then see it in the wizard.</p></div>}

        {companies && companies.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 30 }}>
            <table className="track">
              <thead><tr><th>Logo</th><th>Company</th><th>Bill to</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.name}>
                    <td>
                      {c.logoFileId
                        ? <img src={logoUrl(c.logoFileId)} alt={c.name} style={{ height: 32, maxWidth: 110, objectFit: "contain" }} />
                        : <span className="hint">text only</span>}
                    </td>
                    <td>{c.name}</td>
                    <td>{c.billingContact || c.billingAddress ? "✓ set" : <span className="hint">not set</span>}</td>
                    <td>{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                    <td><button className="viewswitch" onClick={() => startEdit(c)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {companies && companies.length > 0 && (
          <section className="card">
            <h2 style={{ fontSize: "1.15rem" }}>Generate monthly statement</h2>
            <p className="intro">Pulls every submission for the selected company and month from the tracker, and creates a statement Google Doc in your Drive under "Monthly Statements".</p>
            <form onSubmit={generateStatement}>
              <div className="row c2">
                <div className="field">
                  <label className="req" htmlFor="stco">Company</label>
                  <select id="stco" value={stCompany} onChange={(e) => setStCompany(e.target.value)} required>
                    <option value="">Choose a company</option>
                    {companies.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="req" htmlFor="stmonth">Month</label>
                  <input id="stmonth" type="month" value={stMonth} onChange={(e) => setStMonth(e.target.value)} required />
                </div>
              </div>
              <div className="actions"><span /><button className="btn" disabled={stBusy || !stCompany}>{stBusy ? "Generating…" : "Generate statement"}</button></div>
            </form>
            {stErr && <p className="err">{stErr}</p>}
            {stResult && !stResult.simulated && (
              <p className="hint" style={{ color: "var(--ok)" }}>
                Done — {stResult.count} submission{stResult.count === 1 ? "" : "s"}, ${Number(stResult.total).toFixed(2)} total.{" "}
                <a href={stResult.docLink} target="_blank" rel="noreferrer">Open statement ↗</a>
              </p>
            )}
            {stResult && stResult.simulated && <p className="hint">Google Drive isn't configured in this environment — nothing was created.</p>}
          </section>
        )}
      </div>
    </>
  );
}
