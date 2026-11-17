"use client";
import { useState } from "react";
import SketchBuilder from "./SketchBuilder";

// The Home sketch step. Drawing in the app comes first (big button); uploading a photo of a
// hand drawing is a secondary option, shown on request or once a sketch exists.
// children = the Home sketch photo slot. The drawing's layout is kept in f.sketchData so it can be edited again.
export default function SketchLauncher({ form, children }) {
  const [open, setOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const { f, setVal, addSketch, sketch } = form;
  const drawn = Boolean(f.sketchData && sketch.length);
  const hasSketch = sketch.length > 0;
  return (
    <>
      <button type="button" className="sk-launch-big" onClick={() => setOpen(true)}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1.6" /><rect x="16" y="9" width="5" height="6" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 1.5" /><path d="M6 18h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><text x="8" y="12.5" fontSize="5" fill="currentColor" fontFamily="Arial" fontWeight="700">B</text></svg>
        <span><b>{drawn ? "Edit the drawing" : "Draw the sketch"}</b>
          <small>{drawn ? "Your drawing is saved. Tap to change it." : "Tap here to lay out the home, porches and letter tags. It's drawn to scale for you."}</small></span>
      </button>
      {hasSketch || showUpload ? children : (
        <button type="button" className="linklike" style={{ margin: "2px 0 14px" }} onClick={() => setShowUpload(true)}>Prefer paper? Upload a photo of a hand drawing instead</button>
      )}
      {open && (
        <SketchBuilder f={f} initial={f.sketchData || null} onClose={() => setOpen(false)}
          onHome={(patch) => Object.entries(patch).forEach(([k, v]) => setVal(k, v))}
          onSave={async (file, data) => { await addSketch([file]); setVal("sketchData", data); setOpen(false); }} />
      )}
    </>
  );
}
