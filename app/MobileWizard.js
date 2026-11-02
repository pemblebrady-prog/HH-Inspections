"use client";
import { useState, useEffect } from "react";
import { SINGLE, MULTI, DETAILS, PHOTO_SLOTS, FEE } from "../lib/formConfig";
import PhotoSlot from "./PhotoSlot";
import AppHeader from "./AppHeader";

const byId = (id) => SINGLE.find((s) => s.id === id);

export default function MobileWizard({ form, onSwitchView, switchLabel }) {
  const { f, set, toggle, invalid, validate, companies, sketch, addSketch, setSketch, photos, addTo, removeFrom, totalPhotos, busy, progress, payAndSubmit } = form;

  // Build the ordered list of screens.
  const fieldScreens = [
    {
      title: "Property address", required: ["propertyAddress"],
      render: () => (<>
        <Field id="propertyAddress" label="Property address" req f={f} set={set} invalid={invalid} placeholder="1318 N Pso Temblon, Sierra Vista, AZ 85635" />
      </>),
    },
    {
      title: "Report info", required: ["inspectorName", "clientName", "sendReportTo", "date"],
      render: () => (<>
        <Field id="inspectorName" label="Inspector name" req f={f} set={set} invalid={invalid} />
        <Field id="clientName" label="Client name" req f={f} set={set} invalid={invalid} />
        <div className="field">
          <label htmlFor="inspectionCompany">Inspecting on behalf of a company? (optional)</label>
          <select id="inspectionCompany" value={f.inspectionCompany} onChange={set("inspectionCompany")}>
            <option value="">None — use House &amp; Home branding</option>
            {companies.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <p className="hint">Don't see your company? <a href="/companies" target="_blank" rel="noreferrer">Add it here</a>.</p>
        </div>
        <Field id="sendReportTo" label="Send report to (email)" type="email" req f={f} set={set} invalid={invalid} placeholder="you@company.com" />
        <div className={"field" + (invalid.date ? " invalid" : "")}><label className="req" htmlFor="date">Date inspected</label><input id="date" type="date" value={f.date} onChange={set("date")} />{invalid.date && <div className="err">Required.</div>}</div>
      </>),
    },
    {
      title: "Home basics",
      render: () => (<>
        <Field id="ageOfHome" label="Age of home" f={f} set={set} placeholder="e.g. 1998" />
        <div className="row c2">
          <Field id="lengthFt" label="Length (ft)" f={f} set={set} placeholder="64" />
          <Field id="widthFt" label="Width (ft)" f={f} set={set} placeholder="28" />
        </div>
        <Field id="sqft" label="Square footage" f={f} set={set} placeholder="e.g. 1,154" />
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
    {
      title: "Tags, tie-downs & access",
      render: () => (<>
        <Field id="hudTagNumbers" label="HUD tag numbers" f={f} set={set} placeholder="e.g. ARZ 249557, ARZ 249556" />
        <Field id="tieDownsPerSide" label="Tie-downs per side" f={f} set={set} placeholder="e.g. 10" />
        <Field id="crawlAccess" label="Crawlspace access location" f={f} set={set} placeholder="e.g. east side skirting" />
        <Select s={byId("grading")} f={f} set={set} />
        <Select s={byId("piersCondition")} f={f} set={set} />
        <Select s={byId("skirtingCondition")} f={f} set={set} />
        <Select s={byId("axles")} f={f} set={set} />
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

  const co = form.profile && form.profile.company;
  const internal = Boolean(co && co.is_internal);
  const coName = co && !co.is_internal ? co.name : f.inspectionCompany;
  const price = co && co.price_cents != null ? co.price_cents / 100 : Number(FEE);
  const reviewScreen = {
    title: "Review & submit", isReview: true,
    render: () => (<>
      <div className="summary"><div><div className="mono" style={{ color: "#9FD4E8" }}>Certification fee</div><small>{f.clientName ? "Client: " + f.clientName : "—"}</small></div><div className="amt">{internal ? "No charge" : `$${price.toFixed(2)}`}</div></div>
      <p className="hint" style={{ marginBottom: 14 }}>{totalPhotos()} file{totalPhotos() === 1 ? "" : "s"} ready to upload (incl. sketch).</p>
      {!internal && <div className="lock"><span>Charged to {coName || "your company"}'s payment method on file. Online payment is being set up, so nothing is charged yet.</span></div>}
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
  function submit() { payAndSubmit(); }

  return (
    <div className="wiz">
      <AppHeader title="Inspector Portal" profile={form.profile} right={onSwitchView && <button className="viewswitch" onClick={onSwitchView}>{switchLabel}</button>} />

      <div className="wiz-progress"><div style={{ width: pct + "%" }} /></div>

      <div className="wiz-body">
        <div className="wiz-step mono">Step {i + 1} of {screens.length}</div>
        <h2 className="wiz-title">{cur.title}</h2>
        <div className="wiz-fields">{cur.render()}</div>
      </div>

      <div className="wiz-nav">
        <button className="btn ghost" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0 || busy}>Back</button>
        {cur.isReview
          ? <button className="btn" onClick={submit} disabled={busy}>{busy ? `Uploading… ${progress}%` : "Submit"}</button>
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
