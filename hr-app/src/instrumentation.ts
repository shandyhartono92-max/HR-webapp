// Runs once when the Next.js server starts (see node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
// Background jobs live in src/lib/background-jobs.ts; the Edge runtime has no database.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/background-jobs");
  }
}
