"use client";
import { useState } from "react";
import SketchBuilder from "./SketchBuilder";

// "Draw the sketch" button for the Home sketch step. The saved drawing becomes the
// Home Sketch photo; its layout is kept in the form (f.sketchData) so it can be edited again.
export default function SketchLauncher({ form }) {
  const [open, setOpen] = useState(false);
  const { f, setVal, addSketch, sketch } = form;
  const drawn = Boolean(f.sketchData && sketch.length);
  return (
    <>
      <div className="sk-launch">
        <button type="button" className="btn" onClick={() => setOpen(true)}>{drawn ? "Edit the drawing" : "Draw the sketch"}</button>
        <span className="hint" style={{ margin: 0 }}>Drag-and-drop boxes and letter tags. Or upload a photo of a hand drawing below.</span>
      </div>
      {open && (
        <SketchBuilder f={f} initial={f.sketchData || null} onClose={() => setOpen(false)}
          onSave={async (file, data) => { await addSketch([file]); setVal("sketchData", data); setOpen(false); }} />
      )}
    </>
  );
}
