-- AlterTable
ALTER TABLE `employee` ADD COLUMN `workLocation` ENUM('HO', 'OPS') NULL,
    ADD COLUMN `warehouse` VARCHAR(100) NULL;
