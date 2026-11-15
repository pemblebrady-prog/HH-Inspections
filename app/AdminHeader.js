import AppHeader from "./AppHeader";

// Shared top bar for admin pages.
export default function AdminHeader({ title, profile }) {
  return <AppHeader title={title} profile={profile} wide />;
}
