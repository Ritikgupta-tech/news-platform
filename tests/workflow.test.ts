import { describe, expect, it } from "vitest";
import { ARTICLE_STATUSES, assertTransition, assertVersion, canTransition, TRANSITIONS } from "../src/lib/workflow";
import { ApiError } from "../src/lib/api/errors";

const author = { roles: ["AUTHOR"] };
const editor = { roles: ["EDITOR"] };
const admin = { roles: ["ADMIN"] };

describe("article workflow", () => {
  it("lets an author submit a draft", () => {
    expect(canTransition("DRAFT", "SUBMITTED", author)).toBe(true);
  });

  it("blocks an author from publishing directly without an explicit grant", () => {
    expect(canTransition("DRAFT", "PUBLISHED", author)).toBe(false);
    expect(canTransition("APPROVED", "PUBLISHED", author)).toBe(false);
  });

  it("allows direct publish only with the explicit author grant", () => {
    expect(canTransition("DRAFT", "PUBLISHED", { roles: ["AUTHOR"], canPublishDirectly: true })).toBe(true);
  });

  it("does not let a reader do anything", () => {
    for (const from of ARTICLE_STATUSES)
      for (const to of ARTICLE_STATUSES) expect(canTransition(from, to, { roles: ["READER"] })).toBe(false);
  });

  it("follows the full happy path for an editor", () => {
    const path = ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      const actor = i === 0 ? author : editor;
      expect(canTransition(path[i]!, path[i + 1]!, actor)).toBe(true);
    }
  });

  it("supports the changes-requested loop and schedule cancel", () => {
    expect(canTransition("IN_REVIEW", "CHANGES_REQUESTED", editor)).toBe(true);
    expect(canTransition("CHANGES_REQUESTED", "SUBMITTED", author)).toBe(true);
    expect(canTransition("APPROVED", "SCHEDULED", editor)).toBe(true);
    expect(canTransition("SCHEDULED", "APPROVED", admin)).toBe(true);
  });

  it("rejects skipping review and anything out of ARCHIVED", () => {
    expect(canTransition("SUBMITTED", "APPROVED", editor)).toBe(false);
    expect(TRANSITIONS.ARCHIVED).toHaveLength(0);
  });

  it("throws a typed INVALID_TRANSITION error", () => {
    try {
      assertTransition("DRAFT", "PUBLISHED", author);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("INVALID_TRANSITION");
      expect((e as ApiError).status).toBe(422);
    }
  });

  it("detects stale versions", () => {
    expect(() => assertVersion(3, 3)).not.toThrow();
    expect(() => assertVersion(4, 3)).toThrowError(/modified by someone else/);
  });
});
