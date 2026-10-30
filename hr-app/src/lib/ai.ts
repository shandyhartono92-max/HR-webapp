import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Shared Claude client for CV screening and interview kits.
// Every AI feature is optional: without ANTHROPIC_API_KEY the app works and the AI buttons say so.

export const AI_MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function anthropic() {
  client ??= new Anthropic();
  return client;
}

// Indonesian message for the UI; details go to the server log
export function aiErrorMessage(error: unknown, context: string): string {
  if (error instanceof Anthropic.AuthenticationError) return "API key Anthropic tidak valid.";
  if (error instanceof Anthropic.RateLimitError) return "Batas permintaan AI tercapai. Coba lagi beberapa menit lagi.";
  if (error instanceof Anthropic.APIError) {
    console.error(`${context} API error`, error.status, error.message);
    return "Layanan AI sedang bermasalah. Coba lagi nanti.";
  }
  console.error(`${context} failed`, error);
  return "Permintaan AI gagal. Coba lagi nanti.";
}
