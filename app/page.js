"use client";
import { useState, useEffect } from "react";
import { useSubmissionForm } from "./useSubmissionForm";
import DesktopForm from "./DesktopForm";
import MobileWizard from "./MobileWizard";
import { FEE } from "../lib/formConfig";

export default function Page() {
  const form = useSubmissionForm();
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
      {isMobile ? <MobileWizard form={form} /> : <DesktopForm form={form} />}
      <button className="viewtoggle" onClick={() => setManual(!isMobile)}>
        {isMobile ? "Switch to desktop view" : "Switch to mobile view"}
      </button>
    </>
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
            <h2>Submitted &amp; paid</h2>
            <p className="intro" style={{ maxWidth: "44ch", margin: "12px auto 0" }}>Your report is in the engineer's queue. The certificate goes to the email you provided.</p>
            <div className="receipt">
              <div><span>Submission ID</span><span>{result.id}</span></div>
              <div><span>Client</span><span>{result.clientName}</span></div>
              <div><span>Files uploaded</span><span>{result.photos}</span></div>
              <div><span>Fee paid</span><span>${FEE}.00</span></div>
            </div>
            <button className="btn ghost" onClick={() => window.location.reload()}>Start another submission</button>
          </div>
        </section>
      </div>
    </>
  );
}
