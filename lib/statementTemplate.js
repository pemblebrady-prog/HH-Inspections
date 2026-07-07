function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// House & Home's own billing identity — fixed, evidenced by the real invoice sample.
const HOUSE_AND_HOME = {
  name: "House and Home Inspection Services",
  address: "11895 N Thornbush Dr",
  city: "Tucson", state: "AZ", zip: "85737-7814",
  phone: "520-599-7798",
};

// rows: [{ inspectionDate, propertyAddress, amountPaid }]
export function buildStatementHtml({ company, monthLabel, statementNumber, rows }) {
  const total = rows.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0);

  const lineRows = rows.map((r) => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ccc;">${esc(r.inspectionDate)}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;">${esc(r.propertyAddress)}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">1</td>
      <td style="padding:6px 10px;border:1px solid #ccc;text-align:right;">$${Number(r.amountPaid || 0).toFixed(2)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Calibri,Arial,sans-serif;color:#1a1a1a;font-size:12pt;max-width:700px;">

    <table style="width:100%;margin-bottom:20px;"><tr>
      <td style="vertical-align:top;">
        <h1 style="font-family:Georgia,serif;font-size:20px;margin:0;color:#132430;">${esc(HOUSE_AND_HOME.name)}</h1>
        <p style="margin:6px 0 0;font-size:10pt;">${esc(HOUSE_AND_HOME.address)}<br/>
           ${esc(HOUSE_AND_HOME.city)} ${esc(HOUSE_AND_HOME.state)} ${esc(HOUSE_AND_HOME.zip)}<br/>
           Phone: ${esc(HOUSE_AND_HOME.phone)}</p>
      </td>
      <td style="vertical-align:top;text-align:right;">
        <h2 style="font-family:Georgia,serif;font-size:16px;margin:0;color:#132430;">FOUNDATION INSPECTION STATEMENT</h2>
        <p style="margin:6px 0 0;font-size:10pt;">STATEMENT #: ${esc(statementNumber)}<br/>
           PERIOD: ${esc(monthLabel)}<br/>
           DATE: ${esc(new Date().toLocaleDateString("en-US"))}</p>
      </td>
    </tr></table>

    <p style="margin:0 0 4px;font-weight:bold;">BILL TO:</p>
    <p style="margin:0 0 20px;">
      ${company.billingContact ? esc(company.billingContact) + "<br/>" : ""}
      ${esc(company.name)}<br/>
      ${company.billingAddress ? esc(company.billingAddress) + "<br/>" : ""}
      ${(company.billingCity || company.billingState || company.billingZip) ? `${esc(company.billingCity)} ${esc(company.billingState)} ${esc(company.billingZip)}<br/>` : ""}
      ${company.email ? esc(company.email) : ""}
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
      <thead><tr style="background:#132430;color:#fff;">
        <th style="padding:8px 10px;text-align:left;">DATE</th>
        <th style="padding:8px 10px;text-align:left;">ADDRESS</th>
        <th style="padding:8px 10px;">QTY</th>
        <th style="padding:8px 10px;text-align:right;">AMOUNT</th>
      </tr></thead>
      <tbody>${lineRows || `<tr><td colspan="4" style="padding:14px;text-align:center;color:#888;border:1px solid #ccc;">No submissions recorded for this period.</td></tr>`}</tbody>
    </table>

    <table style="width:100%;">
      <tr><td style="text-align:right;padding:6px 10px;font-weight:bold;">PAYMENT DUE WITHIN 15 DAYS OF STATEMENT DATE</td>
          <td style="text-align:right;padding:6px 10px;font-weight:bold;width:110px;">TOTAL DUE</td></tr>
      <tr><td></td><td style="text-align:right;padding:2px 10px;font-size:14pt;font-weight:bold;border-top:2px solid #132430;">$${total.toFixed(2)}</td></tr>
    </table>

    <p style="margin-top:30px;">
      Checks: make payable to ${esc(HOUSE_AND_HOME.name)}<br/>
      And mail to ${esc(HOUSE_AND_HOME.address)}, ${esc(HOUSE_AND_HOME.city)}, ${esc(HOUSE_AND_HOME.state)}, ${esc(HOUSE_AND_HOME.zip)}<br/>
      ZELLE: send payment to ${esc(HOUSE_AND_HOME.phone)}
    </p>

    <p style="text-align:center;font-weight:bold;margin-top:30px;">THANK YOU FOR YOUR BUSINESS!</p>

    <p style="color:#aaa;font-size:9pt;margin-top:40px;">
      Generated automatically from submission records. Verify totals before sending.
    </p>
  </body></html>`;
}
