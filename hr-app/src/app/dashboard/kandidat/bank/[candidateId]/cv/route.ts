import { siteDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { readFile } from "@/lib/storage";

// Latest CV of a bank-data candidate (stored on the candidate or on any application). Admin/HR, audited.
export async function GET(_req: Request, { params }: RouteContext<"/dashboard/kandidat/bank/[candidateId]/cv">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // The location comes from the session, so it is read only once the user is known
  const db = await siteDb();
  if (user.role !== "ADMIN" && user.role !== "HR") return new Response("Forbidden", { status: 403 });

  const { candidateId } = await params;
  const resume = await db.resume.findFirst({
    where: { OR: [{ candidateId }, { application: { candidateId } }] },
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
