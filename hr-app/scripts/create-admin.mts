// The first Admin on a new server, without demo data:
//   npm run admin:create -- admin@perusahaan.co.id "Nama Lengkap"
// Prints a temporary password once; it must be changed at the first login.
import { createFirstAdmin } from "@/lib/first-admin";
import { sites } from "@/lib/sites";

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ");
if (!email || !name) {
  console.error('Pakai: npm run admin:create -- email@perusahaan.co.id "Nama Lengkap"');
  process.exit(1);
}

const result = await createFirstAdmin({ email, name });
if (result.ok) {
  console.log(`Akun Admin dibuat untuk ${result.email} (lokasi: ${sites().map((s) => s.label).join(", ")}).`);
  console.log(`Kata sandi sementara: ${result.password}`);
  console.log("Catat sekarang: kata sandi ini tidak ditampilkan lagi dan wajib diganti saat login pertama.");
  process.exit(0);
}
const messages = {
  invalid: "Email atau nama tidak valid (nama minimal 2 huruf).",
  taken: "Email ini sudah punya akun. Masuk dengan akun itu, atau pakai email lain.",
  site: `Database lokasi ${"site" in result ? result.site : ""} tidak bisa dihubungi. Tidak ada yang disimpan; periksa DATABASE_URL lokasi itu lalu jalankan lagi.`,
};
console.error(messages[result.reason]);
process.exit(1);
