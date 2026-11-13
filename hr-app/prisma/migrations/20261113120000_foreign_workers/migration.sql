-- Tenaga Kerja Asing: foreign workers with passport and KITAS expiry (src/lib/foreign-workers.ts)

-- CreateTable
CREATE TABLE `foreign_worker` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(120) NOT NULL,
    `passportNumber` VARCHAR(30) NOT NULL,
    `kitasNumber` VARCHAR(30) NOT NULL,
    `passportExpiry` DATE NOT NULL,
    `kitasExpiry` DATE NOT NULL,
    `location` VARCHAR(120) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `kitasSoonNoticeAt` DATETIME(3) NULL,
    `kitasExpiredNoticeAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `foreign_worker_passportNumber_key`(`passportNumber`),
    UNIQUE INDEX `foreign_worker_kitasNumber_key`(`kitasNumber`),
    INDEX `foreign_worker_status_kitasExpiry_idx`(`status`, `kitasExpiry`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
