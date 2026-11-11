"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { writeAudit } from "@/lib/audit";
import { failed, type FormState } from "@/lib/forms";
import { MAX_CONTRACT_PDF_BYTES, MAX_CONTRACT_PDF_MB } from "@/lib/privacy";
import { deleteFile, isPdf, saveFile } from "@/lib/storage";

class ContractChanged extends Error {}

const CHANGED = "File kontrak ini baru saja diubah orang lain. Muat ulang halaman, lalu coba lagi.";

const contractWithFile = (contractId: string) =>
  db.contract.findUnique({
    where: { id: contractId },
    select: {
      contractNumber: true,
      employeeId: true,
      documentId: true,
      document: { select: { id: true, version: true, fileKey: true, fileName: true, sizeBytes: true } },
      employee: { select: { anonymizedAt: true } },
    },
  });

// Attaches the signed contract PDF to a contract. Only the newest file is kept, to save
// disk space: uploading again replaces the old file, and the audit log records what it was.
export async function uploadContractDocument(contractId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "HR");

  const contract = await contractWithFile(contractId);
  if (!contract) return { message: "Kontrak tidak ditemukan." };
  if (contract.employee.anonymizedAt) return { message: "Data karyawan ini sudah dianonimkan dan tidak bisa diubah." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return failed(formData, { file: ["Pilih file PDF kontrak."] });
  if (file.size > MAX_CONTRACT_PDF_BYTES) return failed(formData, { file: [`Ukuran file maksimal ${MAX_CONTRACT_PDF_MB} MB.`] });
  const data = Buffer.from(await file.arrayBuffer());
  if (!isPdf(data)) return failed(formData, { file: ["File harus berformat PDF."] });

  const old = contract.document;
  const version = (old?.version ?? 0) + 1;
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
          uploadedById: user.id,
        },
        select: { id: true },
      });
      // Only if nobody attached or removed a file since we read the contract
      const moved = await tx.contract.updateMany({
        where: { id: contractId, documentId: contract.documentId },
        data: { documentId: doc.id },
      });
      if (moved.count !== 1) throw new ContractChanged();
      if (old) await tx.document.delete({ where: { id: old.id } });
    });
  } catch (error) {
    await deleteFile(fileKey);
    if (error instanceof ContractChanged) return { message: CHANGED };
    console.error("uploadContractDocument failed", error);
    return failed(formData, undefined, "Gagal menyimpan file. Coba lagi.");
  }
  // The database no longer points at the old file, so removing it from disk is safe
  if (old) await deleteFile(old.fileKey);

  await writeAudit({
    actorId: user.id,
    action: "contract.document_uploaded",
    entityType: "Contract",
    entityId: contractId,
    changes: {
      version,
      fileName,
      sizeBytes: data.length,
      ...(old && { replaced: { fileName: old.fileName, sizeBytes: old.sizeBytes } }),
    },
  });
  refresh();
  return { ok: true, message: old ? "File kontrak diganti. File lama sudah dihapus." : "File kontrak tersimpan.", attempt: Date.now() };
}

// Removes a wrongly uploaded file, e.g. before deleting an employee entered by mistake
export async function deleteContractDocument(contractId: string): Promise<{ message?: string }> {
  const user = await requireRole("ADMIN", "HR");

  const contract = await contractWithFile(contractId);
  if (!contract) return { message: "Kontrak tidak ditemukan." };
  if (contract.employee.anonymizedAt) return { message: "Data karyawan ini sudah dianonimkan dan tidak bisa diubah." };
  const doc = contract.document;
  if (!doc) return { message: "Kontrak ini tidak punya file." };

  try {
    await db.$transaction(async (tx) => {
      const cleared = await tx.contract.updateMany({ where: { id: contractId, documentId: doc.id }, data: { documentId: null } });
      if (cleared.count !== 1) throw new ContractChanged();
      await tx.document.delete({ where: { id: doc.id } });
    });
  } catch (error) {
    if (error instanceof ContractChanged) return { message: CHANGED };
    console.error("deleteContractDocument failed", error);
    return { message: "Gagal menghapus file. Coba lagi." };
  }
  await deleteFile(doc.fileKey);

  await writeAudit({
    actorId: user.id,
    action: "contract.document_deleted",
    entityType: "Contract",
    entityId: contractId,
    changes: { fileName: doc.fileName, sizeBytes: doc.sizeBytes, version: doc.version },
  });
  refresh();
  return {};
}
