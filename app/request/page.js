import RequestForm from "./RequestForm";

export const metadata = {
  title: "Manufactured Home Engineering Inspection Request | House & Home",
  robots: { index: false, follow: false }, // hidden until it replaces the website form
};

export default function RequestPage() {
  return <RequestForm />;
}
