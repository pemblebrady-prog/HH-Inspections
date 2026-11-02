"use client";
import { useState, useEffect } from "react";
import { useSubmissionForm } from "./useSubmissionForm";
import DesktopForm from "./DesktopForm";
import MobileWizard from "./MobileWizard";
import { FEE } from "../lib/formConfig";

export default function PortalPage({ profile }) {
  const form = useSubmissionForm(profile);
  const [autoMobile, setAutoMobile] = useState(null); // null until measured (avoids SSR flash)
  const [manual, setManual] = useState(null);         // user override: true=mobile, false=desktop

  useEffect(() => {
    const check = () => setAutoMobile(window.innerWidth < 720);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (autoMobile === null) return null; // brief, before first measure

  const isMobile = manual !== null ? manual : autoMobile;

  if (form.result) return <Success result={form.result} />;

  return (
    <>
      {form.demo && <DemoBar form={form} />}
      {isMobile
        ? <MobileWizard form={form} onSwitchView={() => setManual(false)} switchLabel="Desktop view" />
        : <DesktopForm form={form} onSwitchView={() => setManual(true)} switchLabel="Mobile view" />}
    </>
  );
}

function DemoBar({ form }) {
  return (
    <div className="demobar" role="region" aria-label="Demo mode">
      <span className="mono">Demo mode</span>
      <button className="btn" onClick={form.fillDemo} disabled={form.demoLoading || form.busy}>
        {form.demoLoading ? "Loading…" : "Fill sample data"}
      </button>
    </div>
  );
}

function Success({ result }) {
  return (
    <>
      <header><div className="bar">
        <a className="brand" href="#"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspector Portal</span></a>
      </div></header>
      <div className="shell">
        <section className="card">
          <div className="done-wrap">
            <svg className="seal" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#3f7a52" strokeWidth="3" /><circle cx="60" cy="60" r="45" fill="none" stroke="#3f7a52" strokeWidth="1.3" />
              <path d="M44 61l11 11 22-24" stroke="#3f7a52" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2>Submitted</h2>
            <p className="intro" style={{ maxWidth: "44ch", margin: "12px auto 0" }}>Your report is in the engineer's queue. You will receive the certified letter within the next several business days at the email address provided.</p>
            <div className="receipt">
              <div><span>Submission ID</span><span>{result.id}</span></div>
              <div><span>Client</span><span>{result.clientName}</span></div>
              <div><span>Property</span><span>{result.propertyAddress}</span></div>
              <div><span>Files uploaded</span><span>{result.photos}</span></div>
                          </div>
            {result.demo && (
              <p className="intro" style={{ maxWidth: "44ch", margin: "16px auto 0" }}>
                Demo submission — kept out of the tracker and no email was sent.
                {result.driveLink && <> The draft letter appears in this <a href={result.driveLink} target="_blank" rel="noreferrer">Drive folder</a> within about a minute.</>}
              </p>
            )}
            <button className="btn ghost" onClick={() => window.location.reload()}>{result.demo ? "Run another demo" : "Start another submission"}</button>
          </div>
        </section>
      </div>
    </>
  );
}
