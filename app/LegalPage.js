// Shared layout for the public Privacy Policy and Terms of Service pages.
export const BUSINESS = "House and Home AZ Inspection Service";
export const CONTACT_EMAIL = "houseandhomeengineering@gmail.com";
export const CONTACT_PHONE = "520-599-7798";
export const UPDATED = "November 10, 2026";

export default function LegalPage({ title, children }) {
  return (
    <>
      <header><div className="bar">
        <a className="brand" href="https://houseandhomeaz.com"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspector Portal</span></a>
      </div></header>
      <div className="shell legal" style={{ maxWidth: 760 }}>
        <section className="card">
          <h1 style={{ fontSize: "1.6rem", margin: "0 0 4px" }}>{title}</h1>
          <p className="hint" style={{ marginTop: 0 }}>Last updated {UPDATED}</p>
          {children}
        </section>
        <p className="hint" style={{ textAlign: "center" }}><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/login">Sign in</a></p>
      </div>
    </>
  );
}
