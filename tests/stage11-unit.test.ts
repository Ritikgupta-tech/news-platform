import { describe, expect, it } from "vitest";
import { isAutomatedUserAgent } from "../src/lib/bots";
import { makeUnsubscribeToken, readUnsubscribeToken } from "../src/server/newsletter/tokens";
import type { Deps } from "../src/server/container";

const deps = (secret: string) => ({ env: { JWT_REFRESH_SECRET: secret } }) as unknown as Deps;
const ID = "7f1c2a3e-1111-4222-8333-444455556666";

describe("bot filter", () => {
  it("treats crawlers, scripts and missing agents as automation", () => {
    for (const ua of [null, undefined, "", "curl/8.4.0", "Googlebot/2.1 (+http://www.google.com/bot.html)", "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/120", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0"]) {
      expect(isAutomatedUserAgent(ua), String(ua)).toBe(true);
    }
  });
  it("lets ordinary browsers through", () => {
    expect(isAutomatedUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")).toBe(false);
    expect(isAutomatedUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});

describe("unsubscribe token", () => {
  it("round-trips and returns the subscriber id", () => {
    const d = deps("secret-one-secret-one-secret-one-1234");
    expect(readUnsubscribeToken(d, makeUnsubscribeToken(d, ID))).toBe(ID);
  });
  it("rejects tampering, other ids, other secrets and junk", () => {
    const d = deps("secret-one-secret-one-secret-one-1234");
    const t = makeUnsubscribeToken(d, ID);
    expect(readUnsubscribeToken(d, t.slice(0, -2) + "xx")).toBeNull();
    expect(readUnsubscribeToken(d, "11111111-1111-4111-8111-111111111111." + t.split(".")[1])).toBeNull();
    expect(readUnsubscribeToken(deps("another-secret-another-secret-12345"), t)).toBeNull();
    for (const junk of ["", ".", "abc", "no-dot-here", `${ID}.`, "../../etc/passwd.x"]) expect(readUnsubscribeToken(d, junk)).toBeNull();
  });
});
