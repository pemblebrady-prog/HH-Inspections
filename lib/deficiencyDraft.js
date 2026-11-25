// Turn the inspector's "Explanation of deficiencies" (step 9) into draft letter wording in Ron Rath's style
// (Nov 24). The checklist answers already become Ron-style sentences in lib/letterContent.js; this adds
// observations and corrections for anything the inspector described in their own words. The draft is saved
// on the job (report.deficiencyDraft) so the job page and every regenerated letter show the same wording,
// and Ron edits it in the Google Doc before certifying. Needs ANTHROPIC_API_KEY; without it the inspector's
// note goes into the draft as-is, marked for Ron to reword.
import { buildFindings } from "./letterContent";
import { PHOTO_SLOTS } from "./formConfig";

const MODEL = process.env.ANTHROPIC_DRAFT_MODEL || process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
export const draftAIEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

// Examples of Ron's wording (from his reports), so the draft reads like the rest of the letter.
const RON_STYLE = [
  "Tie-downs visually detected (8/side), meeting 24 CFR 3285.401 requirements.",
  "No tie-downs were detected, not meeting 24 CFR 3285.401.",
  "Site grading and drainage does not appear adequate at time of inspection, not meeting 24 CFR 3285.203.",
  "Visually accessible concrete block piers show deficiencies, not meeting 24 CFR 3285.310.",
  "Axles are still attached and tow bars are removed not meeting CFR 3555.208.",
  "The skirting is not functional as required, not meeting 24 CFR 3285.505.",
  "The moisture barrier (belly wrap) is damaged in areas, which can allow moisture and pests into the floor system.",
];
const RON_CORRECTIONS = [
  "Tie-downs need to be installed per 24 CFR 3285.401.",
  "Deficient piers need to be repaired or replaced per 24 CFR 3285.310.",
  "Axles need to be completely removed from under the home.",
  "The damaged moisture barrier (belly wrap) needs to be repaired or replaced.",
];

const SECTIONS = PHOTO_SLOTS.filter((s) => s.id !== "other").map((s) => `${s.id} = ${s.label}`).join("; ");

async function askClaude(f) {
  const { findings, corrections } = buildFindings({ ...f, deficiencyDraft: null });
  const ask = [
    "You help a professional engineer (Ron Rath, PE) draft a manufactured home foundation certification letter.",
    "The inspector wrote this explanation of deficiencies found on site:",
    `"""${String(f.deficiencyNotes).slice(0, 3000)}"""`,
    "",
    "The letter already says these things (from the checklist); do NOT repeat them:",
    ...findings.map((x) => `- ${x.text}`), ...corrections.map((c) => `- Correction: ${c}`),
    "",
    "Write any additional observations and corrections the inspector's explanation supports, in Ron's style. Examples of his observations:",
    ...RON_STYLE.map((x) => `- ${x}`),
    "Examples of his corrections:",
    ...RON_CORRECTIONS.map((x) => `- ${x}`),
    "",
    "Rules: one short sentence each, plain and factual, third person, no names. Only state what the explanation says; never invent measurements, counts or locations. Cite a 24 CFR 3285 section only when it clearly applies (3285.203 grading/drainage, 3285.310 piers/footings, 3285.312 footings, 3285.401 tie-downs/anchoring, 3285.505 skirting/crawlspace ventilation, 3285.801 attached structures). If the explanation describes something that isn't a deficiency, or only repeats the checklist, return empty lists.",
    `For each observation pick the photo section it belongs to: ${SECTIONS}. Use p02 (deficiencies) if none fits.`,
    'Reply with JSON only: {"observations": [{"text": "...", "section": "p06"}], "corrections": ["..."]}',
  ].join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: ask }] }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error((j && j.error && j.error.message) || `Draft failed (${res.status})`);
  const text = (j.content || []).map((c) => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  const out = m ? JSON.parse(m[0]) : {};
  const slots = new Set(PHOTO_SLOTS.map((s) => s.id));
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 400);
  return {
    observations: (Array.isArray(out.observations) ? out.observations : []).map((o) => ({ text: clean(o && o.text), section: slots.has(o && o.section) ? o.section : "p02" })).filter((o) => o.text).slice(0, 8),
    corrections: (Array.isArray(out.corrections) ? out.corrections : []).map(clean).filter(Boolean).slice(0, 8),
  };
}

// Make sure the job's report has a draft for its current explanation. Saves it on the job; returns the report.
export async function ensureDeficiencyDraft(db, sub) {
  const f = (sub && sub.report) || {};
  const notes = String(f.deficiencyNotes || "").trim();
  if (!notes) return f;
  if (f.deficiencyDraft && f.deficiencyDraft.notes === notes) return f;
  let draft = null;
  if (draftAIEnabled()) {
    try { draft = await askClaude(f); } catch (e) { console.error("deficiency draft failed", e.message); }
  }
  const report = { ...f, deficiencyDraft: { notes, ...(draft || { observations: [], corrections: [], asWritten: true }), at: new Date().toISOString() } };
  if (db && sub && sub.id) {
    const { error } = await db.from("submissions").update({ report }).eq("id", sub.id);
    if (error) console.error("deficiency draft save failed", error.message);
    else sub.report = report;
  }
  return report;
}
