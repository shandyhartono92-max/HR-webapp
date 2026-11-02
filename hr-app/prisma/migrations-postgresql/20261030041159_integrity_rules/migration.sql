-- Rules Prisma's schema language cannot express.

-- 1. At most one active bank account per employee
CREATE UNIQUE INDEX "BankAccount_one_active_per_employee"
  ON "BankAccount" ("employeeId")
  WHERE "isActive";

-- 2. Audit log is append-only: block UPDATE and DELETE for every database user
CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- 3. PKWT contracts must have an end date
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_pkwt_has_end_date"
  CHECK ("type" <> 'PKWT' OR "endDate" IS NOT NULL);
