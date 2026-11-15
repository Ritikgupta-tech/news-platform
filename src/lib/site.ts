/** Public site config. Deliberately avoids getEnv() so public pages don't require auth secrets. */
export const SITE_NAME = "E News";
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
export function contactEmail(): string | undefined {
  return process.env.CONTACT_EMAIL || undefined;
}
