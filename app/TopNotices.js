"use client";
import AssignedOrders from "./AssignedOrders";

// Shown just under the top bar on the Submit page: restored draft, order details, assigned orders.
export default function TopNotices({ form }) {
  if (form.busy) return null;
  return (
    <>
      {form.restoredAt && (
        <div className="restored">
          <span>We restored your unfinished submission (saved {new Date(form.restoredAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}).</span>
          <button type="button" onClick={() => { if (window.confirm("Clear this submission and its photos and start over?")) form.startOver(); }}>Start over</button>
        </div>
      )}
      <AssignedOrders form={form} />
    </>
  );
}
