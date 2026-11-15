// Photo checks with Claude's vision (Anthropic API). Needs ANTHROPIC_API_KEY in Vercel.
// - Does the photo fit its slot? (gentle warning only)
// - Certification tags slot: read HUD label numbers and the data plate.
import { PHOTO_SLOTS } from "./formConfig";

export const photoAIEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

// Slots where anything goes (no "does it match" check).
const ANY = new Set(["p02", "other"]);
const HINT = {
  p01: "the outside of a manufactured home (any side)",
  p03: "a HUD certification label (small metal plate, often red) or the home's data plate (paper label with manufacturer, serial number, date)",
  p04: "the ground and grading/drainage around the home",
  p05: "a structure attached to the home, such as a porch, deck, carport or addition",
  p06: "the underside of the home: steel I-beams, piers, blocks or jacks",
  p07: "tie-downs: metal straps or anchors securing the home to the ground",
  p08: "the belly wrap / moisture barrier under the home",
  p09: "crawlspace vents in the skirting or foundation",
  p10: "insulation under or in the home",
  p11: "skirting around the base of the home, from outside or inside the crawlspace",
};

// HUD label numbers look like "ARZ 249557" (3 letters + 6-7 digits).
export function normalizeTag(s) {
  const m = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, " ").trim().match(/^([A-Z]{3})\s*(\d{5,8})$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

export async function checkPhoto({ slot, base64, mediaType }) {
  const s = PHOTO_SLOTS.find((x) => x.id === slot);
  if (!s) throw new Error("Unknown photo slot.");
  const tags = slot === "p03";
  const ask = [
    `This photo was added to the "${s.label}" section of a manufactured home foundation inspection.`,
    ANY.has(slot) ? "" : `That section should show ${HINT[slot] || s.label}.`,
    "Reply with JSON only, no other text:",
    `{"matches": ${ANY.has(slot) ? "true" : "true if the photo plausibly shows what the section asks for, false if it clearly shows something else, null if unsure"},`,
    ` "shows": "what the photo shows, 8 words or fewer",`,
    ` "unusable": "" or a short reason if it's too blurry, dark or obstructed to see the important detail`,
    tags ? `, "hudTags": [every HUD certification label number you can read exactly, e.g. "ARZ 249557"; [] if none are readable],
 "dataPlate": null or {"manufacturer": "", "yearBuilt": "", "serial": "", "model": ""} with only what's clearly printed` : "",
    "}",
    "Don't guess characters you can't read. Be lenient: inspectors photograph from many angles.",
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 400,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } },
        { type: "text", text: ask },
      ] }],
    }),
    signal: AbortSignal.timeout(25000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error((j && j.error && j.error.message) || `Photo check failed (${res.status})`);
  const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return parseAnswer(text, { tags, any: ANY.has(slot) });
}

export function parseAnswer(text, { tags, any }) {
  let a = {};
  try { a = JSON.parse(String(text).slice(String(text).indexOf("{"), String(text).lastIndexOf("}") + 1)); } catch { a = {}; }
  const out = {
    matches: any ? true : a.matches === false ? false : a.matches === true ? true : null,
    shows: String(a.shows || "").slice(0, 80),
    unusable: String(a.unusable || "").slice(0, 120),
  };
  if (tags) {
    out.hudTags = [...new Set((Array.isArray(a.hudTags) ? a.hudTags : []).map(normalizeTag).filter(Boolean))].slice(0, 4);
    const p = a.dataPlate && typeof a.dataPlate === "object" ? a.dataPlate : null;
    const year = p && String(p.yearBuilt || "").match(/(19|20)\d{2}/);
    out.dataPlate = p ? {
      manufacturer: String(p.manufacturer || "").slice(0, 60), model: String(p.model || "").slice(0, 60),
      serial: String(p.serial || "").slice(0, 40), yearBuilt: year ? year[0] : "",
    } : null;
    if (out.dataPlate && !out.dataPlate.manufacturer && !out.dataPlate.yearBuilt && !out.dataPlate.serial) out.dataPlate = null;
  }
  return out;
}
