/** Public site config. Deliberately avoids getEnv() so public pages don't require auth secrets. */
export const SITE_NAME = "E News";
export function siteUrl(): string {
  const url = process.env.APP_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
    || "http://localhost:3000";
  return url.replace(/\/$/, "");
}
export function contactEmail(): string | undefined {
  return process.env.CONTACT_EMAIL || undefined;
}
