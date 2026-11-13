import assert from "node:assert/strict";
import { KITAS_ALERT_DAYS, clashMessage, kitasAlert, kitasNoticeDue, kitasRenewalData, parseForeignWorker } from "@/lib/foreign-workers";

const today = new Date("2026-11-13T00:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

// ── Alert level: KITAS only, 30 days, active workers only ──
assert.equal(KITAS_ALERT_DAYS, 30);
assert.deepEqual(kitasAlert(d("2026-12-13"), "ACTIVE", today), { level: "soon", daysLeft: 30 });
assert.deepEqual(kitasAlert(d("2026-12-14"), "ACTIVE", today), { level: null, daysLeft: 31 });
assert.deepEqual(kitasAlert(d("2026-11-13"), "ACTIVE", today), { level: "soon", daysLeft: 0 }); // expires today
assert.deepEqual(kitasAlert(d("2026-11-12"), "ACTIVE", today), { level: "overdue", daysLeft: -1 });
assert.equal(kitasAlert(d("2026-11-01"), "INACTIVE", today).level, null);

// ── Form input ──
const valid = {
  fullName: " John Smith ",
  passportNumber: " a1234567 ",
  kitasNumber: " 2c21aa0001-x ",
  passportExpiry: "2030-01-31",
  kitasExpiry: "2027-06-30",
  location: " Kawasan Industri Batamindo ",
};
const ok = parseForeignWorker(valid, today);
assert.equal(ok.ok, true, JSON.stringify(ok));
if (ok.ok) {
  assert.deepEqual(ok.data, {
    fullName: "John Smith",
    passportNumber: "A1234567",
    // Spaces, dashes, dots and slashes are dropped, so variants of one number are one number
    kitasNumber: "2C21AA0001X",
    passportExpiry: d("2030-01-31"),
    kitasExpiry: d("2027-06-30"),
    location: "Kawasan Industri Batamindo",
  });
}
const errorsOf = (more: Record<string, string>) => {
  const r = parseForeignWorker({ ...valid, ...more }, today);
  assert.equal(r.ok, false);
  return r.ok ? {} : r.errors;
};
assert.deepEqual(errorsOf({ fullName: "" }).fullName, ["Isi nama lengkap."]);
assert.deepEqual(errorsOf({ fullName: "Jo" }).fullName, ["Nama minimal 3 karakter."]);
assert.deepEqual(errorsOf({ passportNumber: " " }).passportNumber, ["Isi nomor paspor."]);
assert.deepEqual(errorsOf({ kitasNumber: "" }).kitasNumber, ["Isi nomor KITAS."]);
assert.deepEqual(errorsOf({ passportExpiry: "" }).passportExpiry, ["Isi tanggal berlaku paspor."]);
assert.deepEqual(errorsOf({ kitasExpiry: "" }).kitasExpiry, ["Isi tanggal berlaku KITAS."]);
assert.deepEqual(errorsOf({ location: "" }).location, ["Isi lokasi."]);

// Variants of one number come out the same
const numberOf = (raw: string) => {
  const r = parseForeignWorker({ ...valid, passportNumber: raw }, today);
  return r.ok ? r.data.passportNumber : r.errors.passportNumber;
};
assert.equal(numberOf("A 1234567"), "A1234567");
assert.equal(numberOf("a-1234567"), "A1234567");
assert.equal(numberOf("A.123/4567"), "A1234567");
assert.deepEqual(numberOf("A1234567#"), ["Nomor paspor hanya boleh berisi huruf dan angka."]);
assert.deepEqual(numberOf(" - "), ["Isi nomor paspor."]);

// A year typed wrong (2207 for 2027, 1027) is refused instead of never alerting
const FAR = "Tanggal ini terlalu jauh dari hari ini. Periksa tahunnya.";
assert.deepEqual(errorsOf({ kitasExpiry: "2207-06-30" }).kitasExpiry, [FAR]);
assert.deepEqual(errorsOf({ kitasExpiry: "1027-06-30" }).kitasExpiry, [FAR]);
assert.deepEqual(errorsOf({ passportExpiry: "2099-01-31" }).passportExpiry, [FAR]);
// Within 10 years for a KITAS, 20 for a passport, either way: fine
assert.equal(parseForeignWorker({ ...valid, kitasExpiry: "2036-11-12", passportExpiry: "2046-11-12" }, today).ok, true);
assert.equal(parseForeignWorker({ ...valid, kitasExpiry: "2020-01-01" }, today).ok, true); // an old, expired KITAS still loads

// ── Which notification is due ──
const w = (expiry: string, soon: Date | null = null, expired: Date | null = null, status: "ACTIVE" | "INACTIVE" = "ACTIVE") => ({
  status,
  kitasExpiry: d(expiry),
  kitasSoonNoticeAt: soon,
  kitasExpiredNoticeAt: expired,
});
assert.equal(kitasNoticeDue(w("2026-12-23"), today), null); // 40 days
assert.equal(kitasNoticeDue(w("2026-12-03"), today), "soon");
assert.equal(kitasNoticeDue(w("2026-12-03", today), today), null);
assert.equal(kitasNoticeDue(w("2026-11-10"), today), "expired");
assert.equal(kitasNoticeDue(w("2026-11-10", today), today), "expired");
assert.equal(kitasNoticeDue(w("2026-11-10", today, today), today), null);
assert.equal(kitasNoticeDue(w("2026-11-10", null, null, "INACTIVE"), today), null);

// ── A new KITAS date starts the notices again ──
assert.deepEqual(kitasRenewalData(d("2026-12-03"), d("2027-12-03")), { kitasSoonNoticeAt: null, kitasExpiredNoticeAt: null });
assert.deepEqual(kitasRenewalData(d("2026-12-03"), d("2026-12-03")), {});

// ── Duplicate number: say whose it is; a Non Aktif owner is pointed at "Aktifkan lagi" ──
assert.equal(clashMessage("paspor", { fullName: "John Smith", status: "ACTIVE" }), "Nomor paspor ini sudah dipakai TKA lain: John Smith.");
assert.equal(
  clashMessage("KITAS", { fullName: "John Smith", status: "INACTIVE" }),
  "Nomor KITAS ini milik John Smith yang berstatus Non Aktif. Buka datanya lewat filter Non Aktif, lalu klik Aktifkan lagi.",
);

console.log("check-foreign-workers: ok");
