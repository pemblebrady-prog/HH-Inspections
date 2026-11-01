"use client";
import { useState, useEffect } from "react";
import { SINGLE, MULTI, PHOTO_SLOTS, compress, FEE } from "../lib/formConfig";
import { DEMO_REPORT, isDemoUrl, loadDemoPhoto } from "../lib/demoData";

export function useSubmissionForm(profile) {
  const myCompany = profile && profile.company && !profile.company.is_internal ? profile.company.name : "";
  const [f, setF] = useState({
    date: "", inspectionCompany: myCompany, propertyAddress: "",
    inspectorName: (profile && profile.full_name) || "", clientName: "", sendReportTo: "", ageOfHome: "", lengthFt: "", widthFt: "",
    ...Object.fromEntries(SINGLE.map((s) => [s.id, ""])),
    ...Object.fromEntries(MULTI.map((m) => [m.id, []])),
    generalComments: "",
    cardname: "", cardnum: "", exp: "", cvc: "",
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setVal = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (k, opt) => setF((s) => {
    const cur = s[k]; return { ...s, [k]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
  });

  // Companies for the optional wizard dropdown. Managed separately at /companies.
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((d) => { if (d.ok) setCompanies(d.companies || []); }).catch(() => {});
  }, []);

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

  // Demo mode (?demo=1): one tap fills every field and all photo slots.
  const [demo, setDemo] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  useEffect(() => { setDemo(isDemoUrl()); }, []);
  async function fillDemo() {
    setDemoLoading(true);
    try {
      setF((s) => ({ ...s, ...DEMO_REPORT }));
      setInvalid({});
      const [sk, ...slotPhotos] = await Promise.all([
        loadDemoPhoto("sketch"),
        ...PHOTO_SLOTS.map((slot) => loadDemoPhoto(slot.id)),
      ]);
      setSketch([sk]);
      setPhotos(Object.fromEntries(PHOTO_SLOTS.map((slot, i) => [slot.id, [slotPhotos[i]]])));
    } catch (err) {
      alert("Couldn't load sample photos: " + err.message);
    } finally { setDemoLoading(false); }
  }

  const [invalid, setInvalid] = useState({});
  function validate(fields) {
    const bad = {};
    fields.forEach((k) => {
      const v = String(f[k] || "").trim();
      let isBad = !v;
      if (k === "sendReportTo" && v) isBad = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
      if (k === "cardnum" && v) isBad = v.replace(/\s/g, "").length < 16;
      if (isBad) bad[k] = true;
    });
    setInvalid((prev) => ({ ...prev, ...bad, ...Object.fromEntries(fields.filter((k) => !bad[k]).map((k) => [k, false])) }));
    return Object.keys(bad).length === 0;
  }

  function totalPhotos() {
    return Object.values(photos).reduce((a, arr) => a + arr.length, 0) + sketch.length;
  }

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  async function payAndSubmit() {
    if (!validate(["cardname", "cardnum", "exp", "cvc"])) return false;
    setBusy(true); setProgress(0);
    try {
      const sres = await fetch("/api/submit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(Object.entries(f).filter(([k]) => !["cardname", "cardnum", "exp", "cvc"].includes(k))), demo, photoCount: totalPhotos() }),
      }).then((r) => r.json());
      if (!sres.ok) throw new Error(sres.error || "Submit failed");

      const queue = [];
      sketch.forEach((p) => queue.push({ file: p.file, name: "Home Sketch.jpg", label: "Home Sketch" }));
      PHOTO_SLOTS.forEach((slot) => {
        photos[slot.id].forEach((p, i) => queue.push({ file: p.file, name: `${slot.n} ${slot.label} - ${i + 1}.jpg`, label: slot.label }));
      });

      const uploaded = []; // {id, label} for each photo actually saved to Drive
      for (let i = 0; i < queue.length; i++) {
        const small = await compress(queue[i].file);
        const fd = new FormData();
        if (sres.folderId) fd.append("folderId", sres.folderId);
        fd.append("filename", queue[i].name);
        fd.append("file", small);
        const ures = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
        if (ures && ures.ok && ures.id) uploaded.push({ id: ures.id, label: queue[i].label });
        setProgress(Math.round(((i + 1) / Math.max(queue.length, 1)) * 100));
      }

      // Best-effort draft letter generation — never blocks or fails the submission itself.
      if (sres.folderId && uploaded.length) {
        fetch("/api/letters/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: sres.folderId, report: f, companyName: f.inspectionCompany, images: uploaded }),
        }).catch(() => {});
      }

      // Best-effort payment receipt email — same fire-and-forget pattern.
      if (f.sendReportTo && !demo) {
        fetch("/api/receipts/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: f.sendReportTo, submissionId: sres.submissionId, inspectorName: f.inspectorName,
            clientName: f.clientName, propertyAddress: f.propertyAddress, inspectionDate: f.date,
            amountPaid: Number(FEE),
          }),
        }).catch(() => {});
      }

      setResult({ id: sres.submissionId, simulated: !!sres.simulated, path: sres.path, demo, driveLink: sres.driveLink, clientName: f.clientName, propertyAddress: f.propertyAddress, photos: queue.length });
      return true;
    } catch (err) {
      alert("Something went wrong: " + err.message);
      return false;
    } finally { setBusy(false); }
  }

  return { f, set, setVal, toggle, companies, sketch, addSketch, setSketch, photos, addTo, removeFrom,
    invalid, validate, totalPhotos, busy, progress, result, payAndSubmit, demo, demoLoading, fillDemo, profile };
}
