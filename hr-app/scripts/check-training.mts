import assert from "node:assert/strict";
import { graduatedNumber, isTraineeNumber, trainingErrors, trainingOver } from "@/lib/training";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d("2026-11-10");

// Which numbers are trainee numbers, and what they become
assert.equal(graduatedNumber("T001"), "001");
assert.equal(graduatedNumber("t001"), "001");
assert.equal(graduatedNumber("T-001"), "001");
assert.equal(graduatedNumber("T_12"), "12");
assert.equal(graduatedNumber(" T7 "), "7");
assert.equal(graduatedNumber("TEMP-01"), null); // a T word, not a trainee number
assert.equal(graduatedNumber("EMP-001"), null);
assert.equal(graduatedNumber("T"), null);
assert.ok(isTraineeNumber("T001") && !isTraineeNumber("001") && !isTraineeNumber("TX01"));

// Training ends on trainingEnd; the number changes the day after
assert.equal(trainingOver(d("2026-11-10"), today), false);
assert.equal(trainingOver(d("2026-11-09"), today), true);

const errs = (employeeNumber: string, start: string | null, end: string | null) =>
  trainingErrors({ employeeNumber, trainingStart: start ? d(start) : null, trainingEnd: end ? d(end) : null }, today);

assert.deepEqual(errs("T001", "2026-11-01", "2026-12-01"), {});
assert.deepEqual(errs("001", null, null), {});
assert.deepEqual(errs("001", "2026-01-01", "2026-03-01"), {}); // graduated: dates kept for payroll
assert.deepEqual(errs("T001", "2026-01-01", "2026-03-01"), {}); // graduation blocked by a clash: still valid
assert.ok(errs("001", "2026-11-01", "2026-12-01").employeeNumber); // in training without T
assert.ok(errs("T001", null, null).trainingStart); // T without dates
assert.ok(errs("T001", "2026-11-01", null).trainingEnd); // only one date
assert.ok(errs("T001", null, "2026-11-01").trainingStart);
assert.ok(errs("T001", "2026-12-01", "2026-11-01").trainingEnd); // end before start
console.log("check-training: ok");
