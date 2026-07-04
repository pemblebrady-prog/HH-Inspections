"use client";
import { useState, useRef } from "react";

const FEE = process.env.NEXT_PUBLIC_CERT_FEE || "135";

// ---- Field config, taken directly from the Word document ----
const SINGLE = [
  { id: "inspectionType", label: "Type of Inspection", opts: ["HUD", "VA", "Porches & Additions", "FHA", "Conventional", "Cash", "USDA", "Unknown"] },
  { id: "frontFaces", label: "Front of House Faces", opts: ["North", "South", "East", "West", "Northwest", "Northeast", "Southwest", "Southeast"] },
  { id: "rain3", label: "Rain in the Last 3 Days?", opts: ["Yes", "No", "Unknown"] },
  { id: "homeType", label: "Home Type", opts: ["Single-Wide", "Double-Wide", "Triple-Wide", "Unknown"] },
  { id: "attached", label: "Attached Structures", opts: ["Yes", "No", "Unknown"] },
  { id: "certTags", label: "Certification Tags", opts: ["Yes", "No", "Not Visible", "Covered", "Yes, but Illegible"] },
  { id: "tieDowns", label: "Tie Downs", opts: ["Present", "Not Present", "Not Visible", "Present but Inadequate"] },
];
const MULTI = [
  { id: "skirting", label: "Skirting Type", opts: ["Concrete Block Wall", "Slump Block Wall", "Vinyl/Plastic", "Metal", "Wood", "Brick", "Masonry", "Concrete Board", "Foam", "No Skirting"] },
  { id: "venting", label: "Crawlspace Venting", opts: ["Venting Through Skirting", "Masonry Vents", "Venting Through Crawl Access Point(s)", "Inadequate Venting", "No Venting"] },
  { id: "framing", label: "Framing", opts: ["Metal I-Beam", "Wood Joists", "Metal Joists", "Wood Sub-Floor", "Unknown"] },
  { id: "piers", label: "Piers / Supports", opts: ["Concrete Blocks", "Metal Jacks", "Wood", "Concrete Pillars", "Unknown"] },
  { id: "insulation", label: "Insulation", opts: ["Batt Fiberglass", "Blown-In Fiberglass", "Blow-In Cellulose", "Spray Foam", "Rigid Foam", "None Present", "Not Visible", "Unknown"] },
  { id: "moisture", label: "Moisture Barrier (Belly Wrap)", opts: ["Plastic Sheeting", "Fiberboard", "None Present", "Not Visible", "Unknown"] },
];
const PHOTO_SLOTS = [
  { id: "p01", n: "01", label: "All four sides of home" },
  { id: "p02", n: "02", label: "Deficiencies / possible deficiencies" },
  { id: "p03", n: "03", label: "Certification tags (if present)" },
  { id: "p04", n: "04", label: "Grading and drainage" },
  { id: "p05", n: "05", label: "Attached structures" },
  { id: "p06", n: "06", label: "Framing (piers and beams)" },
  { id: "p07", n: "07", label: "Tie downs (if present)" },
  { id: "p08", n: "08", label: "Moisture barrier (belly wrap)" },
  { id: "p09", n: "09", label: "Venting" },
  { id: "p10", n: "10", label: "Insulation (if visible)" },
  { id: "p11", n: "11", label: "Skirting (outside + from inside crawlspace)" },
  { id: "other", n: "12", label: "Other pictures" },
];

async function compress(file, maxDim = 1600, quality = 0.7) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob ? new File([blob], "img.jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

// A labeled photo drop-zone used for the sketch and each of the 12 slots.
function PhotoSlot({ label, sub, items, onAdd, onRemove, max }) {
  const ref = useRef(null);
  const atMax = max && items.length >= max;
  return (
    <div className="slot">
      <div className="slot-head">
        <span className="slot-label">{label}</span>
        <span className="slot-count">{items.length ? `${items.length} added` : "optional"}</span>
      </div>
      {sub && <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{sub}</div>}
      {!atMax && (
        <div className="drop sm" tabIndex={0} role="button"
          onClick={() => ref.current.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ref.current.click(); } }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag"); }}
          onDragLeave={(e) => e.currentTarget.classList.remove("drag")}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag"); onAdd(e.dataTransfer.files); }}>
          <b>Add photo{max === 1 ? "" : "s"}</b> · tap or drag
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" multiple={max !== 1} style={{ display: "none" }}
        onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      {items.length > 0 && (
        <div className="thumbs">
          {items.map((p, i) => (
            <div className="thumb" key={i}>
              <img src={p.url} alt={label + " " + (i + 1)} />
              <button aria-label="Remove" onClick={() => onRemove(i)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [step, setStep] = useState(1);
  const [invalid, setInvalid] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const [f, setF] = useState({
    date: "",
    inspectorName: "", clientName: "", sendReportTo: "", ageOfHome: "", dimensions: "",
    ...Object.fromEntries(SINGLE.map((s) => [s.id, ""])),
    ...Object.fromEntries(MULTI.map((m) => [m.id, []])),
    otherComments: "", generalComments: "",
    cardname: "", cardnum: "", exp: "", cvc: "",
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (k, opt) => setF((s) => {
    const cur = s[k]; return { ...s, [k]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
  });

  const [sketch, setSketch] = useState([]);
  const [photos, setPhotos] = useState(Object.fromEntries(PHOTO_SLOTS.map((s) => [s.id, []])));
  const addTo = (slotId) => (list) => {
    const next = Array.from(list).filter((x) => x.type.startsWith("image/")).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((p) => ({ ...p, [slotId]: [...p[slotId], ...next] }));
  };
  const removeFrom = (slotId) => (i) => setPhotos((p) => ({ ...p, [slotId]: p[slotId].filter((_, idx) => idx !== i) }));
  const addSketch = (list) => {
    const one = Array.from(list).find((x) => x.type.startsWith("image/"));
    if (one) setSketch([{ file: one, url: URL.createObjectURL(one) }]);
  };

  function validate(fields) {
    const bad = {};
    fields.forEach((k) => {
      const v = String(f[k] || "").trim();
      let isBad = !v;
      if (k === "sendReportTo" && v) isBad = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
      if (isBad) bad[k] = true;
    });
    setInvalid(bad);
    return Object.keys(bad).length === 0;
  }

  function totalPhotos() {
    return Object.values(photos).reduce((a, arr) => a + arr.length, 0) + sketch.length;
  }

  async function payAndSubmit() {
    if (!validate(["cardname", "cardnum", "exp", "cvc"])) return;
    setBusy(true); setProgress(0);
    try {
      const sres = await fetch("/api/submit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      }).then((r) => r.json());
      if (!sres.ok) throw new Error(sres.error || "Submit failed");

      // Build the upload queue: sketch first, then each labeled slot.
      const queue = [];
      sketch.forEach((p) => queue.push({ file: p.file, name: "Home Sketch.jpg" }));
      PHOTO_SLOTS.forEach((slot) => {
        photos[slot.id].forEach((p, i) => queue.push({ file: p.file, name: `${slot.n} ${slot.label} - ${i + 1}.jpg` }));
      });

      for (let i = 0; i < queue.length; i++) {
        const small = await compress(queue[i].file);
        const fd = new FormData();
        if (sres.folderId) fd.append("folderId", sres.folderId);
        fd.append("filename", queue[i].name);
        fd.append("file", small);
        await fetch("/api/upload", { method: "POST", body: fd }).catch(() => {});
        setProgress(Math.round(((i + 1) / Math.max(queue.length, 1)) * 100));
      }

      setResult({
        id: sres.submissionId, simulated: !!sres.simulated,
        path: sres.path, photos: queue.length,
      });
      setStep(4);
    } catch (err) {
      alert("Something went wrong: " + err.message);
    } finally { setBusy(false); }
  }

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
            const cur = step > 3 ? 3 : step;
            const c = +n === cur && step <= 3 ? " active" : (+n < cur || step > 3 ? " done" : "");
            return <div key={n} className={"s" + c}><span className="mono">Step {n}</span><span className="lbl">{lbl}</span></div>;
          })}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <section className="card">
            <h2>Report &amp; findings</h2>
            <p className="intro">Mirror the certification report: fill in what you observed. Only the property basics are required — leave anything that doesn't apply blank.</p>

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
                      <button type="button" key={o}
                        className={"chip" + (f[m.id].includes(o) ? " on" : "")}
                        onClick={() => toggle(m.id, o)}>{o}</button>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>

            <fieldset>
              <legend>Sketch &amp; comments</legend>
              <PhotoSlot label="Home sketch (image upload)" sub="Draw the home sketch on paper or a tablet, then upload a photo of it here." items={sketch} onAdd={addSketch} onRemove={() => setSketch([])} max={1} />
              <div className="field" style={{ marginTop: 16 }}><label htmlFor="otherComments">Other comments</label><textarea id="otherComments" value={f.otherComments} onChange={set("otherComments")} /></div>
              <div className="field"><label htmlFor="generalComments">General comments</label><textarea id="generalComments" value={f.generalComments} onChange={set("generalComments")} /></div>
            </fieldset>

            <div className="actions"><span /><button className="btn" onClick={() => { if (validate(["inspectorName", "clientName", "sendReportTo", "date"])) setStep(2); }}>Continue to photos →</button></div>
          </section>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <section className="card">
            <h2>Photos</h2>
            <p className="intro">Upload the pictures listed on the report. Every slot is optional, and you can add <b>as many photos as you need</b> to each one (e.g. all four sides at once). Large photos are resized automatically. Use “Other pictures” for anything extra.</p>
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

        {/* STEP 3 */}
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
                onChange={(e) => setF((s) => ({ ...s, cardnum: e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim() }))} />
              {invalid.cardnum && <div className="err">Enter a 16-digit card number.</div>}</div>
            <div className="row c2">
              <div className={cls("exp")}><label className="req" htmlFor="exp">Expiry</label>
                <input id="exp" value={f.exp} maxLength={7} placeholder="MM / YY"
                  onChange={(e) => { let v = e.target.value.replace(/\D/g, "").slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + " / " + v.slice(2); setF((s) => ({ ...s, exp: v })); }} />
                {invalid.exp && <div className="err">Required.</div>}</div>
              <div className={cls("cvc")}><label className="req" htmlFor="cvc">CVC</label>
                <input id="cvc" value={f.cvc} inputMode="numeric" maxLength={4} placeholder="123"
                  onChange={(e) => setF((s) => ({ ...s, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
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

        {/* SUCCESS */}
        {step === 4 && result && (
          <section className="card">
            <div className="done-wrap">
              <svg className="seal" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#3f7a52" strokeWidth="3" /><circle cx="60" cy="60" r="45" fill="none" stroke="#3f7a52" strokeWidth="1.3" />
                <path d="M44 61l11 11 22-24" stroke="#3f7a52" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2>Submitted &amp; paid</h2>
              <p className="intro" style={{ maxWidth: "44ch", margin: "12px auto 0" }}>Your report is in the engineer's queue. The certificate goes to the email you provided.</p>
              <div className="receipt">
                <div><span>Submission ID</span><span>{result.id}</span></div>
                <div><span>Client</span><span>{f.clientName}</span></div>
                <div><span>Drive folder</span><span>{result.path || "—"}</span></div>
                <div><span>Files uploaded</span><span>{result.photos}</span></div>
                <div><span>Fee paid</span><span>${FEE}.00</span></div>
                <div><span>Drive storage</span><span>{result.simulated ? "simulated (not configured)" : "saved to Google Drive"}</span></div>
              </div>
              <button className="btn ghost" onClick={() => window.location.reload()}>Start another submission</button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
