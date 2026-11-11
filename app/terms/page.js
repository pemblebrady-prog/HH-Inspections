import LegalPage, { BUSINESS, CONTACT_EMAIL, CONTACT_PHONE } from "../LegalPage";

export const metadata = { title: "Terms of Service | House & Home Inspector Portal" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>These terms apply to the House &amp; Home Inspector Portal (the "Portal"), operated by {BUSINESS} ("House &amp; Home", "we"). By using the Portal you agree to them. If you use it for a company, you agree for that company.</p>

      <h2>The service</h2>
      <p>The Portal lets lenders and others request manufactured home foundation inspections, lets inspectors submit inspection information and photos, and lets House &amp; Home's licensed engineer review submissions and issue engineering certification letters.</p>

      <h2>Accounts</h2>
      <ul>
        <li>Accounts are by invitation. Keep access to your email secure, since sign-in codes are sent there, and tell us if you think your account has been misused.</li>
        <li>Company owners are responsible for the people they invite and for jobs submitted under their company.</li>
        <li>We may suspend or close accounts or companies that misuse the Portal or don't pay.</li>
      </ul>

      <h2>Your submissions</h2>
      <ul>
        <li>You are responsible for the accuracy and completeness of what you submit: measurements, answers, photos and sketches. Photos must be of the property inspected and taken at the time of the inspection.</li>
        <li>You allow House &amp; Home to store and use your submissions to review the job, prepare and deliver letters, and keep records.</li>
        <li>Certification letters are based on the information and photos submitted. The engineer may ask for more information, require corrections, or decline to certify. A letter reflects the conditions documented at the time of the inspection and is not a guarantee of the home's future condition.</li>
      </ul>

      <h2>Fees and payment</h2>
      <ul>
        <li>Certification fees are shown in the Portal and may be set per company. We may change fees for future jobs; we'll tell company owners before a change applies to them.</li>
        <li>Companies with a saved payment method authorize us to charge it, through Stripe, for each job they submit. Pay-as-you-go jobs are paid by card before review begins. Jobs may be held until payment succeeds.</li>
        <li>For inspections requested from House &amp; Home, the payment, cancellation and return-trip terms in the request confirmation apply.</li>
        <li>Monthly statements are activity summaries. Questions about a charge: contact us within 60 days.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Don't misuse the Portal: no false or misleading submissions, no access to others' accounts or data, no attempts to break or overload the service, and no unlawful use.</p>

      <h2>Availability</h2>
      <p>We work to keep the Portal available and your data safe, but the Portal is provided "as is" and may sometimes be unavailable. Keep your own copies of anything you need.</p>

      <h2>Limitation of liability</h2>
      <p>To the extent allowed by law, House &amp; Home is not liable for indirect or consequential damages arising from use of the Portal, and our total liability for any claim about the Portal is limited to the fees paid for the job involved. Nothing here limits responsibilities that cannot be limited under Arizona law or applicable professional rules.</p>

      <h2>Privacy</h2>
      <p>Our <a href="/privacy">Privacy Policy</a> explains how we handle information.</p>

      <h2>Changes and governing law</h2>
      <p>We may update these terms; the date at the top shows the latest version, and continued use means you accept the update. These terms are governed by the laws of the State of Arizona.</p>

      <h2>Contact</h2>
      <p>{BUSINESS} · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · <a href={`tel:${CONTACT_PHONE.replace(/-/g, "")}`}>{CONTACT_PHONE}</a></p>
    </LegalPage>
  );
}
