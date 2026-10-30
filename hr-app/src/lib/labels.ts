// Indonesian UI labels for enum values. Keep all user-facing enum text here.
import type {
  ApplicationStage,
  EmployeeStatus,
  EmploymentType,
  Gender,
  InterviewMode,
  JobStatus,
  LetterType,
  PtkpStatus,
  Role,
  ScreeningDecision,
} from "@/generated/prisma/enums";

export const roleLabel: Record<Role, string> = {
  ADMIN: "Admin",
  HR: "HR",
  HIRING_MANAGER: "Hiring Manager",
  EMPLOYEE: "Karyawan",
};

export const jobStatusLabel: Record<JobStatus, string> = {
  DRAFT: "Draf",
  OPEN: "Dibuka",
  CLOSED: "Ditutup",
};

export const employmentTypeLabel: Record<EmploymentType, string> = {
  PKWT: "Kontrak (PKWT)",
  PKWTT: "Tetap (PKWTT)",
  MAGANG: "Magang",
  HARIAN_LEPAS: "Harian Lepas",
};

export const stageLabel: Record<ApplicationStage, string> = {
  APPLIED: "Melamar",
  SCREENING: "Seleksi CV",
  INTERVIEW: "Wawancara",
  OFFER: "Penawaran",
  HIRED: "Diterima",
  REJECTED: "Ditolak",
  WITHDRAWN: "Mengundurkan Diri",
};

export const educationLevels = ["SMA/SMK", "D3", "D4", "S1", "S2", "S3"] as const;

export const applicationSources = {
  website: "Website perusahaan",
  linkedin: "LinkedIn",
  jobstreet: "JobStreet",
  glints: "Glints",
  kalibrr: "Kalibrr",
  referral: "Referensi karyawan",
  other: "Lainnya",
} as const;

// Channels for candidates that HR adds by hand (bank data)
export const manualSources = {
  email: "CV via email",
  whatsapp: "CV via WhatsApp",
  job_fair: "Job fair / bursa kerja",
  referral: "Referensi karyawan",
  campus: "Kampus / magang",
  linkedin_hr: "LinkedIn (dihubungi HR)", // distinct from the careers form's "linkedin" (candidate applied)
  walk_in: "Datang langsung",
  other: "Lainnya",
} as const;

export const sourceLabel = (source: string | null | undefined) =>
  !source
    ? "-"
    : ((applicationSources as Record<string, string>)[source] ??
      (manualSources as Record<string, string>)[source] ??
      (source === "bank_data" ? "Bank data kandidat" : source));

export const pipelineStages: ApplicationStage[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED"];

export const decisionLabel: Record<ScreeningDecision, string> = {
  PROCEED: "Lanjutkan",
  HOLD: "Tahan",
  REJECT: "Tidak sesuai",
};

export const interviewModeLabel: Record<InterviewMode, string> = {
  ONLINE: "Online",
  ONSITE: "Tatap muka",
};

export const employeeStatusLabel: Record<EmployeeStatus, string> = {
  PROBATION: "Masa percobaan",
  ACTIVE: "Aktif",
  RESIGNED: "Mengundurkan diri",
  TERMINATED: "Diberhentikan",
  CONTRACT_ENDED: "Kontrak berakhir",
};

export const letterTypeLabel: Record<LetterType, string> = {
  SP1: "Surat Peringatan 1",
  SP2: "Surat Peringatan 2",
  SP3: "Surat Peringatan 3",
  SURAT_KETERANGAN_KERJA: "Surat Keterangan Kerja",
  PAKLARING: "Paklaring",
  OFFER_LETTER: "Surat Penawaran Kerja",
  OTHER: "Lainnya",
};

export const genderLabel: Record<Gender, string> = { L: "Laki-laki", P: "Perempuan" };

export const ptkpLabel: Record<PtkpStatus, string> = {
  TK0: "TK/0 – tidak kawin, tanpa tanggungan",
  TK1: "TK/1 – tidak kawin, 1 tanggungan",
  TK2: "TK/2 – tidak kawin, 2 tanggungan",
  TK3: "TK/3 – tidak kawin, 3 tanggungan",
  K0: "K/0 – kawin, tanpa tanggungan",
  K1: "K/1 – kawin, 1 tanggungan",
  K2: "K/2 – kawin, 2 tanggungan",
  K3: "K/3 – kawin, 3 tanggungan",
};

// All times are shown and entered in WIB. Change if the company works in WITA/WIT.
export const TIME_ZONE = "Asia/Jakarta";
const TZ_OFFSET = "+07:00";

const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const rupiahFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const longDateFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE });

export const formatDate = (d: Date) => dateFormatter.format(d);
export const formatDateLong = (d: Date) => longDateFormatter.format(d); // "30 Oktober 2026", for letters
export const formatDateTime = (d: Date) => `${dateTimeFormatter.format(d)} WIB`;
export const formatRupiah = (n: number) => rupiahFormatter.format(n);

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days from now until `d` (negative when past). Server components render per request.
export const daysUntil = (d: Date) => Math.ceil((d.getTime() - Date.now()) / DAY_MS);

// Interviews can get feedback from one hour before their start time
export const isFeedbackOpen = (scheduledAt: Date) => scheduledAt.getTime() <= Date.now() + 60 * 60 * 1000;

// <input type="datetime-local"> value ("2026-11-03T10:00") read as WIB
export function parseLocalDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00${TZ_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// <input type="date"> value ("2026-11-03") for @db.Date columns
export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
