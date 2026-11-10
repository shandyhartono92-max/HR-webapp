// Trainee employee numbers. While training, the number starts with T (T001, T-001);
// the day after the training ends the app drops the T (src/lib/training-job.ts).
// Pure functions, checked by scripts/check-training.mts.

const TRAINEE = /^t[-_ ]?(?=\d)/i;

export const isTraineeNumber = (employeeNumber: string) => TRAINEE.test(employeeNumber.trim());

// "T001" → "001", "t-001" → "001"; null when the number is not a trainee number
export function graduatedNumber(employeeNumber: string): string | null {
  const trimmed = employeeNumber.trim();
  return TRAINEE.test(trimmed) ? trimmed.replace(TRAINEE, "") : null;
}

// Training is over the day after trainingEnd (WIB calendar day, as `today` from todayDate())
export const trainingOver = (trainingEnd: Date, today: Date) => trainingEnd.getTime() < today.getTime();

export type TrainingFields = { employeeNumber: string; trainingStart: Date | null; trainingEnd: Date | null };
export type TrainingErrors = Partial<Record<"employeeNumber" | "trainingStart" | "trainingEnd", string[]>>;

// The rules every form and the Excel import share
export function trainingErrors({ employeeNumber, trainingStart, trainingEnd }: TrainingFields, today: Date): TrainingErrors {
  const errors: TrainingErrors = {};
  if (Boolean(trainingStart) !== Boolean(trainingEnd)) {
    errors[trainingStart ? "trainingEnd" : "trainingStart"] = ["Isi tanggal mulai dan selesai training, atau kosongkan keduanya."];
    return errors;
  }
  if (trainingStart && trainingEnd && trainingEnd < trainingStart) {
    errors.trainingEnd = ["Selesai training tidak boleh sebelum mulai training."];
    return errors;
  }
  const trainee = isTraineeNumber(employeeNumber);
  if (trainee && !trainingEnd) {
    errors.trainingStart = ["Employee ID berawalan T menandakan training: isi tanggal mulai dan selesai training."];
  }
  if (!trainee && trainingEnd && !trainingOver(trainingEnd, today)) {
    errors.employeeNumber = ["Selama training, Employee ID harus berawalan T (misal T001)."];
  }
  return errors;
}

// Shown as "Training" until the T is dropped (or HR clears the dates)
export const isInTraining = (e: { employeeNumber: string; trainingEnd: Date | null; traineeNumber: string | null }) =>
  Boolean(e.trainingEnd) && !e.traineeNumber && isTraineeNumber(e.employeeNumber);
