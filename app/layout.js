import "./globals.css";

export const metadata = {
  title: "Inspector Portal — Manufactured Home Engineering Certification | House & Home",
  description: "Submit manufactured home foundation certification photos and checklist.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
