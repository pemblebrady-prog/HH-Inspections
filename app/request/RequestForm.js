"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { MAIN_TYPES, FOUNDATION_TYPES, CONVENTIONAL_TYPES } from "../../lib/requestOptions";

const STEPS = ["Inspection & you", "The home", "Copies & send"];
const blankAddr = { street: "", line2: "", city: "", state: "AZ", zip: "" };
const BLANK = {
  mainType: "", foundationType: "", conventionalType: "", otherType: "",
  requester: { company: "", first: "", last: "", phone: "", email: "", address: { ...blankAddr } },
  property: { ...blankAddr },
  occupant: { occupied: "", first: "", last: "", phone: "", email: "", informed: "" },
  otherOccupants: "", other: { first: "", last: "", phone: "", email: "" },
  copies: [{ first: "", last: "", email: "" }, { first: "", last: "", email: "" }],
  access: { fenced: "", lockedGates: "", dogs: "", underHomeLocked: "", lockbox: "", lockboxCode: "" },
  comments: "",
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Set a nested value by path, e.g. set("requester.address.city", "Tucson")
function setPath(obj, path, val) {
  const keys = path.split("."); const out = structuredClone(obj); let cur = out;
  keys.slice(0, -1).forEach((k) => { cur = cur[k]; });
  cur[keys[keys.length - 1]] = val; return out;
}
const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

const FormCtx = createContext(null);

function Choice({ path, options, label, req, error }) {
  const { f, pick } = useContext(FormCtx);
  const cur = getPath(f, path);
  return (
    <div className={"field" + (error ? " invalid" : "")}>
      {label && <label className={req ? "req" : ""}>{label}</label>}
      <div className="chips">
        {options.map((o) => <button type="button" key={o} className={"chip" + (cur === o ? " on" : "")} onClick={() => pick(path, cur === o ? "" : o)}>{o}</button>)}
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}
const YesNo = (props) => <Choice {...props} options={["Yes", "No"]} />;
// One line per question: the question on the left, Yes / No on the right.
function YesNoRow({ path, label }) {
  const { f, pick } = useContext(FormCtx);
  const cur = getPath(f, path);
  return (
    <div className="yn-row">
      <span>{label}</span>
      <div className="chips">
        {["Yes", "No"].map((o) => <button type="button" key={o} className={"chip" + (cur === o ? " on" : "")} aria-pressed={cur === o} onClick={() => pick(path, cur === o ? "" : o)}>{o}</button>)}
      </div>
    </div>
  );
}
function Input({ path, label, req, type, placeholder, error, autoComplete, inputMode }) {
  const { bind } = useContext(FormCtx);
  return (
    <div className={"field" + (error ? " invalid" : "")}>
      <label className={req ? "req" : ""} htmlFor={path}>{label}</label>
      <input id={path} type={type || "text"} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} {...bind(path)} />
      {error && <div className="err">{error}</div>}
    </div>
  );
}
function Address({ base, req, error, auto }) {
  return (<>
    <Input path={`${base}.street`} label="Street address" req={req} error={error} autoComplete={auto ? `${auto} address-line1` : undefined} />
    <Input path={`${base}.line2`} label="Address line 2" autoComplete={auto ? `${auto} address-line2` : undefined} />
    <div className="row c3">
      <Input path={`${base}.city`} label="City" req={req} autoComplete={auto ? `${auto} address-level2` : undefined} />
      <Input path={`${base}.state`} label="State" autoComplete={auto ? `${auto} address-level1` : undefined} />
      <Input path={`${base}.zip`} label="ZIP" req={req} inputMode="numeric" autoComplete={auto ? `${auto} postal-code` : undefined} />
    </div>
  </>);
}


export default function RequestForm() {
  const [f, setF] = useState(BLANK);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const started = useRef(Date.now());
  const honey = useRef(null);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  const bind = (path) => ({ value: getPath(f, path) ?? "", onChange: (e) => setF((s) => setPath(s, path, e.target.value)) });
  const pick = (path, val) => setF((s) => setPath(s, path, val));

  // Check just the current step before moving on.
  function stepErrors(n) {
    const e = {};
    if (n === 0) {
      if (!f.mainType) e.mainType = "Choose the type of inspection.";
      if (f.mainType === MAIN_TYPES[0] && !f.foundationType) e.foundationType = "Choose one.";
      if (f.mainType === MAIN_TYPES[1] && !f.conventionalType) e.conventionalType = "Choose one.";
      if (f.mainType === "Other" && !f.otherType.trim()) e.otherType = "Describe the inspection you need.";
    }
    if (n === 0) {
      if (!f.requester.first.trim() || !f.requester.last.trim()) e.requesterName = "Enter your first and last name.";
      if (f.requester.phone.replace(/\D/g, "").length < 10) e.requesterPhone = "Enter a 10-digit phone number.";
      if (!EMAIL_RE.test(f.requester.email.trim())) e.requesterEmail = "Enter a valid email.";
    }
    if (n === 1 && (!f.property.street.trim() || !f.property.city.trim() || !f.property.zip.trim())) e.property = "Enter the home's street, city and ZIP.";
    if (n === 2) f.copies.forEach((c, i) => { if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) e[`copy${i}`] = "Check this email address."; });
    return e;
  }
  // Once errors are showing, clear each one as soon as it's fixed.
  useEffect(() => {
    setErrors((cur) => (Object.keys(cur).length ? stepErrors(step) : cur));
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    const e = stepErrors(step); setErrors(e);
    if (Object.keys(e).length) return;
    setStep((n) => Math.min(n + 1, STEPS.length - 1));
  }

  async function submit() {
    for (let n = 0; n < STEPS.length; n++) { const e = stepErrors(n); if (Object.keys(e).length) { setErrors(e); setStep(n); return; } }
    setBusy(true); setErr("");
    const body = { ...f, mainType: f.mainType === "Other" ? "" : f.mainType, startedAt: started.current, website: honey.current ? honey.current.value : "" };
    const d = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json()).catch(() => ({ ok: false, error: "Couldn't reach the server. Check your connection and try again." }));
    if (!d.ok) { setBusy(false); setErr(d.error || "Something went wrong."); if (d.errors) setErrors(d.errors); return; }
    window.location.assign(`/request/received?ref=${encodeURIComponent(d.ref)}`);
  }

  const last = step === STEPS.length - 1;
  return (
    <FormCtx.Provider value={{ f, bind, pick }}>
      <header><div className="bar">
        <a className="brand" href="https://houseandhomeaz.com"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspection Request</span></a>
      </div></header>
      <div className="shell" style={{ maxWidth: 680 }}>
        <div className="stepper" aria-hidden="true">
          {STEPS.map((lbl, n) => <div key={lbl} className={"s" + (n === step ? " active" : n < step ? " done" : "")}><span className="mono">Step {n + 1}</span><span className="lbl">{lbl}</span></div>)}
        </div>
        <section className="card">
          <h2 style={{ marginBottom: 18 }}>Manufactured Home Engineering Inspection Request</h2>
          {/* Hidden from people; bots fill it in. */}
          <input ref={honey} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

          {step === 0 && (<>
            <Choice path="mainType" label="Type of inspection" req options={[...MAIN_TYPES, "Other"]} error={errors.mainType} />
            {f.mainType === MAIN_TYPES[0] && <Choice path="foundationType" label="Foundation inspection" req options={FOUNDATION_TYPES} error={errors.foundationType} />}
            {f.mainType === MAIN_TYPES[1] && <Choice path="conventionalType" label="Conventional loan" req options={CONVENTIONAL_TYPES} error={errors.conventionalType} />}
            {f.mainType === "Other" && <Input path="otherType" label="Describe the inspection you need" req error={errors.otherType} />}

            <h3 className="rq-h">Requested by</h3>
            <p className="hint" style={{ marginTop: -6, marginBottom: 14 }}>This person will receive a copy of the report and is responsible for payment prior to inspection.</p>
            <div className="row c2">
              <Input path="requester.first" label="First name" req error={errors.requesterName} autoComplete="given-name" />
              <Input path="requester.last" label="Last name" req autoComplete="family-name" />
            </div>
            <div className="row c2">
              <Input path="requester.phone" label="Phone" req type="tel" inputMode="tel" error={errors.requesterPhone} autoComplete="tel" />
              <Input path="requester.email" label="Email" req type="email" inputMode="email" error={errors.requesterEmail} autoComplete="email" />
            </div>
            <Input path="requester.company" label="Company (optional)" autoComplete="organization" />
            <details className="rq-more"><summary>Add your mailing address (optional)</summary><Address base="requester.address" auto="billing" /></details>
          </>)}

          {step === 1 && (<>
            <h3 className="rq-h" style={{ marginTop: 0 }}>Location of home</h3>
            <Address base="property" req error={errors.property} />

            <h3 className="rq-h">Who's there</h3>
            <div className="yn-list">
              <YesNoRow path="occupant.occupied" label="Is the home occupied?" />
              {f.occupant.occupied === "Yes" && <YesNoRow path="occupant.informed" label="Has the occupant been told about the inspection?" />}
              <YesNoRow path="otherOccupants" label="Anyone else living on the property?" />
            </div>
            {f.occupant.occupied === "Yes" && (
              <fieldset><legend>Occupant</legend>
                <div className="row c2"><Input path="occupant.first" label="First name" /><Input path="occupant.last" label="Last name" /></div>
                <div className="row c2"><Input path="occupant.phone" label="Phone" type="tel" inputMode="tel" /><Input path="occupant.email" label="Email" type="email" inputMode="email" /></div>
              </fieldset>
            )}
            {f.otherOccupants === "Yes" && (
              <fieldset><legend>Other occupant</legend>
                <div className="row c2"><Input path="other.first" label="First name" /><Input path="other.last" label="Last name" /></div>
                <div className="row c2"><Input path="other.phone" label="Phone" type="tel" inputMode="tel" /><Input path="other.email" label="Email" type="email" inputMode="email" /></div>
              </fieldset>
            )}
            {f.occupant.occupied === "Yes" && <p className="hint">Once your date and time are confirmed, please let everyone at the property know when the inspection is.</p>}

            <h3 className="rq-h">Access &amp; safety</h3>
            <p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>For our inspectors' safety. Answer what you know; add anything else in the comments.</p>
            <div className="yn-list">
              <YesNoRow path="access.fenced" label="Is the yard fenced?" />
              <YesNoRow path="access.lockedGates" label="Are there locked gates?" />
              <YesNoRow path="access.dogs" label="Are there dogs on the property?" />
              <YesNoRow path="access.underHomeLocked" label="Is access under the home locked?" />
              <YesNoRow path="access.lockbox" label="Is there a contractor box to unlock gates?" />
            </div>
            {f.access.lockbox === "Yes" && <Input path="access.lockboxCode" label="Contractor box code" />}
          </>)}

          {step === 2 && (<>
            <h3 className="rq-h" style={{ marginTop: 0 }}>Send the report to anyone else? <span className="hint" style={{ display: "inline", fontWeight: 400 }}>(optional)</span></h3>
            <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>The report is emailed to you automatically.</p>
            {[0, 1].map((i) => (i === 0 || f.copies[0].email || f.copies[1].email || f.copies[1].first) && (
              <div className="row c3 rq-copy" key={i}>
                <Input path={`copies.${i}.first`} label="First name" />
                <Input path={`copies.${i}.last`} label="Last name" />
                <Input path={`copies.${i}.email`} label="Email" type="email" inputMode="email" error={errors[`copy${i}`]} />
              </div>
            ))}
            <div className="field"><label htmlFor="comments">Comments</label><textarea id="comments" placeholder="Gate instructions, best times, anything we should know" {...bind("comments")} /></div>

            <h3 className="rq-h">Check your request</h3>
            <table className="kv small"><tbody>
              <tr><th>Inspection</th><td>{f.mainType === "Other" ? f.otherType : [f.mainType, f.foundationType || f.conventionalType].filter(Boolean).join(" · ")}</td></tr>
              <tr><th>Home</th><td>{[f.property.street, f.property.city, f.property.zip].filter(Boolean).join(", ")}</td></tr>
              <tr><th>Requested by</th><td>{[`${f.requester.first} ${f.requester.last}`.trim(), f.requester.company, f.requester.phone, f.requester.email].filter(Boolean).join(" · ")}</td></tr>
            </tbody></table>
            <p className="hint">Need to change something? Use Previous.</p>
          </>)}

          {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
          <div className="actions">
            {step > 0 ? <button className="btn ghost" type="button" onClick={() => setStep(step - 1)} disabled={busy}>Previous</button> : <span />}
            {last
              ? <button className="btn" type="button" onClick={submit} disabled={busy}>{busy ? "Sending…" : "Submit request"}</button>
              : <button className="btn" type="button" onClick={next}>Next</button>}
          </div>
        </section>
        <p className="hint" style={{ textAlign: "center" }}>Questions? Call <a href="tel:5205997798">520-599-7798</a>. · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
      </div>
    </FormCtx.Provider>
  );
}
