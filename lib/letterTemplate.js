import { SINGLE, MULTI, PHOTO_SLOTS } from "./formConfig.js";

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function label(list, id, val) {
  return val || "—";
}
function multiLine(m, f) {
  const vals = f[m.id];
  return vals && vals.length ? vals.map(esc).join(", ") : "Not recorded";
}

// Default letterhead — your brother's own business, evidenced by his own report samples.
const DEFAULT_COMPANY = {
  name: "House and Home AZ Inspection Service",
  phone: "520-245-7897",
  email: "houseandhomeengineering@gmail.com",
};
const ENGINEER_NAME = "Ron Rath, Professional Engineer";

// images: [{ label, dataUri }] in report order (sketch first, then each photo slot in PHOTO_SLOTS order)
export function buildLetterHtml({ report: f, company, logoDataUri, images }) {
  const co = company || DEFAULT_COMPANY;
  const headerBlock = logoDataUri
    ? `<img src="${logoDataUri}" style="max-height:70px;max-width:320px;" alt="${esc(co.name)}" />`
    : `<h1 style="font-family:Georgia,serif;font-size:32px;margin:0;">${esc(co.name)}</h1>`;

  const single = Object.fromEntries(SINGLE.map((s) => [s.id, s]));

  const findingsRows = MULTI.map((m) => `
    <tr><td style="padding:4px 10px;border:1px solid #ccc;"><b>${esc(m.label)}</b></td>
        <td style="padding:4px 10px;border:1px solid #ccc;">${multiLine(m, f)}</td></tr>`).join("");

  const homeTypeLine = f.homeType ? `Listed: ${esc(f.homeType)}` : "Listed: —";
  const dims = (f.lengthFt || f.widthFt) ? `Dimensions: ${esc(f.lengthFt || "—")}' x ${esc(f.widthFt || "—")}'` : "";

  const photoSections = images.map((img) => `
    <div style="margin:22px 0;">
      <h3 style="font-family:Georgia,serif;color:#1d3543;font-size:16px;margin:0 0 8px;">${esc(img.label)}</h3>
      <img src="${img.dataUri}" style="max-width:520px;width:100%;border:1px solid #ccc;" />
      <p style="font-style:italic;color:#888;margin:8px 0 0;">[Engineer's observation — add finding for this photo]</p>
    </div>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Calibri,Arial,sans-serif;color:#1a1a1a;font-size:12pt;max-width:700px;">

    <div style="border-bottom:2px solid #1d3543;padding-bottom:10px;margin-bottom:16px;">
      ${headerBlock}
    </div>

    <table style="width:100%;margin-bottom:16px;"><tr>
      <td style="vertical-align:top;width:50%;">
        <p><i>Date of Inspection:</i> ${esc(f.date || "—")}<br/>
           <i>Date of Re-inspection:</i> ____________________<br/>
           <i>Address:</i> ${esc(f.propertyAddress || "—")}</p>
      </td>
      <td style="vertical-align:top;width:50%;">
        <p><i>Type of Inspection:</i> Manufactured Home Foundation Inspection<br/><br/>
           <i>Licensed Inspector:</i> ${ENGINEER_NAME}<br/>
           <i>Client:</i> ${esc(f.clientName || "—")}</p>
      </td>
    </tr></table>

    <p>Dear: To whom it may concern</p>

    <p><b>Property Description:</b><br/>
      Listed Year built: ${esc(f.ageOfHome || "—")}<br/>
      ${homeTypeLine}<br/>
      ${dims}<br/>
      Loan type: ${esc(f.inspectionType || "—")}</p>

    <p>The Property listed above has been inspected per current state standards for foundation and piers
       which includes any attached structures such as additions and porches.</p>

    <p><b>Certification tags:</b> ${esc(single.certTags ? f.certTags : "") || "—"}
       <br/><i>[If tag numbers were recorded, add them here — e.g. "HUD Tags ARZ 123456, ARZ 123457"]</i></p>

    <p><b>Front of house faces:</b> ${esc(f.frontFaces || "—")} &nbsp;|&nbsp;
       <b>Home type:</b> ${esc(f.homeType || "—")} &nbsp;|&nbsp;
       <b>Attached structures:</b> ${esc(f.attached || "—")} &nbsp;|&nbsp;
       <b>Rain in last 3 days:</b> ${esc(f.rain3 || "—")}</p>

    <h2 style="font-family:Georgia,serif;color:#1d3543;font-size:18px;border-bottom:1px solid #ccc;padding-bottom:4px;">
      Findings summary (as recorded by the field inspector)
    </h2>
    <table style="border-collapse:collapse;margin-bottom:8px;">
      <tr><td style="padding:4px 10px;border:1px solid #ccc;"><b>Tie Downs</b></td>
          <td style="padding:4px 10px;border:1px solid #ccc;">${esc(f.tieDowns || "Not recorded")}</td></tr>
      ${findingsRows}
    </table>
    <p style="font-style:italic;color:#888;">These are the field inspector's raw observations, not yet a compliance determination.</p>

    ${f.generalComments ? `<p><b>Inspector's general comments:</b><br/>${esc(f.generalComments)}</p>` : ""}

    <h2 style="font-family:Georgia,serif;color:#1d3543;font-size:18px;border-bottom:1px solid #ccc;padding-bottom:4px;">
      Photo documentation
    </h2>
    ${photoSections || "<p><i>No photos were uploaded with this submission.</i></p>"}

    <h2 style="font-family:Georgia,serif;color:#1d3543;font-size:18px;border-bottom:1px solid #ccc;padding-bottom:4px;">
      Engineer's findings &amp; certification
    </h2>
    <p style="background:#fff8e1;border:1px dashed #c9a227;padding:10px 14px;">
      <b>[ENGINEER TO COMPLETE]</b> — Insert compliance findings, applicable code citations, and either the
      standard compliance paragraph or an "Areas requiring corrections to be HUD compliant" list, as appropriate.
    </p>

    <table style="width:100%;margin-top:40px;"><tr>
      <td style="vertical-align:bottom;width:60%;">
        <p>${esc(co.name)}<br/>Ron Rath, Professional Engineer<br/>${esc(co.phone || "—")}<br/>${esc(co.email || "—")}</p>
      </td>
      <td style="vertical-align:bottom;width:40%;text-align:right;">
        <p style="color:#888;">[PE stamp &amp; signature]<br/>Date signed: ____________________</p>
      </td>
    </tr></table>

    <p style="color:#aaa;font-size:9pt;margin-top:30px;">
      DRAFT generated automatically from the inspector's submission. Review and complete all bracketed sections before sending.
    </p>
  </body></html>`;
}
