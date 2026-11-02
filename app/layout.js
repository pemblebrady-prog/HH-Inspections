import "./globals.css";
import InstallPrompt from "./InstallPrompt";

export const metadata = {
  title: "Inspector Portal — Manufactured Home Engineering Certification | House & Home",
  description: "Submit manufactured home foundation certification photos and checklist.",
  manifest: "/manifest.webmanifest",
  applicationName: "H&H Portal",
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "H&H Portal", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#132430",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
