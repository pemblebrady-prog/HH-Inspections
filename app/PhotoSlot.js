"use client";
import { useRef } from "react";

// One gentle hint per photo, if any (from lib/photoQuality and the smart photo check).
export function photoHint(c) {
  if (!c) return "";
  if (c.dark) return "Looks too dark. Retake with more light if you can.";
  if (c.unusable) return `${c.unusable.replace(/\.$/, "")}. Retake if you can.`;
  if (c.blurry) return "Looks blurry. Retake if you can.";
  if (c.matches === false) return c.shows ? `This photo seems to show ${c.shows.charAt(0).toLowerCase() + c.shows.slice(1).replace(/\.$/, "")}. Is it in the right section?` : "This photo may not fit this section. Is it in the right place?";
  return "";
}

export default function PhotoSlot({ label, sub, items, onAdd, onRemove, max, big, checks, sent, children }) {
  const ref = useRef(null);
  const atMax = max && items.length >= max;
  return (
    <div className={"slot" + (big ? " big" : "")}>
      <div className="slot-head">
        <span className="slot-label">{label}</span>
        <span className="slot-count">{items.length ? `${items.length} added` : "optional"}</span>
      </div>
      {sub && <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{sub}</div>}
      {!atMax && (
        <div className={"drop" + (big ? "" : " sm")} tabIndex={0} role="button"
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
          {items.map((p, i) => {
            const hint = photoHint(checks && checks[p.id]);
            return (
              <div className={"thumb" + (hint ? " warn" : "")} key={i}>
                <img src={p.url} alt={label + " " + (i + 1)} />
                {hint && <span className="thumb-flag" aria-hidden="true">!</span>}
                {sent && sent.has(p.id) && <span className="thumb-sent" title="Already sent">✓</span>}
                <button aria-label="Remove" onClick={() => onRemove(i)}>×</button>
              </div>
            );
          })}
        </div>
      )}
      {checks && items.some((p) => photoHint(checks[p.id])) && (
        <ul className="photo-hints">
          {items.map((p, i) => { const h = photoHint(checks[p.id]); return h ? <li key={p.id}><b>Photo {i + 1}:</b> {h}</li> : null; })}
        </ul>
      )}
      {checks && items.some((p) => checks[p.id] && checks[p.id].checking) && <p className="hint" style={{ marginTop: 6 }}>Checking photos…</p>}
      {children}
    </div>
  );
}
