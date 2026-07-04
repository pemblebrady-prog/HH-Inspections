"use client";
import { useState, useRef } from "react";

const FEE = process.env.NEXT_PUBLIC_CERT_FEE || "135";
const MIN_PHOTOS = 4;

// Compress an image file to a max dimension / JPEG quality so uploads stay
// small (fast, and safely under Vercel's request size limit). Falls back to
// the original file if anything goes wrong.
async function compress(file, maxDim = 1600, quality = 0.7) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    const base = (file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], base + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function Page() {
  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState([]); // {file, url}
  const [invalid, setInvalid] = useState({});
  const [minMsg, setMinMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const [f, setF] = useState({
    addr: "", city: "", state: "AZ", zip: "", date: "", loan: "FHA",
    iname: "", icompany: "", iemail: "", iphone: "", notes: "",
    c1: false, c2: false, c3: false, c4: false, c5: false, c6: false,
    cardname: "", cardnum: "", exp: "", cvc: "",
  });
  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setF((s) => ({ ...s, [k]: v }));
  };

  function validate(fields) {
    const bad = {};
    fields.forEach((k) => {
      const v = String(f[k] || "").trim();
      let isBad = !v;
      if (k === "iemail" && v) isBad = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
      if (k === "cardnum" && v) isBad = v.replace(/\s/g, "").length < 16;
      if (isBad) bad[k] = true;
    });
    setInvalid(bad);
    return Object.keys(bad).length === 0;
  }

  function addFiles(list) {
    const next = [];
    Array.from(list).forEach((file) => {
      if (file.type.startsWith("image/")) next.push({ file, url: URL.createObjectURL(file) });
    });
    setPhotos((p) => [...p, ...next]);
  }
  function removePhoto(i) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  function goPhotos() {
    if (validate(["addr", "city", "zip", "date", "iname", "iemail"])) setStep(2);
  }
  function goPay() {
    if (photos.length < MIN_PHOTOS) { setMinMsg(`Add at least ${MIN_PHOTOS}`); return; }
    setMinMsg(""); setStep(3);
  }

  async function payAndSubmit() {
    if (!validate(["cardname", "cardnum", "exp", "cvc"])) return; // fields required, but payment always "passes"
    setBusy(true); setProgress(0);
    try {
      // 1) Create the Address/Date folder + metadata (or simulate if Drive unset)
      const meta = {
        address: f.addr, city: f.city, state: f.state, zip: f.zip, date: f.date, loan: f.loan,
        iname: f.iname, icompany: f.icompany, iemail: f.iemail, iphone: f.iphone, notes: f.notes,
        checklist: {
          tieDowns: f.c1, piersFootings: f.c2, dataPlate: f.c3,
          drainage: f.c4, skirting: f.c5, additions: f.c6,
        },
      };
      const sres = await fetch("/api/submit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta),
      }).then((r) => r.json());
      if (!sres.ok) throw new Error(sres.error || "Submit failed");

      // 2) Upload each photo (compressed). Real if folderId present; simulated otherwise.
      for (let i = 0; i < photos.length; i++) {
        const small = await compress(photos[i].file);
        const fd = new FormData();
        if (sres.folderId) fd.append("folderId", sres.folderId);
        fd.append("file", small);
        await fetch("/api/upload", { method: "POST", body: fd }).catch(() => {});
        setProgress(Math.round(((i + 1) / photos.length) * 100));
      }

      setResult({
        id: sres.submissionId,
        simulated: !!sres.simulated,
        property: [f.addr, f.city].filter(Boolean).join(", "),
        inspector: f.iname,
        photos: photos.length,
      });
      setStep(4);
    } catch (err) {
      alert("Something went wrong: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]); setResult(null); setProgress(0); setInvalid({});
    setF({ addr: "", city: "", state: "AZ", zip: "", date: "", loan: "FHA",
      iname: "", icompany: "", iemail: "", iphone: "", notes: "",
      c1: false, c2: false, c3: false, c4: false, c5: false, c6: false,
      cardname: "", cardnum: "", exp: "", cvc: "" });
    setStep(1);
  }

  const cls = (k) => "field" + (invalid[k] ? " invalid" : "");

  return (
    <>
      <div className="demo">Live prototype — payment is stubbed (always passes) · photos save to Google Drive when configured</div>
      <header>
        <div className="bar">
          <a className="brand" href="#"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspector Portal</span></a>
          <div className="who"><span className="mono">Cert submission</span></div>
        </div>
      </header>

      <div className="shell">
        <div className="stepper" aria-hidden="true">
          {[["1", "Property & checklist"], ["2", "Photos"], ["3", "Pay & submit"]].map(([n, lbl]) => {
            const cur = step > 3 ? 3 : step;
            const c = +n === cur && step <= 3 ? " active" : (+n < cur || step > 3 ? " done" : "");
            return <div key={n} className={"s" + c}><span className="mono">Step {n}</span><span className="lbl">{lbl}</span></div>;
          })}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <section className="card">
            <h2>Property &amp; inspection details</h2>
            <p className="intro">Tell us where the home is and what you found. The engineer uses this alongside your photos to write the certification letter.</p>

            <fieldset>
              <legend>Property</legend>
              <div className={cls("addr")}>
                <label className="req" htmlFor="addr">Street address</label>
                <input id="addr" value={f.addr} onChange={set("addr")} placeholder="4820 E Speedway Blvd" />
                {invalid.addr && <div className="err">Enter the property street address.</div>}
              </div>
              <div className="row c3">
                <div className={cls("city")}>
                  <label className="req" htmlFor="city">City</label>
                  <input id="city" value={f.city} onChange={set("city")} placeholder="Tucson" />
                  {invalid.city && <div className="err">Required.</div>}
                </div>
                <div className="field">
                  <label htmlFor="state">State</label>
                  <input id="state" value={f.state} onChange={set("state")} />
                </div>
                <div className={cls("zip")}>
                  <label className="req" htmlFor="zip">ZIP</label>
                  <input id="zip" value={f.zip} onChange={set("zip")} inputMode="numeric" placeholder="85712" />
                  {invalid.zip && <div className="err">Required.</div>}
                </div>
              </div>
              <div className="row c2">
                <div className={cls("date")}>
                  <label className="req" htmlFor="date">Date inspected</label>
                  <input id="date" type="date" value={f.date} onChange={set("date")} />
                  {invalid.date && <div className="err">Required.</div>}
                </div>
                <div className="field">
                  <label htmlFor="loan">Loan type</label>
                  <select id="loan" value={f.loan} onChange={set("loan")}>
                    <option>FHA</option><option>VA</option><option>USDA</option><option>Conventional</option><option>Not sure</option>
                  </select>
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Submitting inspector</legend>
              <div className="row c2">
                <div className={cls("iname")}>
                  <label className="req" htmlFor="iname">Your name</label>
                  <input id="iname" value={f.iname} onChange={set("iname")} placeholder="Full name" />
                  {invalid.iname && <div className="err">Required.</div>}
                </div>
                <div className="field">
                  <label htmlFor="icompany">Company</label>
                  <input id="icompany" value={f.icompany} onChange={set("icompany")} placeholder="Inspection company" />
                </div>
              </div>
              <div className="row c2">
                <div className={cls("iemail")}>
                  <label className="req" htmlFor="iemail">Email for the certificate</label>
                  <input id="iemail" type="email" value={f.iemail} onChange={set("iemail")} placeholder="you@company.com" />
                  {invalid.iemail && <div className="err">Enter a valid email.</div>}
                </div>
                <div className="field">
                  <label htmlFor="iphone">Phone</label>
                  <input id="iphone" value={f.iphone} onChange={set("iphone")} placeholder="(520) 555-0100" />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Foundation checklist</legend>
              <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>Check what applies. This is a starting checklist — swap in the exact fields your engineer needs.</p>
              {[
                ["c1", "Tie-downs / anchors present and intact", "straps connect frame to ground anchors"],
                ["c2", "Piers & footings look adequate", "sized and placed to carry the load"],
                ["c3", "HUD data plate / certification label located", ""],
                ["c4", "Grading & drainage direct water away from home", ""],
                ["c5", "Skirting / perimeter enclosure in place", ""],
                ["c6", "Additions present (deck, porch, room)", "note in comments if so"],
              ].map(([k, label, sub]) => (
                <div className="checkrow" key={k}>
                  <input type="checkbox" id={k} checked={f[k]} onChange={set(k)} />
                  <label htmlFor={k}>{label}{sub && <span className="sub"> — {sub}</span>}</label>
                </div>
              ))}
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="notes">Inspector comments</label>
                <textarea id="notes" value={f.notes} onChange={set("notes")} placeholder="Anything the engineer should know — access issues, visible concerns, missing components…" />
              </div>
            </fieldset>

            <div className="actions"><span /><button className="btn" onClick={goPhotos}>Continue to photos →</button></div>
          </section>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <section className="card">
            <h2>Upload your photos</h2>
            <p className="intro">Add the foundation, anchoring, pier, data plate, and any problem-area photos. A minimum of {MIN_PHOTOS} keeps the engineer from bouncing it back. Large photos are automatically resized before upload.</p>

            <div className="drop" tabIndex={0} role="button" aria-label="Add photos"
              onClick={() => fileRef.current.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current.click(); } }}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("drag")}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag"); addFiles(e.dataTransfer.files); }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="#2C6E8C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 20h14" stroke="#2C6E8C" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <p style={{ margin: "12px 0 4px" }}><b>Tap to add photos</b> or drag them here</p>
              <p className="hint" style={{ margin: 0 }}>JPG or PNG · phone photos are fine</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

            <div className="thumbs">
              {photos.map((p, i) => (
                <div className="thumb" key={i}>
                  <img src={p.url} alt={`submission photo ${i + 1}`} />
                  <button aria-label="Remove photo" onClick={() => removePhoto(i)}>×</button>
                </div>
              ))}
            </div>
            <div className="countbar">
              <span>{photos.length} photo{photos.length === 1 ? "" : "s"} added</span>
              <span style={{ color: "var(--err)" }}>{minMsg}</span>
            </div>

            <div className="actions">
              <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn" onClick={goPay}>Continue to payment →</button>
            </div>
          </section>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <section className="card">
            <h2>Pay &amp; submit</h2>
            <p className="intro">The ${FEE} certification fee is due at submission. Your photos and details are sent to the engineer the moment payment clears.</p>

            <div className="summary">
              <div><div className="mono" style={{ color: "#9FD4E8" }}>Certification fee</div><small>{[f.addr, f.city].filter(Boolean).join(", ") || "—"}</small></div>
              <div className="amt">${FEE}.00</div>
            </div>

            <div className={cls("cardname")}>
              <label className="req" htmlFor="cardname">Name on card</label>
              <input id="cardname" value={f.cardname} onChange={set("cardname")} placeholder="Full name" />
              {invalid.cardname && <div className="err">Required.</div>}
            </div>
            <div className={cls("cardnum")}>
              <label className="req" htmlFor="cardnum">Card number</label>
              <input id="cardnum" value={f.cardnum} inputMode="numeric" maxLength={19} placeholder="4242 4242 4242 4242"
                onChange={(e) => setF((s) => ({ ...s, cardnum: e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim() }))} />
              {invalid.cardnum && <div className="err">Enter a 16-digit card number.</div>}
            </div>
            <div className="row c2">
              <div className={cls("exp")}>
                <label className="req" htmlFor="exp">Expiry</label>
                <input id="exp" value={f.exp} maxLength={7} placeholder="MM / YY"
                  onChange={(e) => { let v = e.target.value.replace(/\D/g, "").slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + " / " + v.slice(2); setF((s) => ({ ...s, exp: v })); }} />
                {invalid.exp && <div className="err">Required.</div>}
              </div>
              <div className={cls("cvc")}>
                <label className="req" htmlFor="cvc">CVC</label>
                <input id="cvc" value={f.cvc} inputMode="numeric" maxLength={4} placeholder="123"
                  onChange={(e) => setF((s) => ({ ...s, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                {invalid.cvc && <div className="err">Required.</div>}
              </div>
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
                <circle cx="60" cy="60" r="54" fill="none" stroke="#3f7a52" strokeWidth="3" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#3f7a52" strokeWidth="1.3" />
                <path d="M44 61l11 11 22-24" stroke="#3f7a52" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2>Submitted &amp; paid</h2>
              <p className="intro" style={{ maxWidth: "44ch", margin: "12px auto 0" }}>
                Your submission is in the engineer's queue. You'll get the certification letter by email at the address you provided.
              </p>
              <div className="receipt">
                <div><span>Submission ID</span><span>{result.id}</span></div>
                <div><span>Property</span><span>{result.property}</span></div>
                <div><span>Inspector</span><span>{result.inspector}</span></div>
                <div><span>Photos</span><span>{result.photos}</span></div>
                <div><span>Fee paid</span><span>${FEE}.00</span></div>
                <div><span>Drive storage</span><span>{result.simulated ? "simulated (not configured)" : "saved to Google Drive"}</span></div>
              </div>
              <button className="btn ghost" onClick={restart}>Start another submission</button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
