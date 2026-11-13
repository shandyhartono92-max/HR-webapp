import { siteDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { readFile } from "@/lib/storage";

// Letters can contain salary (offers) and disciplinary details (SP): Admin/HR only, every download audited
export async function GET(_req: Request, { params }: RouteContext<"/dashboard/surat/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // The location comes from the session, so it is read only once the user is known
  const db = await siteDb();
  if (user.role !== "ADMIN" && user.role !== "HR") return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const letter = await db.letter.findUnique({ where: { id }, select: { letterNumber: true, fileKey: true } });
  if (!letter?.fileKey) return new Response("Not found", { status: 404 });

  const data = await readFile(letter.fileKey);
  await writeAudit({ actorId: user.id, action: "letter.downloaded", entityType: "Letter", entityId: id });

  const fileName = `${letter.letterNumber.replace(/[^\w.-]+/g, "-")}.pdf`;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
