/**
 * Crawler / automation filter for view counting. Pure and edge-safe.
 * A missing User-Agent counts as automation: real browsers always send one.
 * This is a first line of defence against inflated numbers, not fraud-proof (see docs/analytics.md).
 */
const BOT_RE = /bot|crawl|externalhit|whatsapp|telegram|linkedinbot|discord|embedly|skypeuripreview|spider|slurp|preview|fetch|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|httpclient|go-http|java\/|okhttp|axios|node-fetch|scrapy|phantom|selenium/i;

export function isAutomatedUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim().length < 8) return true;
  return BOT_RE.test(ua);
}
