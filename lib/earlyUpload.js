// Background photo sending: while the inspector keeps filling in the form, each new
// photo is sent ahead to a private holding folder. On submit those are just moved into
// the job folder (lib/uploadQueue.js), so submitting finishes much faster.
// Best effort: anything not sent ahead is uploaded on submit as before.
import { idbGet, idbSet, idbDel, loadPhoto } from "./offlineStore";

const key = (photoId) => `early:${photoId}`;
const pending = [];        // photo ids waiting to go
const removed = new Set(); // removed before they went
const tries = new Map();    // failures per photo (give up after 5; it uploads on submit)
let running = false;
const listeners = new Set();
const ahead = { sent: new Set(), sending: null };

export const earlyKey = key;
export async function earlyCopy(photoId) { return idbGet(key(photoId)); }   // { id } or undefined
export async function forgetEarly(photoId) { await idbDel(key(photoId)); }

export function onEarlyChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => fn({ sent: new Set(ahead.sent), sending: ahead.sending, waiting: pending.length }));

export function sendAhead(photoId) {
  if (!photoId || pending.includes(photoId)) return;
  pending.push(photoId); emit(); pump();
}

// Photo removed from the form: stop it, or delete the copy that already went.
export async function cancelAhead(photoId) {
  const i = pending.indexOf(photoId);
  if (i >= 0) pending.splice(i, 1);
  removed.add(photoId);
  const e = await idbGet(key(photoId));
  if (e && e.id) {
    await idbDel(key(photoId));
    fetch("/api/upload/early", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id }) }).catch(() => {});
  }
  ahead.sent.delete(photoId); emit();
}

// Note which photos already went ahead (after reopening the app).
export async function markKnown(photoIds) {
  for (const id of photoIds) if (await idbGet(key(id))) ahead.sent.add(id);
  emit();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) { await new Promise((r) => window.addEventListener("online", r, { once: true })); continue; }
      const photoId = pending[0];
      ahead.sending = photoId; emit();
      let ok = false;
      try {
        if (!(await idbGet(key(photoId)))) {
          const file = await loadPhoto(photoId);
          if (file && !removed.has(photoId)) {
            const fd = new FormData(); fd.append("photoId", photoId); fd.append("file", file, "photo.jpg");
            const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
            const d = await fetch("/api/upload/early", { method: "POST", body: fd, signal: ctrl.signal }).then((r) => r.json()).finally(() => clearTimeout(t));
            if (d.ok && d.id && !removed.has(photoId)) { await idbSet(key(photoId), { id: d.id, at: Date.now() }); ahead.sent.add(photoId); }
            else if (d.ok && d.id && removed.has(photoId)) fetch("/api/upload/early", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id }) }).catch(() => {});
            ok = Boolean(d.ok); // off / too large: give up quietly, it uploads on submit
          } else ok = true;
        } else { ahead.sent.add(photoId); ok = true; }
      } catch { ok = false; }
      if (ok) pending.shift();
      else {
        const n = (tries.get(photoId) || 0) + 1; tries.set(photoId, n);
        pending.shift();
        if (n < 5) pending.push(photoId); // try again later, after the others
        await new Promise((r) => setTimeout(r, 10000));
      }
      ahead.sending = null; emit();
    }
  } finally { running = false; }
}
