export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML alternative (newsletter campaigns). Transactional mail stays text-only. */
  html?: string;
  /** Extra headers, e.g. List-Unsubscribe. Names and values must not contain line breaks. */
  headers?: Record<string, string>;
}
export interface SendResult { messageId?: string }

/**
 * How a send failed, so callers can react correctly:
 *  - "recipient": the provider rejected this message/address (retrying will not help)
 *  - "transient": rate limit, provider outage, network (retry later)
 *  - "config":    our credentials/settings are wrong (nobody can be mailed; stop and alert, do not blame recipients)
 */
export type MailErrorKind = "recipient" | "transient" | "config";
export class MailError extends Error {
  constructor(message: string, public readonly kind: MailErrorKind) { super(message); this.name = "MailError"; }
}

/** Provider adapter. `real: false` marks adapters that do not actually deliver (console); campaigns refuse to "send" through them in production. */
export interface Mailer { readonly real?: boolean; send(message: MailMessage): Promise<SendResult | void> }

/** Logs mail. In production the body (which may contain reset links) is never logged. */
export class ConsoleMailer implements Mailer {
  readonly real = false;
  constructor(private readonly logBody: boolean) {}
  async send(m: MailMessage): Promise<void> {
    console.info(`[mail] to=${m.to} subject="${m.subject}"${this.logBody ? `\n${m.text}` : ""}`);
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(m: MailMessage): Promise<SendResult> { this.sent.push(m); return { messageId: `mem-${this.sent.length}` }; }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Resend (https://resend.com) over its HTTP API. No SDK needed. */
export class ResendMailer implements Mailer {
  readonly real = true;
  constructor(private readonly apiKey: string, private readonly from: string, private readonly doFetch: FetchLike = fetch as unknown as FetchLike) {}

  async send(m: MailMessage): Promise<SendResult> {
    if (/[\r\n]/.test(m.subject) || Object.entries(m.headers ?? {}).some(([k, v]) => /[\r\n]/.test(k + v))) throw new MailError("Header values must not contain line breaks", "recipient");
    let res;
    try {
      res = await this.doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), ...(m.headers ? { headers: m.headers } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new MailError("Could not reach the mail provider", "transient");
    }
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { id?: unknown };
      return { messageId: typeof body.id === "string" ? body.id : undefined };
    }
    if (res.status === 429 || res.status >= 500) throw new MailError(`Mail provider is busy or down (HTTP ${res.status})`, "transient");
    if (res.status === 400 || res.status === 422) throw new MailError(`Mail provider rejected the message (HTTP ${res.status})`, "recipient");
    throw new MailError(`Mail provider refused our request (HTTP ${res.status}); check the API key and sender`, "config");
  }
}

/** Stand-in used when mail settings are wrong, so one bad variable breaks mail only, not every page. */
class BrokenMailer implements Mailer {
  readonly real = true;
  constructor(private readonly reason: string) {}
  async send(): Promise<never> { throw new MailError(this.reason, "config"); }
}

/** MAIL_PROVIDER=console (default) | resend. `resend` needs RESEND_API_KEY and MAIL_FROM (e.g. "E News <news@yourdomain>"). */
export function createMailer(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Mailer {
  const provider = (env.MAIL_PROVIDER ?? "console").toLowerCase();
  if (provider === "console") return new ConsoleMailer(env.NODE_ENV !== "production");
  if (provider === "resend") {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) return new BrokenMailer("MAIL_PROVIDER=resend needs RESEND_API_KEY and MAIL_FROM");
    return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
  }
  return new BrokenMailer(`Unknown MAIL_PROVIDER "${provider.slice(0, 20)}" (use console or resend)`);
}

const g = globalThis as unknown as { __mailer?: Mailer };
export const getMailer = (): Mailer => (g.__mailer ??= createMailer());
export const setMailer = (m: Mailer | undefined): void => { g.__mailer = m; };
