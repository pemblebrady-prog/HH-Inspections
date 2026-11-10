"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// Drag-and-drop home sketch: the home is drawn from the length/width already entered,
// the inspector adds porches/additions, drags letter tags from the key, sets north and
// the street, and saves it as the "Home Sketch" image (with measurements and the key).

export const TAGS = [
  ["A", "Entry Access", "k"], ["T", "Tie Down", "k"], ["C", "Cert. Label", "k"], ["AS", "Attached St.", "k"],
  ["P", "Pier", "r"], ["B", "Beam", "r"], ["R", "Railing", "r"], ["S", "Stairs", "r"], ["W", "Wood", "r"],
  ["K", "Skirting", "r"], ["M", "Belly Wrap", "r"], ["I", "Insulation", "r"], ["D", "Drainage", "r"],
  ["N", "No Access", "r"], ["V", "Vents", "r"],
];
const INK = "#1d2a33", RED = "#b3261e", FILL = "#cfe0ea", FILL2 = "#dfeaf0";
const SIDES = [["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]];
const num = (v, d) => { const n = parseFloat(String(v || "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : d; };
const ft = (n) => `${Math.round(n * 10) / 10}'`;
const uid = () => Math.random().toString(36).slice(2, 9);
// Typical sizes by home type, used until the real length and width are entered.
export const TYPICAL = { single: [76, 16], double: [60, 28], triple: [60, 42] };
const kind = (homeType) => (/triple/i.test(homeType || "") ? "triple" : /double/i.test(homeType || "") ? "double" : /single/i.test(homeType || "") ? "single" : "");
const typeLabel = (homeType) => ({ single: "SINGLE-WIDE", double: "DOUBLE-WIDE", triple: "TRIPLE-WIDE" }[kind(homeType)] || "MANUFACTURED HOME");
const BLANK = { structures: [], tags: [], north: 0, street: { name: "", side: "right" } };

// World layout (all in feet).
function layout(f, data) {
  const [dl, dw] = TYPICAL[kind(f.homeType)] || [64, 28];
  const L = Math.min(num(f.lengthFt, dl), 200), Wd = Math.min(num(f.widthFt, dw), 80);
  const reach = Math.max(10, ...data.structures.map((s) => s.depth + 4));
  const W = Math.max(84, L + 2 * reach + 26);
  const H = Math.max(Wd + 2 * reach + 22, W * 0.62);
  const home = { x: (W - L) / 2 - 3, y: (H - Wd) / 2, w: L, h: Wd };
  return { W, H, home, tag: Math.max(3.5, W / 24) };
}

// A structure's rectangle in world feet.
function structRect(home, s) {
  const { x, y, w, h } = home;
  if (s.side === "top") return { x: x + s.offset, y: y - s.depth, w: s.along, h: s.depth };
  if (s.side === "bottom") return { x: x + s.offset, y: y + h, w: s.along, h: s.depth };
  if (s.side === "left") return { x: x - s.depth, y: y + s.offset, w: s.depth, h: s.along };
  return { x: x + w, y: y + s.offset, w: s.depth, h: s.along };
}
const sideLen = (home, side) => (side === "top" || side === "bottom" ? home.w : home.h);

// The drawing itself (used live and for the saved image).
function Drawing({ f, data, lay, selected, forExport, onDown }) {
  const { W, H, home, tag } = lay;
  const t = tag, fs = t * 0.62, dimFs = t * 0.55;
  const sections = /triple/i.test(f.homeType || "") ? 3 : /double/i.test(f.homeType || "") ? 2 : 1;
  const st = data.street || {};
  const streetBar = st.name ? (st.side === "left" ? { x: 3, y: 4, w: 6, h: H - 8, v: true } : st.side === "top" ? { x: 4, y: 3, w: W - 8, h: 6, v: false }
    : st.side === "bottom" ? { x: 4, y: H - 9, w: W - 8, h: 6, v: false } : { x: W - 9, y: 4, w: 6, h: H - 8, v: true }) : null;
  return (
    <g>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      {!forExport && <g opacity="0.5">{Array.from({ length: Math.floor(W / 10) }, (_, i) => <line key={"v" + i} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2={H} stroke="#eef1f3" strokeWidth="0.3" />)}
        {Array.from({ length: Math.floor(H / 10) }, (_, i) => <line key={"h" + i} x1="0" y1={(i + 1) * 10} x2={W} y2={(i + 1) * 10} stroke="#eef1f3" strokeWidth="0.3" />)}</g>}

      {/* Street */}
      {streetBar && <g>
        <rect x={streetBar.x} y={streetBar.y} width={streetBar.w} height={streetBar.h} fill={FILL2} stroke={INK} strokeWidth="0.35" />
        <text x={streetBar.x + streetBar.w / 2} y={streetBar.y + streetBar.h / 2} fontSize={fs} fontFamily="Arial, sans-serif" fill={INK} textAnchor="middle" dominantBaseline="central"
          transform={streetBar.v ? `rotate(90 ${streetBar.x + streetBar.w / 2} ${streetBar.y + streetBar.h / 2})` : undefined}>{st.name}</text>
      </g>}

      {/* North arrow */}
      <g transform={`translate(${t * 1.6} ${t * 2.1}) rotate(${data.north || 0})`} onPointerDown={onDown ? (e) => onDown(e, { type: "north" }) : undefined} style={{ cursor: onDown ? "pointer" : "default" }}>
        <line x1="0" y1={t * 0.9} x2="0" y2={-t * 0.6} stroke={RED} strokeWidth={t * 0.22} />
        <polygon points={`0,${-t * 1.1} ${-t * 0.4},${-t * 0.4} ${t * 0.4},${-t * 0.4}`} fill={RED} />
        <text x="0" y={t * 1.7} fontSize={fs} fontFamily="Arial, sans-serif" fontWeight="700" fill={INK} textAnchor="middle" transform={`rotate(${-(data.north || 0)} 0 ${t * 1.45})`}>N</text>
      </g>

      {/* Home */}
      <rect x={home.x} y={home.y} width={home.w} height={home.h} fill={FILL} stroke={INK} strokeWidth="0.45" />
      {Array.from({ length: sections - 1 }, (_, i) => <line key={i} x1={home.x} y1={home.y + (home.h * (i + 1)) / sections} x2={home.x + home.w} y2={home.y + (home.h * (i + 1)) / sections} stroke={INK} strokeWidth="0.3" strokeDasharray="1.5 1.2" />)}
      <text x={home.x + home.w / 2} y={home.y + home.h / 2} fontSize={Math.min(fs, home.w / 14, home.h * 0.22)} fontFamily="Arial, sans-serif" fill={INK} opacity="0.7" textAnchor="middle" dominantBaseline="central">{typeLabel(f.homeType)}</text>
      <text x={home.x + home.w / 2} y={home.y + dimFs * 1.15} fontSize={dimFs} fontFamily="Arial, sans-serif" fill={INK} textAnchor="middle">{ft(home.w)}</text>
      <text x={home.x + dimFs * 0.45} y={home.y + home.h / 2} fontSize={dimFs} fontFamily="Arial, sans-serif" fill={INK} dominantBaseline="central">{ft(home.h)}</text>

      {/* Attached structures */}
      {data.structures.map((s) => {
        const r = structRect(home, s);
        const horiz = s.side === "top" || s.side === "bottom";
        return (
          <g key={s.id} onPointerDown={onDown ? (e) => onDown(e, { type: "struct", id: s.id }) : undefined} style={{ cursor: onDown ? "grab" : "default" }}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={FILL2} stroke={selected === s.id ? "#2c6e8c" : INK} strokeWidth={selected === s.id ? 0.9 : 0.4} />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} fontSize={Math.min(fs, r.h * 0.45, r.w * 0.22)} fontFamily="Arial, sans-serif" fill={INK} textAnchor="middle" dominantBaseline="central">{s.label || "Porch"}</text>
            {/* sizes on the outside edges */}
            {horiz ? <>
              <text x={r.x + r.w / 2} y={s.side === "top" ? r.y - dimFs * 0.5 : r.y + r.h + dimFs * 1.2} fontSize={dimFs} fontFamily="Arial, sans-serif" fill={INK} textAnchor="middle">{ft(s.along)}</text>
              <text x={r.x + r.w + dimFs * 0.4} y={r.y + r.h / 2} fontSize={dimFs} fontFamily="Arial, sans-serif" fill={INK} dominantBaseline="central">{ft(s.depth)}</text>
            </> : <>
              <text x={s.side === "left" ? r.x - dimFs * 0.4 : r.x + r.w + dimFs * 0.4} y={r.y + r.h / 2} fontSize={dimFs} fontFamily="Arial, sans-serif" fill={INK} textAnchor={s.side === "left" ? "end" : "start"} dominantBaseline="central">{ft(s.along)}</text>
              <text x={r.x + r.w / 2} y={r.y - dimFs * 0.5} fontSize={dimFs} fontFamily="Arial, sans-serif" fill={INK} textAnchor="middle">{ft(s.depth)}</text>
            </>}
          </g>
        );
      })}

      {/* Letter tags */}
      {data.tags.map((g) => {
        const def = TAGS.find((x) => x[0] === g.code) || TAGS[0];
        const w = g.code.length > 1 ? t * 1.35 : t;
        return (
          <g key={g.id} transform={`translate(${g.x - w / 2} ${g.y - t / 2})`} onPointerDown={onDown ? (e) => onDown(e, { type: "tag", id: g.id }) : undefined} style={{ cursor: onDown ? "grab" : "default" }}>
            <rect width={w} height={t} fill="#fff" stroke={selected === g.id ? "#2c6e8c" : def[2] === "r" ? RED : INK} strokeWidth={selected === g.id ? t * 0.14 : t * 0.09} />
            <text x={w / 2} y={t / 2} fontSize={t * 0.55} fontFamily="Arial, sans-serif" fontWeight="700" fill={INK} textAnchor="middle" dominantBaseline="central">{g.code}</text>
          </g>
        );
      })}
    </g>
  );
}

// The key printed beside the drawing in the saved image.
function KeyColumn({ x, H, t }) {
  const used = TAGS;
  const row = Math.min(t * 1.35, (H - 8) / (used.length + 1));
  const box = row * 0.72;
  return (
    <g transform={`translate(${x} 4)`}>
      <text x="0" y={row * 0.6} fontSize={box * 0.62} fontFamily="Arial, sans-serif" fontWeight="700" fill={INK}>Key</text>
      {used.map(([code, label, c], i) => (
        <g key={code} transform={`translate(0 ${row * (i + 1)})`}>
          <rect width={box * 1.25} height={box} fill="#fff" stroke={c === "r" ? RED : INK} strokeWidth={box * 0.09} />
          <text x={box * 0.625} y={box / 2} fontSize={box * 0.5} fontFamily="Arial, sans-serif" fontWeight="700" fill={INK} textAnchor="middle" dominantBaseline="central">{code}</text>
          <text x={box * 1.55} y={box / 2} fontSize={box * 0.55} fontFamily="Arial, sans-serif" fill={INK} dominantBaseline="central">{label}</text>
        </g>
      ))}
    </g>
  );
}

export default function SketchBuilder({ f, initial, onSave, onClose, onHome }) {
  const [data, setData] = useState(() => ({ ...BLANK, ...(initial || {}) }));
  const [hist, setHist] = useState([]);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef(null);
  const exportRef = useRef(null);
  const drag = useRef(null);
  const lay = useMemo(() => layout(f, data), [f, data]);

  const commit = (next) => { setHist((h) => [...h.slice(-49), data]); setData(next); };
  const undo = () => setHist((h) => { if (!h.length) return h; setData(h[h.length - 1]); setSel(null); return h.slice(0, -1); });

  const toWorld = (e) => {
    const svg = svgRef.current; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: p.x, y: p.y };
  };

  function onDown(e, what) {
    e.stopPropagation(); e.preventDefault();
    const p = toWorld(e);
    if (what.type === "north") { commit({ ...data, north: ((data.north || 0) + 45) % 360 }); return; }
    const item = what.type === "tag" ? data.tags.find((g) => g.id === what.id) : data.structures.find((s) => s.id === what.id);
    drag.current = { ...what, start: p, before: data, item, moved: false };
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
  }
  function onMove(e) {
    const d = drag.current; if (!d) return;
    const p = toWorld(e); const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.8) d.moved = true;
    if (d.type === "tag") {
      const x = Math.max(2, Math.min(lay.W - 2, d.item.x + dx)), y = Math.max(2, Math.min(lay.H - 2, d.item.y + dy));
      setData((cur) => ({ ...cur, tags: cur.tags.map((g) => (g.id === d.id ? { ...g, x, y } : g)) }));
    } else if (d.type === "struct") {
      const s = d.item; const horiz = s.side === "top" || s.side === "bottom";
      const max = sideLen(lay.home, s.side) - 2, min = -(s.along - 2);
      const offset = Math.round(Math.max(min, Math.min(max, s.offset + (horiz ? dx : dy))));
      setData((cur) => ({ ...cur, structures: cur.structures.map((x) => (x.id === d.id ? { ...x, offset } : x)) }));
    }
  }
  function onUp() {
    const d = drag.current; if (!d) return;
    drag.current = null;
    if (d.moved) setHist((h) => [...h.slice(-49), d.before]); // one undo step per drag
    else setSel((cur) => (cur === d.id ? null : d.id));       // a tap selects / unselects
  }

  function addTag(code) {
    const n = data.tags.length;
    const g = { id: uid(), code, x: lay.home.x + lay.home.w / 2 + ((n % 5) - 2) * lay.tag * 1.6, y: lay.home.y - lay.tag * 1.6 + Math.floor(n / 5) * lay.tag * 1.4 };
    if (g.y < lay.tag) g.y = lay.home.y + lay.home.h / 2;
    commit({ ...data, tags: [...data.tags, g] }); setSel(g.id);
  }
  function addStructure() {
    const used = new Set(data.structures.map((s) => s.side));
    const side = ["bottom", "top", "left", "right"].find((x) => !used.has(x)) || "bottom";
    const s = { id: uid(), side, along: Math.min(24, Math.round(sideLen(lay.home, side) * 0.4)), depth: 8, offset: 4, label: "Porch" };
    commit({ ...data, structures: [...data.structures, s] }); setSel(s.id);
  }
  const selStruct = data.structures.find((s) => s.id === sel);
  const selTag = data.tags.find((g) => g.id === sel);
  const editStruct = (patch) => commit({ ...data, structures: data.structures.map((s) => (s.id === sel ? { ...s, ...patch } : s)) });
  const remove = () => { commit({ ...data, tags: data.tags.filter((g) => g.id !== sel), structures: data.structures.filter((s) => s.id !== sel) }); setSel(null); };

  // Save: draw the sketch + key to a PNG and hand it to the form as the Home Sketch photo.
  async function save() {
    setBusy(true); setSel(null);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const node = exportRef.current;
      const xml = new XMLSerializer().serializeToString(node);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml); });
      const scale = 1800 / node.viewBox.baseVal.width;
      const c = document.createElement("canvas"); c.width = 1800; c.height = Math.round(node.viewBox.baseVal.height * scale);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      await onSave(new File([blob], "Home Sketch.png", { type: "image/png" }), data);
    } catch (e) {
      alert("Couldn't save the sketch: " + (e && e.message ? e.message : e));
    } finally { setBusy(false); }
  }

  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const keyW = lay.W * 0.26;

  return (
    <div className="sk-wrap" role="dialog" aria-modal="true" aria-label="Draw the home sketch">
      <div className="sk-top">
        <button type="button" className="sk-link" onClick={onClose}>Cancel</button>
        <b>Home sketch</b>
        <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save sketch"}</button>
      </div>
      {!f.lengthFt || !f.widthFt ? <p className="sk-note">Tip: enter the home's length and width in Home basics so it's drawn to size (using a typical {(TYPICAL[kind(f.homeType)] || [64, 28]).join("' × ")}' {kind(f.homeType) ? kind(f.homeType) + "-wide" : "home"} for now).</p> : null}

      <div className="sk-canvas">
        <svg ref={svgRef} viewBox={`0 0 ${lay.W} ${lay.H}`} preserveAspectRatio="xMidYMid meet" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerDown={() => setSel(null)} style={{ touchAction: "none", width: "100%", height: "100%", display: "block" }}>
          <Drawing f={f} data={data} lay={lay} selected={sel} onDown={onDown} />
        </svg>
      </div>

      <div className="sk-panel">
        {selStruct ? (
          <div className="sk-edit">
            <div className="sk-row">
              <label>Name<input value={selStruct.label} onChange={(e) => editStruct({ label: e.target.value.slice(0, 24) })} /></label>
              <label>Along the home (ft)<input inputMode="decimal" value={selStruct.along} onChange={(e) => editStruct({ along: Math.min(200, num(e.target.value, 1)) })} /></label>
              <label>Out from the home (ft)<input inputMode="decimal" value={selStruct.depth} onChange={(e) => editStruct({ depth: Math.min(60, num(e.target.value, 1)) })} /></label>
            </div>
            <div className="sk-row">
              <span className="sk-lbl">Side</span>
              {SIDES.map(([v, l]) => <button key={v} type="button" className={"chip" + (selStruct.side === v ? " on" : "")} onClick={() => editStruct({ side: v, offset: Math.min(selStruct.offset, sideLen(lay.home, v) - 2) })}>{l}</button>)}
              <button type="button" className="sk-del" onClick={remove}>Delete</button>
              <button type="button" className="sk-link" onClick={() => setSel(null)}>Done</button>
            </div>
            <p className="sk-hint">Drag the box along the side of the home to position it.</p>
          </div>
        ) : selTag ? (
          <div className="sk-row">
            <span className="sk-lbl">{selTag.code}: {(TAGS.find((x) => x[0] === selTag.code) || [])[1]}</span>
            <button type="button" className="sk-del" onClick={remove}>Delete tag</button>
            <button type="button" className="sk-link" onClick={() => setSel(null)}>Done</button>
          </div>
        ) : (
          <>
            <div className="sk-tags" aria-label="Tap a tag to add it, then drag it into place">
              {TAGS.map(([code, label, c]) => (
                <button key={code} type="button" className={"sk-tag" + (c === "r" ? " red" : "")} onClick={() => addTag(code)} title={label}>
                  <b>{code}</b><span>{label}</span>
                </button>
              ))}
            </div>
            {onHome && (
              <div className="sk-row sk-home">
                <span className="sk-lbl">Home</span>
                {[["Single-Wide", "Single"], ["Double-Wide", "Double"], ["Triple-Wide", "Triple"]].map(([v, l]) => (
                  <button key={v} type="button" className={"chip" + (f.homeType === v ? " on" : "")} onClick={() => onHome({ homeType: v })}>{l}</button>
                ))}
                <label>Length (ft)<input inputMode="decimal" value={f.lengthFt || ""} placeholder={String((TYPICAL[kind(f.homeType)] || [64])[0])} onChange={(e) => onHome({ lengthFt: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} /></label>
                <label>Width (ft)<input inputMode="decimal" value={f.widthFt || ""} placeholder={String((TYPICAL[kind(f.homeType)] || [0, 28])[1])} onChange={(e) => onHome({ widthFt: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} /></label>
              </div>
            )}
            <div className="sk-row">
              <button type="button" className="btn ghost sk-small" onClick={addStructure}>+ Porch / addition</button>
              <button type="button" className="btn ghost sk-small" onClick={() => commit({ ...data, north: ((data.north || 0) + 315) % 360 })} aria-label="Rotate north left">↺ N</button>
              <button type="button" className="btn ghost sk-small" onClick={() => commit({ ...data, north: ((data.north || 0) + 45) % 360 })} aria-label="Rotate north right">N ↻</button>
              <button type="button" className="btn ghost sk-small" onClick={undo} disabled={!hist.length}>Undo</button>
            </div>
            <div className="sk-row">
              <label style={{ flex: 1 }}>Street<input value={data.street.name} placeholder="e.g. Wintergreen Rd" onChange={(e) => setData({ ...data, street: { ...data.street, name: e.target.value.slice(0, 40) } })} /></label>
              <label>Side<select value={data.street.side} onChange={(e) => commit({ ...data, street: { ...data.street, side: e.target.value } })}>{SIDES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            </div>
            <p className="sk-hint">Tap a tag to add it, then drag it into place. Tap anything to edit or delete it.</p>
          </>
        )}
      </div>

      {/* What gets saved: the drawing plus the key, off-screen. */}
      <div style={{ position: "absolute", left: -99999, top: 0, width: 10, height: 10, overflow: "hidden" }} aria-hidden="true">
      <svg ref={exportRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${lay.W + keyW} ${lay.H}`} width={lay.W + keyW} height={lay.H}>
        <Drawing f={f} data={data} lay={lay} forExport />
        <rect x={lay.W} y="0" width={keyW} height={lay.H} fill="#fff" />
        <line x1={lay.W} y1="3" x2={lay.W} y2={lay.H - 3} stroke="#d5dde2" strokeWidth="0.3" />
        <KeyColumn x={lay.W + 4} H={lay.H} t={lay.tag} />
      </svg>
      </div>
    </div>
  );
}
