import { requireUser } from "../../../lib/supabase/server";
import { getDrive } from "../../../lib/drive";

export const runtime = "nodejs";

// Company logo images, served through the portal (Drive "uc?export=view" links are unreliable).
// Admins can load any logo; others only their own company's.
export async function GET(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id");
  const drive = getDrive();
  if (!id || !/^[\w-]+$/.test(id) || !drive) return new Response("Not found", { status: 404 });
  const me = auth.profile;
  if (me && me.role !== "admin" && me.role !== "engineer" && !(me.company && me.company.logo_drive_file_id === id)) return new Response("Not found", { status: 404 });
  try {
    const meta = await drive.files.get({ fileId: id, fields: "mimeType", supportsAllDrives: true });
    const mime = meta.data.mimeType || "image/png";
    if (!mime.startsWith("image/")) return new Response("Not an image", { status: 400 });
    const res = await drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    return new Response(Buffer.from(res.data), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
