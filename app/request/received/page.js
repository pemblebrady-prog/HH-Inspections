import { createAdminClient } from "../../../lib/supabase/server";
import { importEntry } from "../../../lib/orders";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Request received | House & Home" };

// Gravity Forms sends the requester here after they submit (confirmation → Redirect).
// /request/received?form=2&entry=123 → creates the order and thanks them. Public page.
export default async function RequestReceived({ searchParams }) {
  const form = Number(searchParams && searchParams.form), entry = Number(searchParams && searchParams.entry);
  let order = null;
  const ref = String((searchParams && searchParams.ref) || "");
  if (/^OR-\d{3,7}$/.test(ref)) order = { ref };
  if (form && entry) {
    const db = createAdminClient();
    const h = headers();
    const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
    if (db) {
      const { data: sent } = await db.from("orders").select("ref").eq("source_form_id", form).eq("source_entry_id", entry).maybeSingle();
      if (sent) order = sent;
      else try { order = await importEntry(db, form, entry, { origin }); }
      catch (e) { console.error("order import failed", form, entry, e.message); }
    }
  }
  return (
    <>
      <header><div className="bar">
        <a className="brand" href="https://houseandhomeaz.com"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspection Request</span></a>
      </div></header>
      <div className="shell" style={{ maxWidth: 620 }}>
        <section className="card">
          <h2>Thank you for ordering your inspection</h2>
          {order && <p className="intro">Your request number is <b>{order.ref}</b>.</p>}
          <p className="intro">Your order has been received and will be processed by our office. We will contact you shortly, via email, regarding the date and time of your inspection, the cost, and how to pay online. You can also call our office at <a href="tel:5202457897">520-245-7897</a>.</p>
          <p className="intro">If payment is not received before 5pm the day before the inspection is scheduled, the inspection will not proceed.</p>
          <p className="intro">For the safety of our inspectors, please make sure all occupants of the home and property know about the inspection, and that all areas around and under the home are accessible (no locks). If the inspector can't reach the areas needed, a return trip fee applies.</p>
          <p className="intro">Inspections are weather permitting. If one must be postponed for weather, we'll reschedule as soon as possible at no extra charge. A $25.00 fee applies to cancelled inspections.</p>
          <p className="hint">A confirmation was also sent to your email. If you don't see it, check your spam folder.</p>
          <p><a className="btn ghost" href="https://houseandhomeaz.com">Back to House &amp; Home</a></p>
        </section>
      </div>
    </>
  );
}
