import { adminOnly } from "../../../lib/adminOnly";

export const dynamic = "force-dynamic";

export default async function AdminSection({ children }) {
  await adminOnly("/admin/orders");
  return children;
}
