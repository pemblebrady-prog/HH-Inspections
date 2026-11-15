"use client";
export default function PrintButton() {
  return <button className="btn ghost" type="button" onClick={() => window.print()}>Print / Save as PDF</button>;
}
