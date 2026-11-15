import { createHash, randomBytes } from "node:crypto";

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** 256-bit opaque token. Only the SHA-256 hash is ever stored. */
export function generateOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}
