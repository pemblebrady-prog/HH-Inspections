"use client";
import { useEffect, useState } from "react";

// "Add to Home Screen" instructions for the phone the person is holding.
export default function HomeScreenSteps() {
  const [kind, setKind] = useState(null);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) setKind("installed");
    else if (/iPhone|iPad|iPod/i.test(ua)) setKind("ios");
    else if (/Android/i.test(ua)) setKind("android");
    else setKind("desktop");
  }, []);
  if (!kind) return null;

  if (kind === "installed") return <p className="intro">You're already using the portal from your home screen.</p>;
  const ios = (
    <ol className="steps">
      <li>Open this page in <b>Safari</b> (not Chrome or an in-app browser).</li>
      <li>Tap the <b>Share</b> button (the square with an arrow pointing up) at the bottom of the screen.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
    </ol>
  );
  const android = (
    <ol className="steps">
      <li>Open this page in <b>Chrome</b>.</li>
      <li>Tap the <b>⋮</b> menu in the top-right corner.</li>
      <li>Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Add</b>.</li>
    </ol>
  );
  return (
    <div>
      <p className="intro">Put the portal on your phone's home screen so it opens like an app, right from the job site.</p>
      {kind === "ios" && ios}
      {kind === "android" && android}
      {kind === "desktop" && (
        <>
          <p className="intro">You're on a computer. When you open the portal on your phone, do this:</p>
          <p className="hint"><b>iPhone</b></p>{ios}
          <p className="hint"><b>Android</b></p>{android}
        </>
      )}
    </div>
  );
}
