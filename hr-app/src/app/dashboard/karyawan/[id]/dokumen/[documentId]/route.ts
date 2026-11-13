import { siteDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { readFile } from "@/lib/storage";

// Opens one stored employee document (e.g. a signed contract) in the browser.
// Files live outside /public, so this handler is the only way in: Admin/HR only, every view audited.
export async function GET(_req: Request, { params }: RouteContext<"/dashboard/karyawan/[id]/dokumen/[documentId]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // The location comes from the session, so it is read only once the user is known
  const db = await siteDb();
  if (user.role !== "ADMIN" && user.role !== "HR") return new Response("Forbidden", { status: 403 });

  const { id, documentId } = await params;
  const doc = await db.document.findFirst({
    where: { id: documentId, employeeId: id },
    select: { fileKey: true, fileName: true, mimeType: true },
  });
  if (!doc) return new Response("Not found", { status: 404 });

  const data = await readFile(doc.fileKey);
  await writeAudit({ actorId: user.id, action: "document.viewed", entityType: "Document", entityId: documentId });

  const asciiName = doc.fileName.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
