"use client";
import { useRef, useState, useEffect } from "react";
import { photoHint } from "./PhotoSlot";

// All the job's photos in one place (Brady & Brian, Nov 24): one "Upload pictures" button that picks many at
// once (phone photo library, or files on a computer), a "Take photo" button that opens the camera, then
// "Take another" to keep going, and drag-and-drop on a computer. No sections: the engineer sorts them on review.
export default function PhotoUploader({ items, onAdd, onRemove, checks, sent, adding }) {
  const pick = useRef(null);
  const cam = useRef(null);
  const [fromCamera, setFromCamera] = useState(false);
  const [drag, setDrag] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    try {
      setTouch(window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || "ontouchstart" in window
        || /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || ""));
    } catch { /* old browser */ }
  }, []);

  const add = (files, camera) => { if (files && files.length) { onAdd(files); setFromCamera(Boolean(camera)); } };
  const hints = checks ? items.map((p, i) => [i, photoHint(checks[p.id])]).filter(([, h]) => h) : [];

  return (
    <div className="uploader">
      <div className={"upzone" + (drag ? " drag" : "")}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files, false); }}>
        <div className="upzone-btns">
          <button type="button" className="btn" onClick={() => pick.current.click()} disabled={adding}>Upload pictures</button>
          {touch && <button type="button" className="btn ghost" onClick={() => cam.current.click()} disabled={adding}>Take photo</button>}
        </div>
        <p className="hint" style={{ margin: "10px 0 0" }}>
          {touch ? "Pick as many as you like from your photos at once, or take them with the camera." : "Select as many photos as you like at once, or drag them here."}
        </p>
      </div>
      <input ref={pick} type="file" accept="image/*,.heic,.heif" multiple style={{ display: "none" }} aria-label="Upload pictures"
        onChange={(e) => { add(e.target.files, false); e.target.value = ""; }} />
      <input ref={cam} type="file" accept="image/*" capture="environment" style={{ display: "none" }} aria-label="Take photo"
        onChange={(e) => { add(e.target.files, true); e.target.value = ""; }} />

      {adding && <p className="hint" style={{ marginTop: 10 }}>Adding photos…</p>}
      {fromCamera && !adding && (
        <button type="button" className="btn take-another" onClick={() => cam.current.click()}>📷 Take another</button>
      )}

      <div className="slot-head" style={{ marginTop: 16 }}>
        <span className="slot-label">Photos</span>
        <span className="slot-count">{items.length ? `${items.length} added` : "none yet"}</span>
      </div>
      {items.length > 0 && (
        <div className="thumbs">
          {items.map((p, i) => {
            const hint = photoHint(checks && checks[p.id]);
            return (
              <div className={"thumb" + (hint ? " warn" : "")} key={p.id}>
                <img src={p.url} alt={`Photo ${i + 1}`} />
                {hint && <span className="thumb-flag" aria-hidden="true">!</span>}
                {sent && sent.has(p.id) && <span className="thumb-sent" title="Already sent">✓</span>}
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onRemove(i)}>×</button>
              </div>
            );
          })}
        </div>
      )}
      {hints.length > 0 && <ul className="photo-hints">{hints.map(([i, h]) => <li key={i}><b>Photo {i + 1}:</b> {h}</li>)}</ul>}
    </div>
  );
}
