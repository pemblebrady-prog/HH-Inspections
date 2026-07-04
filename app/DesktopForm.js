"use client";
import { useState, useEffect } from "react";
import { SINGLE, MULTI, PHOTO_SLOTS, FEE } from "../lib/formConfig";
import PhotoSlot from "./PhotoSlot";

export default function DesktopForm({ form }) {
  const { f, set, toggle, invalid, validate, sketch, addSketch, setSketch, photos, addTo, removeFrom, totalPhotos, busy, progress, payAndSubmit } = form;
  const [step, setStep] = useState(1);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }, [step]);
  const cls = (k) => "field" + (invalid[k] ? " invalid" : "");

  return (
    <>
      <div className="demo">Live prototype — payment is stubbed (always passes) · files save to Google Drive when configured</div>
      <header><div className="bar">
        <a className="brand" href="#"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspector Portal</span></a>
        <div className="who"><span className="mono">Cert submission</span></div>
      </div></header>

      <div className="shell">
        <div className="stepper" aria-hidden="true">
          {[["1", "Report & findings"], ["2", "Photos"], ["3", "Pay & submit"]].map(([n, lbl]) => {
            const c = +n === step ? " active" : (+n < step ? " done" : "");
            return <div key={n} className={"s" + c}><span className="mono">Step {n}</span><span className="lbl">{lbl}</span></div>;
          })}
        </div>

        {step === 1 && (
          <section className="card">
            <h2>Report &amp; findings</h2>
            <p className="intro">Mirror the certification report: fill in what you observed. Only the basics are required — leave anything that doesn't apply blank.</p>

            <fieldset>
              <legend>Report info</legend>
              <div className="row c2">
                <div className={cls("inspectorName")}><label className="req" htmlFor="inspectorName">Inspector name</label><input id="inspectorName" value={f.inspectorName} onChange={set("inspectorName")} />{invalid.inspectorName && <div className="err">Required — used for the Drive folder.</div>}</div>
                <div className={cls("clientName")}><label className="req" htmlFor="clientName">Client name</label><input id="clientName" value={f.clientName} onChange={set("clientName")} />{invalid.clientName && <div className="err">Required — used for the Drive folder.</div>}</div>
              </div>
              <div className="row c2">
                <div className={cls("sendReportTo")}><label className="req" htmlFor="sendReportTo">Send report to (email)</label><input id="sendReportTo" type="email" value={f.sendReportTo} onChange={set("sendReportTo")} placeholder="you@company.com" />{invalid.sendReportTo && <div className="err">Enter a valid email.</div>}</div>
                <div className={cls("date")}><label className="req" htmlFor="date">Date inspected</label><input id="date" type="date" value={f.date} onChange={set("date")} />{invalid.date && <div className="err">Required — sets the month folder.</div>}</div>
              </div>
              <div className="row c2">
                <div className="field"><label htmlFor="ageOfHome">Age of home</label><input id="ageOfHome" value={f.ageOfHome} onChange={set("ageOfHome")} placeholder="e.g. 1998" /></div>
                <div className="field"><label htmlFor="dimensions">Dimensions (L x W)</label><input id="dimensions" value={f.dimensions} onChange={set("dimensions")} placeholder="56 x 28" /></div>
              </div>
              <div className="field"><label htmlFor="inspectionType">Type of inspection</label>
                <select id="inspectionType" value={f.inspectionType} onChange={set("inspectionType")}>
                  <option value="">Choose one</option>{SINGLE[0].opts.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </fieldset>

            <fieldset>
              <legend>Home details</legend>
              <div className="row c2">
                {SINGLE.slice(1).map((s) => (
                  <div className="field" key={s.id}>
                    <label htmlFor={s.id}>{s.label}</label>
                    <select id={s.id} value={f[s.id]} onChange={set(s.id)}>
                      <option value="">Choose one</option>{s.opts.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Structure &amp; crawlspace — check all that apply</legend>
              {MULTI.map((m) => (
                <div key={m.id} style={{ marginBottom: 16 }}>
                  <label style={{ marginBottom: 8 }}>{m.label}</label>
                  <div className="chips">
                    {m.opts.map((o) => (
                      <button type="button" key={o} className={"chip" + (f[m.id].includes(o) ? " on" : "")} onClick={() => toggle(m.id, o)}>{o}</button>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>

            <fieldset>
              <legend>Sketch &amp; comments</legend>
              <PhotoSlot label="Home sketch (image upload)" sub="Draw the home sketch on paper or a tablet, then upload a photo of it here." items={sketch} onAdd={addSketch} onRemove={() => setSketch([])} max={1} />
              <div className="field" style={{ marginTop: 16 }}><label htmlFor="generalComments">General comments</label><textarea id="generalComments" value={f.generalComments} onChange={set("generalComments")} /></div>
            </fieldset>

            <div className="actions"><span /><button className="btn" onClick={() => { if (validate(["inspectorName", "clientName", "sendReportTo", "date"])) setStep(2); }}>Continue to photos →</button></div>
          </section>
        )}

        {step === 2 && (
          <section className="card">
            <h2>Photos</h2>
            <p className="intro">Upload the pictures listed on the report. Every slot is optional, and you can add <b>as many photos as you need</b> to each one. Large photos are resized automatically. Use “Other pictures” for anything extra.</p>
            {PHOTO_SLOTS.map((slot) => (
              <PhotoSlot key={slot.id} label={`${slot.n}. ${slot.label}`} items={photos[slot.id]} onAdd={addTo(slot.id)} onRemove={removeFrom(slot.id)} />
            ))}
            <div className="countbar" style={{ marginTop: 18 }}><span>{totalPhotos()} file{totalPhotos() === 1 ? "" : "s"} total (incl. sketch)</span><span /></div>
            <div className="actions">
              <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn" onClick={() => setStep(3)}>Continue to payment →</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="card">
            <h2>Pay &amp; submit</h2>
            <p className="intro">The ${FEE} certification fee is due at submission. Your report and photos are sent to the engineer the moment payment clears.</p>
            <div className="summary">
              <div><div className="mono" style={{ color: "#9FD4E8" }}>Certification fee</div><small>{f.clientName ? "Client: " + f.clientName : "—"}</small></div>
              <div className="amt">${FEE}.00</div>
            </div>
            <div className={cls("cardname")}><label className="req" htmlFor="cardname">Name on card</label><input id="cardname" value={f.cardname} onChange={set("cardname")} placeholder="Full name" />{invalid.cardname && <div className="err">Required.</div>}</div>
            <div className={cls("cardnum")}><label className="req" htmlFor="cardnum">Card number</label>
              <input id="cardnum" value={f.cardnum} inputMode="numeric" maxLength={19} placeholder="4242 4242 4242 4242"
                onChange={(e) => form.setVal("cardnum", e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim())} />
              {invalid.cardnum && <div className="err">Enter a 16-digit card number.</div>}</div>
            <div className="row c2">
              <div className={cls("exp")}><label className="req" htmlFor="exp">Expiry</label>
                <input id="exp" value={f.exp} maxLength={7} placeholder="MM / YY"
                  onChange={(e) => { let v = e.target.value.replace(/\D/g, "").slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + " / " + v.slice(2); form.setVal("exp", v); }} />
                {invalid.exp && <div className="err">Required.</div>}</div>
              <div className={cls("cvc")}><label className="req" htmlFor="cvc">CVC</label>
                <input id="cvc" value={f.cvc} inputMode="numeric" maxLength={4} placeholder="123" onChange={(e) => form.setVal("cvc", e.target.value.replace(/\D/g, "").slice(0, 4))} />
                {invalid.cvc && <div className="err">Required.</div>}</div>
            </div>
            <div className="lock">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="1.5" stroke="#5c6b74" strokeWidth="1.6" /><path d="M8 11V8a4 4 0 018 0v3" stroke="#5c6b74" strokeWidth="1.6" /></svg>
              <span>Payment is stubbed for now — no card is charged. Swap in Stripe to go live.</span>
            </div>
            {busy && <div className="progress"><div style={{ width: progress + "%" }} /></div>}
            <div className="actions">
              <button className="btn ghost" onClick={() => setStep(2)} disabled={busy}>← Back</button>
              <button className="btn" onClick={payAndSubmit} disabled={busy}>{busy ? `Uploading… ${progress}%` : `Pay $${FEE}.00 & submit`}</button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
