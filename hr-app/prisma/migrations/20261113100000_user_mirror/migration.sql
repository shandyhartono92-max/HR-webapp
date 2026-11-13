-- Passwords and login details moved to the accounts database (portal_hr_akun).
-- scripts/migrate-sites.mts refuses to apply this while any user here has no account there.

-- AlterTable
ALTER TABLE `user` DROP COLUMN `lastLoginAt`,
    DROP COLUMN `mustChangePassword`,
    DROP COLUMN `passwordHash`,
    DROP COLUMN `twoFactorEnabled`;
