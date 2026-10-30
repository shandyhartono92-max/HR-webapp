// Shape of InterviewKit.content. Shared by the browser editor, server-side
// validation of manual edits, and the AI structured-output format.
import * as z from "zod";

export const questionTypes = ["perilaku", "situasional", "teknis"] as const;

export const KitQuestion = z.object({
  competency: z.string().describe("Kompetensi yang diukur, misal: Ketelitian"),
  type: z.enum(questionTypes).describe("perilaku = pengalaman nyata (STAR); situasional = skenario; teknis = pengetahuan kerja"),
  question: z.string().describe("Pertanyaan dalam Bahasa Indonesia, ditujukan kepada kandidat (Anda)"),
  lookFor: z.array(z.string()).describe("Hal yang menandakan jawaban baik"),
  rubric: z.object({
    kurang: z.string().describe("Contoh jawaban bernilai 1"),
    cukup: z.string().describe("Contoh jawaban bernilai 3"),
    baik: z.string().describe("Contoh jawaban bernilai 5"),
  }),
  followUps: z.array(z.string()).describe("1-2 pertanyaan pendalaman"),
});

export const JobKitContent = z.object({
  competencies: z.array(z.string()),
  questions: z.array(KitQuestion),
  notes: z.string().describe("Catatan singkat untuk pewawancara"),
});
export type JobKit = z.infer<typeof JobKitContent>;
export type KitQuestionT = z.infer<typeof KitQuestion>;

export const CandidateQuestionsContent = z.object({
  questions: z.array(
    z.object({
      question: z.string().describe("Pertanyaan untuk kandidat"),
      reason: z.string().describe("Kekurangan atau klaim di hasil seleksi CV yang ingin diverifikasi"),
    }),
  ),
});
export type CandidateQuestions = z.infer<typeof CandidateQuestionsContent>;

// Stricter checks for what HR saves by hand (AI output is checked by the same shape)
const text = (max: number) => z.string().trim().min(1, { error: "Wajib diisi." }).max(max);
export const JobKitSave = z.object({
  competencies: z.array(text(80)).max(10),
  questions: z
    .array(
      z.object({
        competency: text(80),
        type: z.enum(questionTypes),
        question: text(600),
        lookFor: z.array(text(300)).max(8),
        rubric: z.object({ kurang: text(400), cukup: text(400), baik: text(400) }),
        followUps: z.array(text(300)).max(5),
      }),
    )
    .min(1, { error: "Minimal 1 pertanyaan." })
    .max(20, { error: "Maksimal 20 pertanyaan." }),
  notes: z.string().trim().max(1000),
});

export const emptyQuestion = (): KitQuestionT => ({
  competency: "",
  type: "perilaku",
  question: "",
  lookFor: [""],
  rubric: { kurang: "", cukup: "", baik: "" },
  followUps: [],
});
