import LegalPage, { BUSINESS, CONTACT_EMAIL, CONTACT_PHONE } from "../LegalPage";

export const metadata = { title: "Privacy Policy | House & Home Inspector Portal" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains how {BUSINESS} ("House &amp; Home", "we") collects, uses and protects information in the House &amp; Home Inspector Portal (the "Portal"): the website and app used to request inspections, submit manufactured home foundation inspections, and receive engineering certification letters.</p>

      <h2>Information we collect</h2>
      <ul>
        <li><b>Account information:</b> name, email address, phone number, company, role, and for inspectors their Arizona certificate number; for engineers their professional license details and stamp/signature images.</li>
        <li><b>Inspection requests:</b> the requester's name, company, contact details and address; the property address; occupant contact details; access and safety notes (including gate or lockbox codes); report recipients; and comments.</li>
        <li><b>Inspection submissions:</b> property address, client name, home details, checklist answers, photos, home sketches and comments.</li>
        <li><b>Location:</b> when an inspector opens an assigned job, the app may ask the phone for its location to check that the inspector is at the right property. The location is compared with the job address and is not stored.</li>
        <li><b>Payment information:</b> card and bank account details are entered into and kept by our payment processor, Stripe. We receive only limited details such as the card brand or bank name, the last four digits, and payment status.</li>
        <li><b>Technical information:</b> sign-in sessions and basic logs needed to keep the Portal secure and working. Photos and drafts may be saved on your own device until they finish uploading.</li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To schedule and perform inspections, review submissions, and prepare, certify and deliver engineering letters.</li>
        <li>To create and manage accounts and send sign-in codes, invitations, alerts, receipts, statements and letters by email.</li>
        <li>To charge for certifications and keep payment and activity records.</li>
        <li>To check photos for quality and read information such as HUD label numbers from them, to help inspectors and reduce errors.</li>
        <li>To keep the Portal secure, prevent misuse, and meet legal and record-keeping requirements.</li>
      </ul>
      <p>We do not sell personal information and do not use it for advertising.</p>

      <h2>Google account data</h2>
      <p>The Portal connects to our own Google account to store files in Google Drive (job photos, sketches, letters and PDFs) and to send email through Gmail. The Gmail connection only allows sending messages; the Portal does not read, store or analyze any mailbox. The Drive connection is used only to create and manage the Portal's own files. Use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Google user data is not shared with others except as needed to provide the Portal's features, is not used for advertising, and is not used to train artificial intelligence models.</p>

      <h2>Who we share information with</h2>
      <ul>
        <li><b>People involved in the job:</b> the reviewing engineer, the inspector and their company, and the report recipients named on the job.</li>
        <li><b>Service providers</b> that run the Portal on our behalf: Supabase (accounts and database), Vercel (hosting), Google (file storage and email), Stripe (payments), Resend (email delivery, if used), Anthropic (automated photo checks), and the U.S. Census Bureau and OpenStreetMap (turning addresses into map locations). They may use the information only to provide their services to us.</li>
        <li><b>When required:</b> to comply with law, legal process, or professional licensing requirements, or to protect rights and safety.</li>
      </ul>

      <h2>How long we keep information</h2>
      <p>Inspection records, photos and certification letters are kept as long as needed for professional and legal record-keeping. Photos that were uploaded but never submitted are deleted after about two weeks. Account information is kept while the account is active and for a reasonable period afterward.</p>

      <h2>Security</h2>
      <p>Access to the Portal is by invitation, with sign-in codes sent by email. Information is sent over encrypted connections, access is limited by role, and payment details are handled by Stripe. No system is perfectly secure, but we work to protect your information.</p>

      <h2>Your choices</h2>
      <p>You can ask us to see, correct or delete your personal information, subject to records we must keep. Location access can be turned off in your phone's settings; the Portal works without it.</p>

      <h2>Children</h2>
      <p>The Portal is for business use and is not directed to children under 13.</p>

      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows the latest version.</p>

      <h2>Contact</h2>
      <p>{BUSINESS} · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · <a href={`tel:${CONTACT_PHONE.replace(/-/g, "")}`}>{CONTACT_PHONE}</a></p>
    </LegalPage>
  );
}
