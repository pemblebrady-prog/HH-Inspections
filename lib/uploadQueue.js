// Sends a submission from the phone reliably: creates it once, uploads each
// photo with retries (waiting for signal when offline), then finalizes.
// Progress is saved after every step so it can resume when the app reopens.
import { idbGet, idbSet, idbDel, idbKeys, loadPhoto, deletePhoto } from "./offlineStore";

const DELAYS = [2, 4, 8, 15, 30, 60]; // seconds between retries
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForOnline() {
  if (typeof navigator === "undefined" || navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener("online", done); clearInterval(t); resolve(); };
    window.addEventListener("online", done);
    const t = setInterval(() => { if (navigator.onLine) done(); }, 5000);
  });
}

class Permanent extends Error {}
class SignedOut extends Error {}

// Run a request until it succeeds; network trouble and server hiccups are retried.
async function persist(doRequest, report) {
  for (let attempt = 0; ; attempt++) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      report({ waiting: true });
      await waitForOnline();
      report({ waiting: false });
    }
    let res, data;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      res = await doRequest(ctrl.signal);
      clearTimeout(timer);
      data = await res.json().catch(() => ({}));
    } catch {
      res = null; // network error or timeout
    }
    if (res && res.ok && data.ok !== false) return data;
    if (res && res.status === 401) throw new SignedOut("signed out");
    if (res && res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)) {
      throw new Permanent((data && data.error) || `Request failed (${res.status})`);
    }
    const wait = DELAYS[Math.min(attempt, DELAYS.length - 1)];
    for (let s = wait; s > 0; s--) { report({ retryIn: s }); await sleep(1000); if (!navigator.onLine) break; }
    report({ retryIn: 0 });
  }
}

export const queueKey = (clientId) => `queue:${clientId}`;

export async function unfinishedQueues() {
  const keys = await idbKeys("queue:");
  const out = [];
  for (const k of keys) { const q = await idbGet(k); if (q && !q.finished) out.push(q); }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

// onProgress({ phase, done, total, waiting, retryIn, error })
export async function runQueue(q, onProgress) {
  const save = () => idbSet(queueKey(q.clientId), q);
  const total = q.items.length;
  const state = { phase: "creating", done: q.items.filter((i) => i.done).length, total, waiting: false, retryIn: 0 };
  const report = (patch) => { Object.assign(state, patch); onProgress({ ...state }); };
  report({});

  try {
    // 1) Create the submission (once).
    if (!q.ref) {
      const d = await persist((signal) => fetch("/api/submit", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ ...q.report, demo: q.demo, clientId: q.clientId, photoCount: total }),
      }), report);
      q.ref = d.submissionId; q.folderId = d.folderId || null; q.driveLink = d.driveLink || null; q.simulated = Boolean(d.simulated);
      await save();
    }

    // 2) Upload each photo that hasn't made it yet.
    report({ phase: "uploading" });
    for (const item of q.items) {
      if (item.done) continue;
      const file = await loadPhoto(item.photoId);
      if (!file) { item.done = true; item.missing = true; await save(); report({ done: state.done + 1 }); continue; }
      const d = await persist((signal) => {
        const fd = new FormData();
        if (q.folderId) fd.append("folderId", q.folderId);
        fd.append("filename", item.name);
        fd.append("file", file);
        return fetch("/api/upload", { method: "POST", body: fd, signal });
      }, report);
      item.done = true; item.driveId = d.id || null;
      await save();
      report({ done: state.done + 1 });
    }

    // 3) Finalize: charge, notify the office, build the letter.
    report({ phase: "finalizing" });
    const images = q.items.filter((i) => i.driveId).map((i) => ({ id: i.driveId, label: i.label, slot: i.slot }));
    const fin = await persist((signal) => fetch("/api/submit/finalize", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ ref: q.ref, images }),
    }), report);

    // 4) Clean up the phone.
    q.finished = true;
    for (const item of q.items) await deletePhoto(item.photoId);
    await idbDel(queueKey(q.clientId));
    report({ phase: "done" });
    return { ok: true, ref: q.ref, driveLink: q.driveLink, simulated: q.simulated, status: fin.status, payment_status: fin.payment_status, photos: total };
  } catch (err) {
    const signedOut = err instanceof SignedOut;
    report({ phase: "error", error: signedOut ? "signed-out" : err.message });
    return { ok: false, signedOut, error: err.message };
  }
}
