function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildReceiptEmailHtml({ submissionId, inspectorName, clientName, propertyAddress, inspectionDate, amountPaid }) {
  const row = (label, value) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e6e0d0;color:#5c6b74;font-size:14px;">${esc(label)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e6e0d0;color:#132430;font-size:14px;text-align:right;">${esc(value)}</td>
    </tr>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#E7E0D0;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E7E0D0;padding:30px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#FBF8F1;border:1px solid #c9bfa8;border-radius:8px;">
        <tr><td style="padding:26px 30px 6px;border-bottom:2px solid #132430;">
          <span style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#132430;">House and Home</span>
          <span style="font-family:Georgia,serif;font-size:22px;color:#2C6E8C;"> &amp; Inspections</span>
        </td></tr>
        <tr><td style="padding:24px 30px 6px;">
          <p style="margin:0 0 14px;color:#132430;font-size:15px;">Hi ${esc(inspectorName || "there")},</p>
          <p style="margin:0 0 20px;color:#132430;font-size:15px;line-height:1.5;">
            This confirms we received your <b>$${Number(amountPaid || 0).toFixed(2)}</b> payment for the manufactured
            home engineering certification submission below. Your report is now in the engineer's queue.
          </p>
        </td></tr>
        <tr><td style="padding:0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${row("Submission ID", submissionId)}
            ${row("Client", clientName)}
            ${row("Property address", propertyAddress)}
            ${row("Date inspected", inspectionDate)}
            ${row("Amount paid", "$" + Number(amountPaid || 0).toFixed(2))}
          </table>
        </td></tr>
        <tr><td style="padding:22px 30px 30px;">
          <p style="margin:0;color:#5c6b74;font-size:13px;line-height:1.5;">
            You'll receive the certified letter within the next several business days at this email address.
            Questions? Just reply to this email.
          </p>
        </td></tr>
        <tr><td style="padding:16px 30px;background:#132430;border-radius:0 0 7px 7px;">
          <p style="margin:0;color:#9FD4E8;font-size:12px;">House and Home AZ Inspection Service · 520-245-7897</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}
