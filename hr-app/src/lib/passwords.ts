import "server-only";
import { randomInt } from "node:crypto";

// No 0/O, 1/l/I: the temporary password is read out or typed by hand
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function temporaryPassword(length = 10) {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
