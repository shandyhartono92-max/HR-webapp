-- AlterTable
ALTER TABLE `bank_change_request` ADD COLUMN `requestedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `employee` ADD COLUMN `anonymizedAt` DATETIME(3) NULL,
    ADD COLUMN `exitDate` DATE NULL;

-- AddForeignKey
ALTER TABLE `bank_change_request` ADD CONSTRAINT `bank_change_request_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Employees who already left: use the contract end date, or the last update, as their exit date
UPDATE `employee` SET `exitDate` = COALESCE(`endDate`, DATE(`updatedAt`))
WHERE `status` IN ('RESIGNED', 'TERMINATED', 'CONTRACT_ENDED') AND `exitDate` IS NULL;

