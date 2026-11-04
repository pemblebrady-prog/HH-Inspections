import crypto from "node:crypto";

// Read entries from Gravity Forms on houseandhomeaz.com through its built-in REST API (v2).
// Settings: GF_SITE_URL (e.g. https://houseandhomeaz.com), GF_CONSUMER_KEY, GF_CONSUMER_SECRET,
// GF_FORM_IDS (comma-separated form ids the portal accepts, e.g. "2").
//
// Auth: tries HTTP Basic first; many hosts strip the Authorization header, so it falls
// back to OAuth 1.0a with the signature in the query string (also supported by Gravity Forms).

export const gfEnabled = () => Boolean(process.env.GF_SITE_URL && process.env.GF_CONSUMER_KEY && process.env.GF_CONSUMER_SECRET);
export const allowedForms = () => String(process.env.GF_FORM_IDS || "").split(",").map((s) => Number(s.trim())).filter(Boolean);

// RFC 3986 encoding for OAuth.
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export function oauthQuery(method, baseUrl, params, key, secret, { nonce, timestamp } = {}) {
  const oauth = {
    oauth_consumer_key: key,
    oauth_nonce: nonce || crypto.randomBytes(12).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp || Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
  };
  const all = { ...params, ...oauth };
  const norm = Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join("&");
  const base = [method.toUpperCase(), enc(baseUrl), enc(norm)].join("&");
  const signature = crypto.createHmac("sha1", `${enc(secret)}&`).update(base).digest("base64");
  return { ...all, oauth_signature: signature };
}

async function gfGet(route, params = {}) {
  const site = String(process.env.GF_SITE_URL || "").replace(/\/+$/, "");
  const key = process.env.GF_CONSUMER_KEY, secret = process.env.GF_CONSUMER_SECRET;
  if (!site || !key || !secret) throw new Error("Gravity Forms isn't connected (GF_SITE_URL / keys missing).");
  const baseUrl = `${site}/`;
  const q = { rest_route: route, ...params };   // ?rest_route= works with any permalink setting

  // 1) Basic auth
  let res = await fetch(`${baseUrl}?${new URLSearchParams(q)}`, {
    headers: { Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"), Accept: "application/json" },
    cache: "no-store",
  });
  // 2) OAuth 1.0a in the query string if Basic was rejected
  if (res.status === 401 || res.status === 403) {
    res = await fetch(`${baseUrl}?${new URLSearchParams(oauthQuery("GET", baseUrl, q, key, secret))}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  }
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok || !json) throw new Error(`Gravity Forms ${res.status}: ${(json && (json.message || json.code)) || text.slice(0, 160)}`);
  return json;
}

export const getEntry = (id) => gfGet(`/gf/v2/entries/${Number(id)}`);
export async function recentEntries(formId, pageSize = 25) {
  const r = await gfGet(`/gf/v2/forms/${Number(formId)}/entries`, { "paging[page_size]": pageSize, "sorting[key]": "id", "sorting[direction]": "DESC" });
  return r.entries || [];
}

// ---- Map an entry from the "Manufactured Home Engineering Inspection Request" form ----
// Field ids come from the form export (the duplicate test form keeps the same ids).
const v = (e, id) => String(e[id] == null ? "" : e[id]).trim();
const name = (e, id) => [v(e, `${id}.3`), v(e, `${id}.6`)].filter(Boolean).join(" ");
const address = (e, id) => {
  const line1 = [v(e, `${id}.1`), v(e, `${id}.2`)].filter(Boolean).join(", ");
  const stRaw = v(e, `${id}.4`);
  const st = /^(az|arizona)$/i.test(stRaw) ? "AZ" : stRaw;
  const cityLine = [v(e, `${id}.3`), [st, v(e, `${id}.5`)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, cityLine].filter(Boolean).join(", ");
};
const yes = (s) => (s === "Yes" ? true : s === "No" ? false : null);

export function mapInspectionType(main, foundation, conventional) {
  if (/^Foundation/i.test(main)) {
    if (/Porches/i.test(foundation)) return { type: "Porches & Additions", detail: foundation };
    if (["FHA", "VA", "USDA"].includes(foundation)) return { type: foundation, detail: foundation };
    return { type: "FHA", detail: main };
  }
  if (/^Conventional/i.test(main)) {
    if (/^Porches and additions only$/i.test(conventional)) return { type: "Porches & Additions", detail: `Conventional - ${conventional}` };
    return { type: "Conventional", detail: conventional ? `Conventional - ${conventional}` : "Conventional loan" };
  }
  return { type: "Unknown", detail: main || "" }; // "Other" text
}

export function mapEntry(e) {
  const t = mapInspectionType(v(e, "48"), v(e, "2"), v(e, "47"));
  const occupied = yes(v(e, "30"));
  const others = [];
  if (yes(v(e, "62")) && name(e, "59")) others.push({ name: name(e, "59"), phone: v(e, "60"), email: v(e, "61") });
  const copies = [["68", "69"], ["70", "71"]].map(([n, m]) => ({ name: name(e, n), email: v(e, m).toLowerCase() })).filter((c) => c.email);
  return {
    source_form_id: Number(e.form_id), source_entry_id: Number(e.id),
    requested_at: e.date_created ? new Date(String(e.date_created).replace(" ", "T") + "Z").toISOString() : null,
    inspection_type: t.type, inspection_detail: t.detail,
    property_address: address(e, "55"),
    requester: { company: v(e, "6"), name: name(e, "58"), email: v(e, "72").toLowerCase(), phone: v(e, "57"), address: address(e, "56") },
    occupant: occupied === null ? {} : { occupied, name: occupied ? name(e, "65") : "", phone: occupied ? v(e, "64") : "", email: occupied ? v(e, "66") : "", informed: occupied ? yes(v(e, "36")) : null, others },
    access: { fenced: yes(v(e, "37")), lockedGates: yes(v(e, "38")), dogs: yes(v(e, "39")), underHomeLocked: yes(v(e, "40")), lockbox: yes(v(e, "41")), lockboxCode: yes(v(e, "41")) ? v(e, "42") : "" },
    report_copies: copies,
    comments: v(e, "54"),
    raw: e,
  };
}
