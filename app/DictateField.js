"use client";
import { useEffect, useRef, useState } from "react";

// A comment box with a microphone button (Nov 24): speak, and the words are typed into the box.
// Works where the browser has speech recognition (Chrome, Edge, Safari). Elsewhere (Firefox) the button
// is hidden and the keyboard's own dictation mic still works.
export default function DictateField({ id, label, value, onChange, placeholder }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [err, setErr] = useState("");
  const rec = useRef(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    setSupported(typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => { try { rec.current && rec.current.abort(); } catch { /* already stopped */ } };
  }, []);

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setErr("");
    const r = new SR();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "", soFar = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else soFar += t;
      }
      if (finalText.trim()) {
        const cur = latest.current || "";
        const sep = cur && !/\s$/.test(cur) ? " " : "";
        const text = finalText.trim();
        onChange(cur + sep + text.charAt(0).toUpperCase() + text.slice(1));
      }
      setInterim(soFar);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setErr("Microphone access is blocked. Allow it in your browser settings, or use the mic on your keyboard.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setErr("Voice typing stopped. Tap the mic to try again.");
    };
    r.onend = () => { setListening(false); setInterim(""); };
    try { r.start(); rec.current = r; setListening(true); } catch { setErr("Couldn't start voice typing."); }
  }
  function stop() { try { rec.current && rec.current.stop(); } catch { /* already stopped */ } }

  return (
    <div className="field">
      <div className="dictate-head">
        <label htmlFor={id}>{label}</label>
        {supported && (
          <button type="button" className={"mic" + (listening ? " on" : "")} onClick={listening ? stop : start}
            aria-pressed={listening} aria-label={listening ? `Stop voice typing for ${label}` : `Voice typing for ${label}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2z" /></svg>
            {listening ? "Stop" : "Speak"}
          </button>
        )}
      </div>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={5} />
      {listening && <p className="hint" style={{ marginTop: 4 }}>Listening…{interim ? ` “${interim}”` : ""}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
