"use client";
import { useRef } from "react";

export default function PhotoSlot({ label, sub, items, onAdd, onRemove, max, big }) {
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
          {items.map((p, i) => (
            <div className="thumb" key={i}>
              <img src={p.url} alt={label + " " + (i + 1)} />
              <button aria-label="Remove" onClick={() => onRemove(i)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
