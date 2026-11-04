"use client";
import { useState, useEffect, useRef } from "react";
import { SINGLE, MULTI, DETAILS, PHOTO_SLOTS, compress } from "../lib/formConfig";
import { DEMO_REPORT, isDemoUrl, loadDemoPhoto } from "../lib/demoData";
import { idbGet, idbSet, idbDel, savePhoto, loadPhoto, deletePhoto, newId } from "../lib/offlineStore";
import { runQueue, unfinishedQueues, queueKey } from "../lib/uploadQueue";

const DRAFT_KEY = "draft";
const emptyPhotos = () => Object.fromEntries(PHOTO_SLOTS.map((s) => [s.id, []]));

export function useSubmissionForm(profile) {
  const myCompany = profile && profile.company && !profile.company.is_internal ? profile.company.name : "";
  const blank = () => ({
    date: "", inspectionCompany: myCompany, propertyAddress: "",
    inspectorName: (profile && profile.full_name) || "", clientName: "", sendReportTo: (profile && profile.default_report_email) || "", ageOfHome: "", lengthFt: "", widthFt: "",
    ...Object.fromEntries(SINGLE.map((s) => [s.id, ""])),
    ...Object.fromEntries(MULTI.map((m) => [m.id, []])),
    ...Object.fromEntries(DETAILS.map((d) => [d.id, ""])),
    generalComments: "",
  });
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setVal = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (k, opt) => setF((s) => {
    const cur = s[k]; return { ...s, [k]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
  });

  // Companies for the optional dropdown.
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((d) => { if (d.ok) setCompanies(d.companies || []); }).catch(() => {});
  }, []);

  // Photos: each is { id, file, url }. Shrunk on the phone and saved locally as soon as it's added.
  const [sketch, setSketch] = useState([]);
  const [photos, setPhotos] = useState(emptyPhotos);
  async function prepare(file) {
    const small = await compress(file);
    const id = newId();
    await savePhoto(id, small);
    return { id, file: small, url: URL.createObjectURL(small) };
  }
  const addTo = (slotId) => async (list) => {
    const files = Array.from(list).filter((x) => x.type.startsWith("image/"));
    const next = [];
    for (const file of files) next.push(await prepare(file));
    setPhotos((p) => ({ ...p, [slotId]: [...p[slotId], ...next] }));
  };
  const removeFrom = (slotId) => (i) => setPhotos((p) => {
    const gone = p[slotId][i]; if (gone) deletePhoto(gone.id);
    return { ...p, [slotId]: p[slotId].filter((_, idx) => idx !== i) };
  });
  const addSketch = async (list) => {
    const one = Array.from(list).find((x) => x.type.startsWith("image/"));
    if (!one) return;
    sketch.forEach((s) => deletePhoto(s.id));
    setSketch([await prepare(one)]);
  };
  const clearSketch = () => { sketch.forEach((s) => deletePhoto(s.id)); setSketch([]); };

  // ---------- Draft: autosave and restore ----------
  const loaded = useRef(false);
  const [restoredAt, setRestoredAt] = useState(null);
  const [orderInfo, setOrderInfo] = useState(null); // the order this job came from
  const [resuming, setResuming] = useState(null); // unfinished upload found on open

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // An unfinished upload takes priority: finish sending it.
      const pending = await unfinishedQueues();
      if (cancelled) return;
      if (pending.length) { loaded.current = true; resumeUpload(pending[0]); return; }

      // Opened from an assigned order (/?order=<id>): start a fresh job pre-filled from it.
      const orderId = new URLSearchParams(window.location.search).get("order");
      if (orderId) {
        try {
          const d = await fetch(`/api/orders/prefill?id=${encodeURIComponent(orderId)}`).then((r) => r.json());
          if (!cancelled && d.ok) {
            setF((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(d.prefill).filter(([, val]) => val !== "")) }));
            setOrderInfo(d.info);
          }
        } catch { /* fall through to a blank form */ }
        loaded.current = true;
        return;
      }
      const d = await idbGet(DRAFT_KEY);
      if (cancelled) return;
      if (d && d.f) {
        const loadList = async (list) => {
          const out = [];
          for (const m of list || []) { const file = await loadPhoto(m.id); if (file) out.push({ id: m.id, file, url: URL.createObjectURL(file) }); }
          return out;
        };
        const p = emptyPhotos();
        for (const slot of PHOTO_SLOTS) p[slot.id] = await loadList(d.photos && d.photos[slot.id]);
        const sk = await loadList(d.sketch);
        if (cancelled) return;
        const hasContent = (d.f.propertyAddress || d.f.clientName) || sk.length || Object.values(p).some((a) => a.length);
        if (hasContent) {
          setF((cur) => ({ ...cur, ...d.f })); setPhotos(p); setSketch(sk); setRestoredAt(d.savedAt || Date.now());
        }
      }
      loaded.current = true;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save a second after any change (photos are already stored; this saves the list + fields).
  useEffect(() => {
    if (!loaded.current || resuming) return;
    const t = setTimeout(() => {
      const meta = (arr) => arr.map((x) => ({ id: x.id }));
      idbSet(DRAFT_KEY, { v: 1, f, photos: Object.fromEntries(PHOTO_SLOTS.map((s) => [s.id, meta(photos[s.id])])), sketch: meta(sketch), savedAt: Date.now() });
    }, 1000);
    return () => clearTimeout(t);
  }, [f, photos, sketch, resuming]);

  async function startOver() {
    Object.values(photos).flat().concat(sketch).forEach((x) => deletePhoto(x.id));
    await idbDel(DRAFT_KEY);
    window.location.reload();
  }

  // ---------- Demo mode ----------
  const [demo, setDemo] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  useEffect(() => { setDemo(isDemoUrl()); }, []);
  async function fillDemo() {
    setDemoLoading(true);
    try {
      setF((s) => ({ ...s, ...DEMO_REPORT }));
      setInvalid({});
      const sk = await prepare((await loadDemoPhoto("sketch")).file);
      const p = emptyPhotos();
      for (const slot of PHOTO_SLOTS) p[slot.id] = [await prepare((await loadDemoPhoto(slot.id)).file)];
      setSketch([sk]); setPhotos(p);
    } catch (err) {
      alert("Couldn't load sample photos: " + err.message);
    } finally { setDemoLoading(false); }
  }

  // ---------- Validation ----------
  const [invalid, setInvalid] = useState({});
  function validate(fields) {
    const bad = {};
    fields.forEach((k) => {
      const v = String(f[k] || "").trim();
      let isBad = !v;
      if (k === "sendReportTo" && v) isBad = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
      if (isBad) bad[k] = true;
    });
    setInvalid((prev) => ({ ...prev, ...bad, ...Object.fromEntries(fields.filter((k) => !bad[k]).map((k) => [k, false])) }));
    return Object.keys(bad).length === 0;
  }
  function totalPhotos() {
    return Object.values(photos).reduce((a, arr) => a + arr.length, 0) + sketch.length;
  }

  // ---------- Sending ----------
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upload, setUpload] = useState(null); // live status from the queue
  const [result, setResult] = useState(null);

  function onProgress(st) {
    setUpload(st);
    const steps = st.total + 2; // create + photos + finalize
    const doneSteps = (st.phase === "creating" ? 0 : 1) + st.done + (st.phase === "done" ? 1 : 0);
    setProgress(Math.round((doneSteps / steps) * 100));
  }

  async function finish(q, r) {
    if (r.ok) {
      setResult({ id: r.ref, simulated: r.simulated, demo: q.demo, driveLink: r.driveLink, clientName: q.report.clientName,
        propertyAddress: q.report.propertyAddress, photos: r.photos, onHold: r.status === "on_hold", payment: r.payment_status });
    }
    setBusy(false);
  }

  async function resumeUpload(q) {
    setResuming({ address: q.report.propertyAddress, client: q.report.clientName, total: q.items.length });
    setBusy(true);
    const r = await runQueue(q, onProgress);
    await finish(q, r);
  }

  async function retryUpload() {
    const pending = await unfinishedQueues();
    if (pending.length) await resumeUpload(pending[0]);
  }

  async function payAndSubmit() {
    setBusy(true); setProgress(0); setUpload(null);
    const items = [];
    sketch.forEach((p) => items.push({ photoId: p.id, name: "Home Sketch.jpg", label: "Home Sketch", slot: "sketch", done: false }));
    PHOTO_SLOTS.forEach((slot) => {
      photos[slot.id].forEach((p, i) => items.push({ photoId: p.id, name: `${slot.n} ${slot.label} - ${i + 1}.jpg`, label: slot.label, slot: slot.id, done: false }));
    });
    const q = { clientId: newId(), createdAt: Date.now(), report: { ...f }, demo, items, ref: null, finished: false };
    const stored = await idbSet(queueKey(q.clientId), q);
    if (stored) await idbDel(DRAFT_KEY); // the queue now owns the photos
    const r = await runQueue(q, onProgress);
    await finish(q, r);
    return r.ok;
  }

  return { f, set, setVal, toggle, companies, sketch, addSketch, setSketch: clearSketch, photos, addTo, removeFrom,
    invalid, validate, totalPhotos, busy, progress, upload, result, payAndSubmit, demo, demoLoading, fillDemo, profile,
    restoredAt, startOver, resuming, retryUpload, orderInfo };
}
