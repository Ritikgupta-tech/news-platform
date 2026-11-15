// Edge-safe (jose only, no node:crypto) so the middleware can verify access tokens.
import { jwtVerify, SignJWT } from "jose";

const ISSUER = "enews";
const AUDIENCE = "enews-web";
const key = (secret: string) => new TextEncoder().encode(secret);

export interface AccessClaims { userId: string; sessionId: string }

export async function signAccessToken(claims: AccessClaims, secret: string, ttlSeconds = 15 * 60, nowMs = Date.now()): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSeconds)
    .sign(key(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub || typeof payload.sid !== "string") return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}
