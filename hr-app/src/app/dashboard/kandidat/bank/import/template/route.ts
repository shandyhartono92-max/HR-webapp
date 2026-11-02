import { getCurrentUser } from "@/lib/dal";
import { buildImportTemplate } from "@/lib/candidate-import";

// Empty Excel template for the candidate import. Admin/HR only.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "HR") return new Response("Forbidden", { status: 403 });

  const data = await buildImportTemplate();
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-import-kandidat.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
