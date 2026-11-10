"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { MAX_CONTRACT_PDF_BYTES } from "@/lib/privacy";
import { deleteFile, isPdf, saveFile } from "@/lib/storage";

class ContractChanged extends Error {}

// Attaches the signed contract PDF to a contract. Uploading again adds a new version:
// the contract points at the newest file, older files stay as evidence (Document.previousId).
export async function uploadContractDocument(contractId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const contract = await db.contract.findUnique({
    where: { id: contractId },
    select: {
      contractNumber: true,
      employeeId: true,
      documentId: true,
      document: { select: { version: true } },
      employee: { select: { anonymizedAt: true } },
    },
  });
  if (!contract) return { message: "Kontrak tidak ditemukan." };
  if (contract.employee.anonymizedAt) return { message: "Data karyawan ini sudah dianonimkan dan tidak bisa diubah." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return failed(formData, { file: ["Pilih file PDF kontrak."] });
  if (file.size > MAX_CONTRACT_PDF_BYTES) return failed(formData, { file: ["Ukuran file maksimal 10 MB."] });
  const data = Buffer.from(await file.arrayBuffer());
  if (!isPdf(data)) return failed(formData, { file: ["File harus berformat PDF."] });

  const version = (contract.document?.version ?? 0) + 1;
  const fileName = file.name.slice(0, 200) || `kontrak-${contract.contractNumber}.pdf`;
  const fileKey = await saveFile("contracts", data, "pdf");
  try {
    await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          employeeId: contract.employeeId,
          type: "CONTRACT",
          title: `Kontrak ${contract.contractNumber}`.slice(0, 255),
          fileKey,
          fileName,
          mimeType: "application/pdf",
          sizeBytes: data.length,
          version,
          previousId: contract.documentId,
          uploadedById: user.id,
        },
        select: { id: true },
      });
      // Only if nobody attached another file since we read the contract
      const moved = await tx.contract.updateMany({
        where: { id: contractId, documentId: contract.documentId },
        data: { documentId: doc.id },
      });
      if (moved.count !== 1) throw new ContractChanged();
    });
  } catch (error) {
    await deleteFile(fileKey);
    // P2002: another upload already took this version as its previous one
    if (error instanceof ContractChanged || (error as { code?: string }).code === "P2002") {
      return { message: "File kontrak ini baru saja diganti orang lain. Muat ulang halaman, lalu coba lagi." };
    }
    console.error("uploadContractDocument failed", error);
    return failed(formData, undefined, "Gagal menyimpan file. Coba lagi.");
  }

  await writeAudit({
    actorId: user.id,
    action: "contract.document_uploaded",
    entityType: "Contract",
    entityId: contractId,
    changes: { version, fileName, sizeBytes: data.length },
  });
  refresh();
  return { ok: true, message: version > 1 ? `File kontrak diganti (versi ${version}).` : "File kontrak tersimpan.", attempt: Date.now() };
}
