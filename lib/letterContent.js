// Wording for the certification letter, modeled on Ron Rath's reports
// (e.g. "88 Camino De Papas"). Edit the text here to change every future letter.

export const ENGINEER = { name: "Ron Rath", title: "Professional Engineer" };
export const DOCUMENT_ID = "Document MHI2021R1";

export const DEFAULT_COMPANY = {
  name: "House and Home AZ Inspection Service",
  phone: "520-245-7897",
  email: "houseandhomeengineering@gmail.com",
};

export const STANDARD_PARAGRAPH =
  "The Property listed above has been inspected per current state standards for foundation and piers which includes any attached structures such as additions and porches.";

// Used when nothing needs correcting. Ron: confirm this matches your usual wording.
export const PASS_STATEMENT =
  "Based on my visual inspection, the foundation, piers and tie-down system of the home listed above are in compliance with 24 CFR Part 3285, Model Manufactured Home Installation Standards.";

export const CORRECTIONS_HEADING = "Areas requiring corrections to be HUD compliant:";
export const CONTRACTORS_HEADING = "Five Manufacturing Home contractors knowledgeable in this type of construction are:";
export const CONTRACTORS = [
  "Cray's Mobile Home Service - Richard Cray 520-975-8650",
  "B5 Construction, Jason Baker, 1-520-405-2678",
  "The Orion Co. - Jim Miller 520-888-8501",
  "Western American Housing - Ernesto Carrillo 520-591-4471",
  "Richard Gaines - 520-526-4686",
];

const PIER_WORD = { "Concrete Blocks": "concrete block", "Metal Jacks": "metal jack", "Wood": "wood", "Concrete Pillars": "concrete pillar" };

function list(arr) {
  if (arr.length <= 1) return arr.join("");
  return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
}

// Turn the checklist into Ron-style sentences. Each finding names the photo
// slots that illustrate it. Returns { tagLine, findings, corrections }.
export function buildFindings(f) {
  const findings = [];
  const corrections = [];
  const add = (text, slots = []) => findings.push({ text, slots });

  // HUD tags
  let tagLine = "";
  const tags = (f.hudTagNumbers || "").trim();
  switch (f.certTags) {
    case "Yes": tagLine = tags ? `HUD Tags ${tags}` : "HUD tags present."; break;
    case "No": tagLine = "HUD Tag missing."; break;
    case "Not Visible": tagLine = "HUD tags were not visible at the time of inspection."; break;
    case "Covered": tagLine = "HUD tags are covered and could not be read."; break;
    case "Yes, but Illegible": tagLine = "HUD tags present but illegible."; break;
    default: tagLine = tags ? `HUD Tags ${tags}` : "";
  }

  // Attached structures
  if (f.attached === "No") add("The home has no attached structures.", ["p05"]);
  else if (f.attached === "Yes") add("The home has attached structures, which were included in this inspection.", ["p05"]);

  // Crawlspace access
  if ((f.crawlAccess || "").trim()) add(`Accessed the crawl space via an access point ${f.crawlAccess.trim().replace(/\.$/, "")}.`);

  // Tie-downs
  const perSide = (f.tieDownsPerSide || "").trim();
  const len = (f.lengthFt || "").trim();
  const lenNote = len ? ` (${len}ft length).` : "";
  if (f.tieDowns === "Present") {
    add(`Tie-downs visually detected${perSide ? ` (${perSide}/side)` : ""}, meeting 24 CFR 3285.401 requirements.${lenNote}`, ["p07"]);
  } else if (f.tieDowns === "Not Present") {
    add("No tie-downs were detected, not meeting 24 CFR 3285.401.", ["p07"]);
    corrections.push("Tie-downs need to be installed per 24 CFR 3285.401.");
  } else if (f.tieDowns === "Present but Inadequate") {
    add(`Tie-downs detected${perSide ? ` (${perSide}/side)` : ""} but inadequate, not meeting 24 CFR 3285.401.${lenNote}`, ["p07"]);
    corrections.push("Additional tie-downs need to be installed to meet 24 CFR 3285.401.");
  } else if (f.tieDowns === "Not Visible") {
    add("Tie-downs were not visible at the time of inspection.", ["p07"]);
  }

  // Grading & drainage
  if (f.grading === "Adequate") add("Site grading and drainage looks to be adequate at time of inspection per 24 CFR 3285.203.", ["p04"]);
  else if (f.grading === "Inadequate") {
    add("Site grading and drainage does not appear adequate at time of inspection, not meeting 24 CFR 3285.203.", ["p04"]);
    corrections.push("Site grading needs to be corrected so water drains away from the home per 24 CFR 3285.203.");
  }

  // Piers
  const pierTypes = (f.piers || []).map((p) => PIER_WORD[p]).filter(Boolean);
  const pierWord = pierTypes.length ? list(pierTypes) + " " : "";
  if (f.piersCondition === "Functional") add(`Visually accessible ${pierWord}piers look to be functional as intended per 24 CFR 3285.310.`, ["p06"]);
  else if (f.piersCondition === "Deficient") {
    add(`Visually accessible ${pierWord}piers show deficiencies, not meeting 24 CFR 3285.310.`, ["p06"]);
    corrections.push("Deficient piers need to be repaired or replaced per 24 CFR 3285.310.");
  } else if (f.piersCondition === "Not Visible") add("Piers were not visible at the time of inspection.", ["p06"]);

  // Axles / hitch
  if (f.axles === "Removed") add("Axles and tow bars have been removed.");
  else if (f.axles === "Axles Still Attached") {
    add("Axles are still attached and tow bars are removed not meeting CFR 3555.208.");
    corrections.push("Axles need to be completely removed from under the home.");
  } else if (f.axles === "Hitch Still Attached") {
    add("Axles are removed and tow bars are still attached not meeting CFR 3555.208.");
    corrections.push("Tow bars need to be completely removed from the home.");
  } else if (f.axles === "Axles and Hitch Still Attached") {
    add("Axles and tow bars are still attached not meeting CFR 3555.208.");
    corrections.push("Axles and tow bars need to be completely removed from the home.");
  }

  // Skirting & venting
  const venting = f.venting || [];
  const badVent = venting.includes("Inadequate Venting") || venting.includes("No Venting");
  if (f.skirtingCondition === "Functional" && !badVent) add("The skirting and venting are functional as required per 24 CFR 3285.310/505.", ["p11", "p09"]);
  else if (f.skirtingCondition === "No Skirting") {
    add("The home has no skirting, not meeting 24 CFR 3285.505.", ["p11", "p09"]);
    corrections.push("Skirting with adequate venting needs to be installed per 24 CFR 3285.505.");
  } else if (f.skirtingCondition === "Deficient" || badVent) {
    add(`The ${badVent && f.skirtingCondition !== "Deficient" ? "crawlspace venting is" : "skirting and/or venting are"} not functional as required, not meeting 24 CFR 3285.310/505.`, ["p11", "p09"]);
    corrections.push(badVent ? "Adequate crawlspace venting needs to be provided per 24 CFR 3285.505." : "Skirting and venting need to be repaired per 24 CFR 3285.505.");
  }

  return { tagLine, findings, corrections };
}
