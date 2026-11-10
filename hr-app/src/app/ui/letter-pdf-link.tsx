// "PDF" link for an issued letter, or a note once retention removed its file
export function LetterPdfLink({ letterId, hasFile }: { letterId: string; hasFile: boolean }) {
  if (!hasFile) return <span className="text-xs text-slate-400">PDF dihapus (retensi)</span>;
  return (
    <a href={`/dashboard/surat/${letterId}/pdf`} target="_blank" className="text-brand-700 hover:underline">
      PDF
    </a>
  );
}
