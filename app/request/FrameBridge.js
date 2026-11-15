"use client";
import { useEffect } from "react";

// When the request form is shown inside Brian's website (an iframe), hide our header
// and tell the website how tall the form is, so the iframe grows to fit with no inner
// scrollbar. Also asks the website to scroll back to the form's top on each new step.
// The WordPress side is a short script (see README → "Request form on the website").
export const inFrame = () => { try { return window.self !== window.top; } catch { return true; } };
export function frameToTop() { if (inFrame()) window.parent.postMessage({ type: "hh-portal-top" }, "*"); }

export default function FrameBridge() {
  useEffect(() => {
    if (!inFrame()) return;
    document.documentElement.classList.add("embedded");
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.body.getBoundingClientRect().height); // content height (not the frame's own size)
      if (h !== last) { last = h; window.parent.postMessage({ type: "hh-portal-height", height: h }, "*"); }
    };
    send();
    if (location.pathname.startsWith("/request/received")) frameToTop(); // thank-you page: show it from the top
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    window.addEventListener("load", send);
    return () => { ro.disconnect(); window.removeEventListener("load", send); };
  }, []);
  return null;
}
