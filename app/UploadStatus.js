"use client";

// Live status of the upload queue, written for someone standing in a field with one bar.
export default function UploadStatus({ form }) {
  const u = form.upload;
  if (!u) return null;
  const left = Math.max(0, (u.total || 0) - (u.done || 0));
  const photosLeft = `${left} photo${left === 1 ? "" : "s"} left`;

  if (u.phase === "error") {
    if (u.error === "signed-out") {
      return <div className="up-status warn"><b>You were signed out.</b> Your photos are saved on this phone. <a href="/login?next=/">Sign in again</a> and the upload picks up where it left off.</div>;
    }
    return (
      <div className="up-status warn">
        <b>Couldn't finish sending.</b> {u.error} Your photos are saved on this phone.
        <div><button className="btn ghost" type="button" onClick={form.retryUpload}>Try again</button></div>
      </div>
    );
  }
  if (u.waiting) {
    return <div className="up-status wait"><b>No signal: waiting to reconnect.</b> {photosLeft}. Everything is saved on this phone, so you can close the app; it finishes the next time you open the portal.</div>;
  }
  if (u.retryIn) {
    return <div className="up-status wait"><b>Connection dropped.</b> Trying again in {u.retryIn}s… ({photosLeft})</div>;
  }
  const text = {
    creating: "Starting your submission…",
    uploading: `Uploading photos: ${u.done} of ${u.total}`,
    finalizing: "Finishing up…",
    done: "Done!",
  }[u.phase] || "";
  return <div className="up-status">{text}</div>;
}
