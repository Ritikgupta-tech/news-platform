import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

// OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane. Algorithm defaults to Argon2id.
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "iloveyou123",
  "letmein123", "admin12345", "welcome123", "changeme123", "abcdefghij",
]);

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "That password is too common");

export const hashPassword = (password: string): Promise<string> => hash(password, ARGON_OPTIONS);

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Burns the same CPU as a real check so response time does not reveal whether an email exists. */
export async function burnVerify(password: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equalisation-dummy");
  await verifyPassword(await dummyHash, password);
}
