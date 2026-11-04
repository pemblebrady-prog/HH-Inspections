"use client";
import { useEffect, useState } from "react";

const when = (iso) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Time not set";
const yn = (b) => (b === true ? "Yes" : b === false ? "No" : "?");

// Top of the Submit page: either the order this job came from, or the inspector's assigned orders.
export default function AssignedOrders({ form }) {
  const [list, setList] = useState(null);
  const info = form.orderInfo;
  useEffect(() => {
    if (info || !form.profile) return;
    fetch("/api/orders/mine").then((r) => r.json()).then((d) => setList(d.ok ? d.orders : [])).catch(() => setList([]));
  }, [info, form.profile]);

  if (info) {
    const a = info.access || {};
    return (
      <div className="order-banner">
        <div><b>Order {info.ref}</b> · {info.detail} · {when(info.scheduledAt)}</div>
        <div className="hint">
          Dogs: {yn(a.dogs)} · Locked gates: {yn(a.lockedGates)} · Under-home locked: {yn(a.underHomeLocked)}
          {a.lockboxCode ? <> · <b>Lockbox code: {a.lockboxCode}</b></> : null}
          {info.occupant ? <> · Occupant: {info.occupant.name}{info.occupant.phone ? <> (<a href={`tel:${info.occupant.phone}`}>{info.occupant.phone}</a>)</> : null}</> : null}
        </div>
        {info.comments && <div className="hint">Notes from requester: {info.comments}</div>}
      </div>
    );
  }
  if (!list || !list.length || form.restoredAt) return null;
  return (
    <div className="order-banner">
      <b>Your assigned inspections</b>
      <ul className="month-list">
        {list.map((o) => (
          <li key={o.id}>
            <span>{o.property_address}<br /><span className="hint">{o.ref} · {when(o.scheduled_at)}</span></span>
            <a className="btn ghost" href={`/?order=${encodeURIComponent(o.id)}`} style={{ margin: 0 }}>Start</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
