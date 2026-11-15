import { describe, expect, it } from "vitest";
import { escapeHtml, renderCampaignEmail, textToHtml } from "../src/server/newsletter/render";
import { createMailer, MailError, ResendMailer } from "../src/server/mail/mailer";

describe("campaign rendering", () => {
  it("escapes everything an editor types, so no markup can get through", () => {
    const html = textToHtml(`<script>alert(1)</script> & "quotes" <img src=x onerror=alert(1)>`);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
  it("makes paragraphs from blank lines and <br> from single line breaks", () => {
    const html = textToHtml("First line\nsecond line\n\nNext paragraph");
    expect(html.match(/<p /g)?.length).toBe(2);
    expect(html).toContain("First line<br>second line");
  });
  it("links https URLs only, leaving trailing punctuation outside the link", () => {
    const html = textToHtml("Read https://example.com/story. Not http://plain.example or javascript:alert(1)");
    expect(html).toContain('<a href="https://example.com/story" rel="noopener noreferrer">https://example.com/story</a>.');
    expect(html).not.toContain('href="http://');
    expect(html).not.toContain("href=\"javascript");
  });
  it("cannot break out of the href attribute with a quote in the URL", () => {
    const html = textToHtml('https://a.example/"onmouseover="alert(1)');
    expect(html).not.toContain('" onmouseover');
    expect(html).not.toMatch(/href="[^"]*"[^>]*onmouseover/);
  });
  it("adds the unsubscribe footer and one-click headers for real sends", () => {
    const m = renderCampaignEmail({ subject: "Hi", bodyText: "Hello readers, here is the news.", siteName: "E News", unsubscribePageUrl: "https://x.test/u?token=abc", unsubscribeOneClickUrl: "https://x.test/api/oc?token=abc" });
    expect(m.text).toContain("Unsubscribe: https://x.test/u?token=abc");
    expect(m.html).toContain('href="https://x.test/u?token=abc"');
    expect(m.headers["List-Unsubscribe"]).toBe("<https://x.test/api/oc?token=abc>, <https://x.test/u?token=abc>");
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
  it("test sends carry no unsubscribe link or headers", () => {
    const m = renderCampaignEmail({ subject: "[Test] Hi", bodyText: "Hello readers, here is the news.", siteName: "E News" });
    expect(m.headers).toEqual({});
    expect(m.text).toContain("Test send");
    expect(m.html).not.toContain("Unsubscribe</a>");
  });
  it("escapes the site name", () => {
    expect(renderCampaignEmail({ subject: "s", bodyText: "x".repeat(30), siteName: "<b>News</b>" }).html).not.toContain("<b>News</b>");
  });
});

type Reply = { status: number; body?: unknown } | Error;
function fakeFetch(reply: Reply) {
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const fn = async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, init });
    if (reply instanceof Error) throw reply;
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body ?? {} };
  };
  return { fn, calls };
}
const msg = { to: "reader@example.test", subject: "Hello", text: "Body", html: "<p>Body</p>", headers: { "List-Unsubscribe": "<https://x.test/u>" } };

describe("ResendMailer", () => {
  it("posts the message with the key and returns the provider id", async () => {
    const f = fakeFetch({ status: 200, body: { id: "re_123" } });
    const out = await new ResendMailer("key_abc", "E News <n@x.test>", f.fn).send(msg);
    expect(out).toEqual({ messageId: "re_123" });
    expect(f.calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(f.calls[0]!.init.headers.Authorization).toBe("Bearer key_abc");
    const body = JSON.parse(f.calls[0]!.init.body);
    expect(body).toEqual({ from: "E News <n@x.test>", to: ["reader@example.test"], subject: "Hello", text: "Body", html: "<p>Body</p>", headers: { "List-Unsubscribe": "<https://x.test/u>" } });
  });
  it("maps provider failures to the right kind", async () => {
    const kind = async (r: Reply) => { try { await new ResendMailer("k", "f@x.test", fakeFetch(r).fn).send(msg); return "ok"; } catch (e) { return e instanceof MailError ? e.kind : "other"; } };
    expect(await kind({ status: 401 })).toBe("config");
    expect(await kind({ status: 403 })).toBe("config");
    expect(await kind({ status: 404 })).toBe("config");
    expect(await kind({ status: 400 })).toBe("recipient");
    expect(await kind({ status: 422 })).toBe("recipient");
    expect(await kind({ status: 429 })).toBe("transient");
    expect(await kind({ status: 503 })).toBe("transient");
    expect(await kind(new Error("ECONNRESET"))).toBe("transient");
  });
  it("never puts the API key or response body in an error message", async () => {
    try { await new ResendMailer("key_SECRET", "f@x.test", fakeFetch({ status: 401, body: { message: "bad key_SECRET" } }).fn).send(msg); } catch (e) { expect((e as Error).message).not.toContain("key_SECRET"); }
  });
  it("refuses header injection through the subject or headers without calling the provider", async () => {
    const f = fakeFetch({ status: 200 });
    const m = new ResendMailer("k", "f@x.test", f.fn);
    for (const bad of [{ ...msg, subject: "Hi\r\nBcc: x@y.test" }, { ...msg, headers: { "X-A": "v\nBcc: x@y.test" } }]) {
      let kind = "none"; try { await m.send(bad); } catch (e) { kind = (e as MailError).kind; }
      expect(kind).toBe("recipient");
    }
    expect(f.calls).toHaveLength(0);
  });
});

describe("createMailer", () => {
  it("defaults to the console mailer, which is marked as not delivering", () => { expect(createMailer({ NODE_ENV: "development" }).real).toBe(false); });
  it("builds a real mailer for resend", () => { expect(createMailer({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "k", MAIL_FROM: "a@b.test" }).real).toBe(true); });
  it("a bad configuration fails at send time with kind config, not at startup", async () => {
    for (const env of [{ MAIL_PROVIDER: "resend" }, { MAIL_PROVIDER: "smtp" }]) {
      const m = createMailer(env);
      let kind = "none"; try { await m.send(msg); } catch (e) { kind = (e as MailError).kind; }
      expect(kind).toBe("config");
    }
  });
});
