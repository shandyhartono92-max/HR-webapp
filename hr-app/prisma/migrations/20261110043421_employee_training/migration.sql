-- Training period and the employee number used during training (see schema comments)
ALTER TABLE `employee` ADD COLUMN `traineeNumber` VARCHAR(191) NULL,
    ADD COLUMN `trainingEnd` DATE NULL,
    ADD COLUMN `trainingStart` DATE NULL;

CREATE UNIQUE INDEX `employee_traineeNumber_key` ON `employee`(`traineeNumber`);
