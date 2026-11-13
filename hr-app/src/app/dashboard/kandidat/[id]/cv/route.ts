import { siteDb } from "@/lib/db";
import { canAccessApplication, getCurrentUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { readFile } from "@/lib/storage";

// Streams the latest CV of an application. Files live outside /public, so this
// handler is the only way to get them, and every download is audited.
export async function GET(_req: Request, { params }: RouteContext<"/dashboard/kandidat/[id]/cv">) {
  const db = await siteDb();
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!(await canAccessApplication(user, id))) return new Response("Not found", { status: 404 });

  const resume = await db.resume.findFirst({
    where: { applicationId: id },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, fileKey: true, fileName: true, mimeType: true },
  });
  if (!resume) return new Response("Not found", { status: 404 });

  const data = await readFile(resume.fileKey);
  await writeAudit({ actorId: user.id, action: "resume.downloaded", entityType: "Resume", entityId: resume.id });

  const asciiName = resume.fileName.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": resume.mimeType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(resume.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
