-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('SELF_FORM', 'HR_ATTESTED');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "consentEvidence" TEXT,
ADD COLUMN     "consentMethod" "ConsentMethod" NOT NULL DEFAULT 'SELF_FORM',
ADD COLUMN     "consentRecordedById" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "Resume" ADD COLUMN     "candidateId" TEXT,
ALTER COLUMN "applicationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_consentRecordedById_fkey" FOREIGN KEY ("consentRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A CV belongs to an application or directly to a candidate (bank data)
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_has_owner" CHECK ("applicationId" IS NOT NULL OR "candidateId" IS NOT NULL);

-- HR-attested consent must say how the candidate agreed
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_attested_consent_has_evidence" CHECK ("consentMethod" <> 'HR_ATTESTED' OR ("consentEvidence" IS NOT NULL AND "consentRecordedById" IS NOT NULL));
