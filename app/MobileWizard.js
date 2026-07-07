"use client";
import { useState, useEffect } from "react";
import { SINGLE, MULTI, PHOTO_SLOTS, FEE } from "../lib/formConfig";
import PhotoSlot from "./PhotoSlot";

const byId = (id) => SINGLE.find((s) => s.id === id);

export default function MobileWizard({ form, onSwitchView, switchLabel }) {
  const { f, set, toggle, invalid, validate, companies, sketch, addSketch, setSketch, photos, addTo, removeFrom, totalPhotos, busy, progress, payAndSubmit } = form;

  // Build the ordered list of screens.
  const fieldScreens = [
    {
      title: "Report info", required: ["inspectorName", "clientName", "sendReportTo", "date"],
      render: () => (<>
        <Field id="inspectorName" label="Inspector name" req f={f} set={set} invalid={invalid} />
        <Field id="clientName" label="Client name" req f={f} set={set} invalid={invalid} />
        <Field id="sendReportTo" label="Send report to (email)" type="email" req f={f} set={set} invalid={invalid} placeholder="you@company.com" />
        <div className={"field" + (invalid.date ? " invalid" : "")}><label className="req" htmlFor="date">Date inspected</label><input id="date" type="date" value={f.date} onChange={set("date")} />{invalid.date && <div className="err">Required.</div>}</div>
        <div className="field">
          <label htmlFor="inspectionCompany">Inspecting on behalf of a company? (optional)</label>
          <select id="inspectionCompany" value={f.inspectionCompany} onChange={set("inspectionCompany")}>
            <option value="">None — use House &amp; Home branding</option>
            {companies.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <p className="hint">Don't see your company? <a href="/companies" target="_blank" rel="noreferrer">Add it here</a>.</p>
        </div>
      </>),
    },
    {
      title: "Home basics",
      render: () => (<>
        <Field id="ageOfHome" label="Age of home" f={f} set={set} placeholder="e.g. 1998" />
        <Field id="dimensions" label="Dimensions (L x W)" f={f} set={set} placeholder="56 x 28" />
        <Select s={byId("inspectionType")} f={f} set={set} />
        <Select s={byId("frontFaces")} f={f} set={set} />
      </>),
    },
    {
      title: "Conditions",
      render: () => (<>
        <Select s={byId("rain3")} f={f} set={set} />
        <Select s={byId("homeType")} f={f} set={set} />
        <Select s={byId("attached")} f={f} set={set} />
        <Select s={byId("certTags")} f={f} set={set} />
        <Select s={byId("tieDowns")} f={f} set={set} />
      </>),
    },
    { title: "Skirting, venting & framing", render: () => <>{["skirting", "venting", "framing"].map((id) => <Chips key={id} m={MULTI.find((x) => x.id === id)} f={f} toggle={toggle} />)}</> },
    { title: "Piers, insulation & moisture", render: () => <>{["piers", "insulation", "moisture"].map((id) => <Chips key={id} m={MULTI.find((x) => x.id === id)} f={f} toggle={toggle} />)}</> },
    {
      title: "Home sketch & comments",
      render: () => (<>
        <PhotoSlot big label="Home sketch" sub="Draw it on paper or a tablet, then upload a photo of it." items={sketch} onAdd={addSketch} onRemove={() => setSketch([])} max={1} />
        <div className="field" style={{ marginTop: 16 }}><label htmlFor="generalComments">General comments</label><textarea id="generalComments" value={f.generalComments} onChange={set("generalComments")} /></div>
      </>),
    },
  ];

  const photoScreens = PHOTO_SLOTS.map((slot) => ({
    title: `Photo ${slot.n} of ${PHOTO_SLOTS.length}`,
    render: () => (<>
      <PhotoSlot big label={slot.label} sub="Add as many as you need. Optional — skip if it doesn't apply." items={photos[slot.id]} onAdd={addTo(slot.id)} onRemove={removeFrom(slot.id)} />
    </>),
  }));

  const reviewScreen = {
    title: "Pay & submit", isReview: true,
    render: () => (<>
      <div className="summary"><div><div className="mono" style={{ color: "#9FD4E8" }}>Certification fee</div><small>{f.clientName ? "Client: " + f.clientName : "—"}</small></div><div className="amt">${FEE}.00</div></div>
      <p className="hint" style={{ marginBottom: 14 }}>{totalPhotos()} file{totalPhotos() === 1 ? "" : "s"} ready to upload (incl. sketch).</p>
      <Field id="cardname" label="Name on card" req f={f} set={set} invalid={invalid} />
      <div className={"field" + (invalid.cardnum ? " invalid" : "")}><label className="req" htmlFor="cardnum">Card number</label>
        <input id="cardnum" value={f.cardnum} inputMode="numeric" maxLength={19} placeholder="4242 4242 4242 4242"
          onChange={(e) => form.setVal("cardnum", e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim())} />
        {invalid.cardnum && <div className="err">Enter a 16-digit card number.</div>}</div>
      <div className="row c2">
        <div className={"field" + (invalid.exp ? " invalid" : "")}><label className="req" htmlFor="exp">Expiry</label>
          <input id="exp" value={f.exp} maxLength={7} placeholder="MM / YY" onChange={(e) => { let v = e.target.value.replace(/\D/g, "").slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + " / " + v.slice(2); form.setVal("exp", v); }} />
          {invalid.exp && <div className="err">Required.</div>}</div>
        <div className={"field" + (invalid.cvc ? " invalid" : "")}><label className="req" htmlFor="cvc">CVC</label>
          <input id="cvc" value={f.cvc} inputMode="numeric" maxLength={4} placeholder="123" onChange={(e) => form.setVal("cvc", e.target.value.replace(/\D/g, "").slice(0, 4))} />
          {invalid.cvc && <div className="err">Required.</div>}</div>
      </div>
      <div className="lock"><span>Payment is stubbed for now — no card is charged.</span></div>
      {busy && <div className="progress"><div style={{ width: progress + "%" }} /></div>}
    </>),
  };

  const screens = [...fieldScreens, ...photoScreens, reviewScreen];
  const [i, setI] = useState(0);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [i]);
  const cur = screens[i];
  const pct = Math.round(((i + 1) / screens.length) * 100);

  function next() {
    if (cur.required && !validate(cur.required)) return;
    if (i < screens.length - 1) setI(i + 1);
  }
  function submit() { if (validate(["cardname", "cardnum", "exp", "cvc"])) payAndSubmit(); }

  return (
    <div className="wiz">
      <header><div className="bar">
        <a className="brand" href="#"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspector Portal</span></a>
        <div className="who">{onSwitchView && <button className="viewswitch" onClick={onSwitchView}>{switchLabel}</button>}</div>
      </div></header>

      <div className="wiz-progress"><div style={{ width: pct + "%" }} /></div>

      <div className="wiz-body">
        <div className="wiz-step mono">Step {i + 1} of {screens.length}</div>
        <h2 className="wiz-title">{cur.title}</h2>
        <div className="wiz-fields">{cur.render()}</div>
      </div>

      <div className="wiz-nav">
        <button className="btn ghost" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0 || busy}>Back</button>
        {cur.isReview
          ? <button className="btn" onClick={submit} disabled={busy}>{busy ? `Uploading… ${progress}%` : `Pay $${FEE} & submit`}</button>
          : <button className="btn" onClick={next}>Next</button>}
      </div>
    </div>
  );
}

function Field({ id, label, req, type, f, set, invalid = {}, placeholder }) {
  return (
    <div className={"field" + (invalid[id] ? " invalid" : "")}>
      <label className={req ? "req" : ""} htmlFor={id}>{label}</label>
      <input id={id} type={type || "text"} value={f[id]} onChange={set(id)} placeholder={placeholder} />
      {invalid[id] && <div className="err">{type === "email" ? "Enter a valid email." : "Required."}</div>}
    </div>
  );
}
function Select({ s, f, set }) {
  return (
    <div className="field">
      <label htmlFor={s.id}>{s.label}</label>
      <select id={s.id} value={f[s.id]} onChange={set(s.id)}>
        <option value="">Choose one</option>{s.opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
function Chips({ m, f, toggle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ marginBottom: 8 }}>{m.label}</label>
      <div className="chips">
        {m.opts.map((o) => <button type="button" key={o} className={"chip" + (f[m.id].includes(o) ? " on" : "")} onClick={() => toggle(m.id, o)}>{o}</button>)}
      </div>
    </div>
  );
}
