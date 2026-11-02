// Development seed: one admin, two departments, one open job and sample candidates.
// Run with: npx prisma db seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { mariadbConfig } from "../src/lib/db-config";

const db = new PrismaClient({ adapter: new PrismaMariaDb(mariadbConfig(process.env.DATABASE_URL)) });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@perusahaan.local";

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("Set SEED_ADMIN_PASSWORD in .env before seeding");

  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: "Administrator",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  const hr = await db.department.upsert({ where: { name: "Human Resources" }, update: {}, create: { name: "Human Resources" } });
  const it = await db.department.upsert({ where: { name: "Teknologi Informasi" }, update: {}, create: { name: "Teknologi Informasi" } });

  const job = await db.job.upsert({
    where: { slug: "staf-administrasi-hr" },
    update: {},
    create: {
      title: "Staf Administrasi HR",
      slug: "staf-administrasi-hr",
      departmentId: hr.id,
      hiringManagerName: admin.name,
      hiringManagerId: admin.id,
      employmentType: "PKWT",
      location: "Jakarta",
      description: "Mendukung administrasi karyawan, absensi, dan dokumen HR.",
      requirements: "Minimal D3/S1 semua jurusan. Pengalaman 1 tahun di administrasi HR. Menguasai Microsoft Excel.",
      minEducation: "D3",
      minExperienceYears: 1,
      status: "OPEN",
      openedAt: new Date(),
    },
  });

  await db.job.upsert({
    where: { slug: "web-developer" },
    update: {},
    create: {
      title: "Web Developer",
      slug: "web-developer",
      departmentId: it.id,
      hiringManagerName: admin.name,
      hiringManagerId: admin.id,
      employmentType: "PKWTT",
      location: "Jakarta (hybrid)",
      description: "Mengembangkan aplikasi internal perusahaan.",
      requirements: "S1 Informatika atau setara. Pengalaman 2 tahun dengan TypeScript dan React.",
      minEducation: "S1",
      minExperienceYears: 2,
      status: "DRAFT",
    },
  });

  const sixMonths = new Date(Date.now() + 182 * 24 * 60 * 60 * 1000);
  const samples = [
    { fullName: "Contoh Kandidat Satu", email: "kandidat1@contoh.local", stage: "APPLIED" as const, score: 78 },
    { fullName: "Contoh Kandidat Dua", email: "kandidat2@contoh.local", stage: "INTERVIEW" as const, score: 85 },
  ];

  for (const s of samples) {
    const candidate = await db.candidate.upsert({
      where: { email: s.email },
      update: {},
      create: {
        fullName: s.fullName,
        email: s.email,
        phone: "080000000000",
        lastEducation: "S1",
        consentAt: new Date(),
        consentVersion: "2026-10",
        retainUntil: sixMonths,
      },
    });
    const existing = await db.application.findUnique({
      where: { candidateId_jobId: { candidateId: candidate.id, jobId: job.id } },
    });
    if (existing) continue;
    await db.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        stage: s.stage,
        source: "website",
        screenings: {
          create: {
            score: s.score,
            summary: "Contoh hasil seleksi AI.",
            strengths: ["Pengalaman administrasi"],
            gaps: [],
            aiModel: "seed",
            promptVersion: "seed",
          },
        },
      },
    });
  }

  console.log(`Seed selesai. Admin: ${ADMIN_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
