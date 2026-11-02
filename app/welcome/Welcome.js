"use client";
import { useEffect, useRef, useState } from "react";
import HomeScreenSteps from "../HomeScreenSteps";
import TeamManager from "../TeamManager";
import { normalizeLogo } from "../../lib/formConfig";

async function postJSON(url, body) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
}

export default function Welcome({ profile }) {
  const owner = profile.role === "company_owner";
  const company = profile.company || {};
  const steps = owner
    ? [["details", "Your details"], ["company", "Company"], ["payment", "Payment"], ["team", "Your inspectors"], ["phone", "Home screen"]]
    : [["details", "Your details"], ["reports", "Reports"], ["phone", "Home screen"]];
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { window.scrollTo({ top: 0 }); setErr(""); }, [i]);
  const step = steps[i][0];

  const [d, setD] = useState({
    fullName: profile.full_name || "", phone: profile.phone || "", certificateNumber: profile.certificate_number || "",
    defaultReportEmail: profile.default_report_email || "",
  });
  const [c, setC] = useState({
    phone: company.phone || "", email: company.email || "", billingContact: company.billing_contact || "",
    billingAddress: company.billing_address || "", billingCity: company.billing_city || "",
    billingState: company.billing_state || "AZ", billingZip: company.billing_zip || "",
  });
  const [logo, setLogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const setDk = (k) => (e) => setD((s) => ({ ...s, [k]: e.target.value }));
  const setCk = (k) => (e) => setC((s) => ({ ...s, [k]: e.target.value }));

  const next = () => setI((n) => Math.min(n + 1, steps.length - 1));

  async function saveAndNext() {
    setBusy(true); setErr("");
    let r = { ok: true };
    if (step === "details") r = await postJSON("/api/me/onboarding", { step: "details", ...d });
    else if (step === "reports") r = await postJSON("/api/me/onboarding", { step: "reports", defaultReportEmail: d.defaultReportEmail });
    else if (step === "company") {
      const fd = new FormData();
      Object.entries(c).forEach(([k, v]) => fd.append(k, v));
      if (logo) fd.append("logo", logo);
      r = await fetch("/api/me/company", { method: "POST", body: fd }).then((x) => x.json()).catch((e) => ({ ok: false, error: String(e) }));
    }
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Couldn't save"); return; }
    next();
  }

  async function finish() {
    setBusy(true);
    const r = await postJSON("/api/me/onboarding", { step: "finish" });
    if (!r.ok) { setBusy(false); setErr(r.error || "Couldn't finish"); return; }
    window.location.replace("/");
  }

  async function pickLogo(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const small = await normalizeLogo(f);
    setLogo(small); setPreview(URL.createObjectURL(small));
  }

  const isLast = i === steps.length - 1;
  const field = (id, label, value, onChange, opts = {}) => (
    <div className="field">
      <label className={opts.req ? "req" : ""} htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={onChange} type={opts.type || "text"} inputMode={opts.inputMode}
        autoComplete={opts.autoComplete} placeholder={opts.placeholder} />
      {opts.hint && <p className="hint">{opts.hint}</p>}
    </div>
  );

  return (
    <>
      <header><div className="bar">
        <a className="brand" href="#"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Welcome</span></a>
        <div className="who"><form action="/auth/signout" method="post"><button className="viewswitch" type="submit">Sign out</button></form></div>
      </div></header>

      <div className="shell" style={{ maxWidth: 620 }}>
        <div className="stepper" aria-hidden="true">
          {steps.map(([k, lbl], n) => (
            <div key={k} className={"s" + (n === i ? " active" : n < i ? " done" : "")}><span className="mono">Step {n + 1}</span><span className="lbl">{lbl}</span></div>
          ))}
        </div>

        <section className="card">
          {step === "details" && (<>
            <h2>Welcome{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!</h2>
            <p className="intro">
              {owner ? `You're set up as the owner of ${company.name || "your company"}. ` : `You're set up as an inspector${company.name && !company.is_internal ? ` with ${company.name}` : ""}. `}
              A few quick details and you're ready to go.
            </p>
            {field("fullName", "Full name", d.fullName, setDk("fullName"), { req: true, autoComplete: "name" })}
            {field("phone", "Cell phone", d.phone, setDk("phone"), { req: true, type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "520-555-0123" })}
            {field("cert", owner ? "Arizona inspector certificate # (if you inspect)" : "Arizona inspector certificate #", d.certificateNumber, setDk("certificateNumber"),
              { req: !owner, hint: "Your Arizona Board of Technical Registration home inspector certificate number." })}
          </>)}

          {step === "reports" && (<>
            <h2>Where should reports go?</h2>
            <p className="intro">We'll fill this in for you on every job. You can still change it on any submission.</p>
            {field("rep", "Default email for certified reports", d.defaultReportEmail, setDk("defaultReportEmail"),
              { type: "email", inputMode: "email", placeholder: profile.email, hint: "Leave blank to enter it each time." })}
          </>)}

          {step === "company" && (<>
            <h2>{company.name || "Your company"}</h2>
            <p className="intro">This appears on your certification letters and statements.</p>
            <div className="field">
              <label>Company logo (for the letterhead)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {preview && <img src={preview} alt="Logo preview" style={{ maxHeight: 56, maxWidth: 200, border: "1px solid var(--line)", background: "#fff", padding: 4 }} />}
                <button type="button" className="btn ghost" onClick={() => fileRef.current.click()}>{preview ? "Change logo" : "Upload logo"}</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickLogo} />
              </div>
              <p className="hint">Optional. PNG or JPG works best.</p>
            </div>
            <div className="grid2">
              {field("cphone", "Company phone", c.phone, setCk("phone"), { req: true, type: "tel", inputMode: "tel" })}
              {field("cemail", "Company email", c.email, setCk("email"), { req: true, type: "email", inputMode: "email" })}
              {field("bcontact", "Billing contact", c.billingContact, setCk("billingContact"))}
              {field("baddr", "Billing address", c.billingAddress, setCk("billingAddress"), { req: true, autoComplete: "address-line1" })}
              {field("bcity", "City", c.billingCity, setCk("billingCity"), { req: true, autoComplete: "address-level2" })}
              <div className="grid2" style={{ gap: "0 12px" }}>
                {field("bstate", "State", c.billingState, setCk("billingState"), { autoComplete: "address-level1" })}
                {field("bzip", "ZIP", c.billingZip, setCk("billingZip"), { req: true, inputMode: "numeric", autoComplete: "postal-code" })}
              </div>
            </div>
          </>)}

          {step === "payment" && (<>
            <h2>Payment</h2>
            <p className="intro">
              Each certification is ${((company.price_cents || 13500) / 100).toFixed(0)}, charged automatically when your inspector submits.
              We'll connect your <b>business bank account (ACH)</b>, or a card if you prefer.
            </p>
            <div className="lock"><span>Online payment setup is coming soon. House &amp; Home will contact you to set it up. You can continue for now.</span></div>
          </>)}

          {step === "team" && (<>
            <h2>Invite your inspectors</h2>
            <p className="intro">Add the inspectors who'll submit jobs for {company.name || "your company"}. Each gets an email to sign in. You can also do this later from the menu under <b>My team</b>.</p>
            <TeamManager compact />
          </>)}

          {step === "phone" && (<>
            <h2>Add it to your phone</h2>
            <HomeScreenSteps />
          </>)}

          {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}

          <div className="actions" style={{ display: "flex", gap: 12, marginTop: 22 }}>
            {i > 0 && <button className="btn ghost" type="button" onClick={() => setI(i - 1)} disabled={busy}>Back</button>}
            {isLast
              ? <button className="btn" type="button" onClick={finish} disabled={busy}>{busy ? "Finishing…" : owner ? "Finish setup" : "Start my first submission"}</button>
              : <button className="btn" type="button" onClick={step === "payment" || step === "team" ? next : saveAndNext} disabled={busy}>{busy ? "Saving…" : step === "team" || step === "payment" ? "Continue" : "Save & continue"}</button>}
          </div>
        </section>
      </div>
    </>
  );
}
