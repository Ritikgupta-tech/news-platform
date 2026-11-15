/**
 * Turns the plain text an editor writes into a campaign e-mail. Pure and dependency-free.
 * The editor never writes HTML: text is escaped, blank lines become paragraphs and bare https:// links
 * become anchors, so a campaign cannot carry scripts, tracking pixels or hidden content.
 */
export const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const URL_RE = /https:\/\/[^\s<]+/g;
const TRAILING = /[).,;:!?]+$/;

/** Input must already be escaped. Only https links are linked; trailing punctuation stays outside the link. */
function linkify(escaped: string): string {
  return escaped.replace(URL_RE, (m) => {
    const trail = TRAILING.exec(m)?.[0] ?? "";
    const url = trail ? m.slice(0, -trail.length) : m;
    return url.length > 8 ? `<a href="${url}" rel="noopener noreferrer">${url}</a>${trail}` : m;
  });
}

export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export interface RenderInput {
  subject: string;
  bodyText: string;
  siteName: string;
  /** Page link in the footer. Omitted for test sends. */
  unsubscribePageUrl?: string;
  /** RFC 8058 one-click endpoint for the List-Unsubscribe header. Omitted for test sends. */
  unsubscribeOneClickUrl?: string;
}

export interface RenderedEmail { subject: string; text: string; html: string; headers: Record<string, string> }

export function renderCampaignEmail(i: RenderInput): RenderedEmail {
  const footerText = i.unsubscribePageUrl ? `You receive this because you subscribed to the ${i.siteName} newsletter.\nUnsubscribe: ${i.unsubscribePageUrl}` : `(Test send: no unsubscribe link.)`;
  const footerHtml = i.unsubscribePageUrl
    ? `You receive this because you subscribed to the ${escapeHtml(i.siteName)} newsletter. <a href="${escapeHtml(i.unsubscribePageUrl)}">Unsubscribe</a>`
    : `(Test send: no unsubscribe link.)`;
  const html =
    `<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">` +
    `<div style="max-width:600px;margin:0 auto;padding:24px"><div style="font-weight:700;font-size:20px;margin-bottom:20px">${escapeHtml(i.siteName)}</div>` +
    `<div style="background:#fff;border:1px solid #e3e8ef;border-radius:12px;padding:24px;font-size:16px;line-height:1.6">${textToHtml(i.bodyText)}</div>` +
    `<p style="font-size:13px;color:#5b6472;margin-top:16px">${footerHtml}</p></div></body></html>`;
  const headers: Record<string, string> = {};
  if (i.unsubscribeOneClickUrl && i.unsubscribePageUrl) {
    headers["List-Unsubscribe"] = `<${i.unsubscribeOneClickUrl}>, <${i.unsubscribePageUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return { subject: i.subject, text: `${i.bodyText.trim()}\n\n--\n${footerText}\n`, html, headers };
}
