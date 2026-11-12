// A new employee (manual form, Excel import, hire form) always starts Aktif or
// Masa percobaan, so the contract on record must still be running: one that ended
// before today would show up as "sudah lewat" the moment it is saved.
// Pure function, checked by scripts/check-new-employee.mts.

export const ENDED_CONTRACT_MESSAGE =
  "Kontrak ini sudah berakhir. Isi tanggal berakhir kontrak yang berlaku sekarang (kontrak perpanjangan terakhir).";

// The hire form: a candidate's first contract has no extension to point to
export const ENDED_FIRST_CONTRACT_MESSAGE = "Kontrak ini sudah berakhir. Isi tanggal berakhir yang masih berlaku.";

// A contract ending today is still valid today
export const endedContractError = (endDate: Date | null | undefined, today: Date) =>
  endDate && endDate < today ? ENDED_CONTRACT_MESSAGE : null;
