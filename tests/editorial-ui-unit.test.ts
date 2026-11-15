import { describe, expect, it } from "vitest";
import { diffWords, stripTags } from "../src/lib/diff";
import { availableActions } from "../src/server/editorial/actions";

describe("word diff", () => {
  const text = (parts: ReturnType<typeof diffWords>, type: string) => parts!.filter((p) => p.type === type).map((p) => p.text.trim()).join("|");
  it("marks additions and deletions at word level", () => {
    const d = diffWords("The council approved the budget on Monday", "The council rejected the budget on Tuesday")!;
    expect(text(d, "del")).toBe("approved|Monday");
    expect(text(d, "add")).toBe("rejected|Tuesday");
    expect(d.map((p) => p.text).join("")).toContain("The council");
  });
  it("is empty of changes for identical text, and handles empty sides", () => {
    expect(diffWords("same text", "same text")!.every((p) => p.type === "same")).toBe(true);
    expect(text(diffWords("", "all new")!, "add")).toBe("all new");
    expect(text(diffWords("all gone", "")!, "del")).toBe("all gone");
    expect(diffWords("", "")).toEqual([]);
  });
  it("reconstructs both versions from its parts", () => {
    const a = "one two three four five", b = "one 2 three four six seven";
    const d = diffWords(a, b)!;
    expect(d.filter((p) => p.type !== "add").map((p) => p.text).join("")).toBe(a);
    expect(d.filter((p) => p.type !== "del").map((p) => p.text).join("")).toBe(b);
  });
  it("refuses absurdly large inputs instead of freezing the browser", () => {
    expect(diffWords("w ".repeat(7000), "x ".repeat(7000))).toBeNull();
  });
  it("strips HTML for comparison", () => {
    expect(stripTags("<p>Tom &amp; <strong>Jerry</strong></p><p>Next</p>")).toBe("Tom & Jerry\nNext");
  });
});

describe("availableActions", () => {
  const author = { id: "a", roles: ["READER", "AUTHOR"], canPublishDirectly: false };
  const editor = { id: "e", roles: ["READER", "AUTHOR", "EDITOR"], canPublishDirectly: false };
  const admin = { id: "m", roles: ["READER", "AUTHOR", "EDITOR", "ADMIN"], canPublishDirectly: false };
  const names = (a: ReturnType<typeof availableActions>) => a.map((x) => x.action);

  it("offers authors only submit on their own draft", () => {
    expect(names(availableActions(author, { authorId: "a", status: "DRAFT" }))).toEqual(["submit"]);
    expect(names(availableActions(author, { authorId: "a", status: "CHANGES_REQUESTED" }))).toEqual(["submit"]);
    expect(names(availableActions(author, { authorId: "a", status: "IN_REVIEW" }))).toEqual([]);
    expect(names(availableActions(author, { authorId: "a", status: "PUBLISHED" }))).toEqual([]);
  });
  it("offers the review trio only while in review, and never on your own article (except admins)", () => {
    expect(names(availableActions(editor, { authorId: "a", status: "IN_REVIEW" }))).toEqual(["approve", "request-changes", "reject"]);
    expect(names(availableActions(editor, { authorId: "e", status: "IN_REVIEW" }))).toEqual([]);
    expect(names(availableActions(admin, { authorId: "m", status: "IN_REVIEW" }))).toEqual(["approve", "request-changes", "reject"]);
  });
  it("offers publish / schedule / cancel / archive at the right stages", () => {
    expect(names(availableActions(editor, { authorId: "a", status: "APPROVED" }))).toEqual(["publish", "schedule"]);
    expect(names(availableActions(editor, { authorId: "a", status: "SCHEDULED" }))).toEqual(["publish", "cancel-schedule"]);
    expect(names(availableActions(editor, { authorId: "a", status: "PUBLISHED" }))).toEqual(["archive"]);
    expect(names(availableActions(editor, { authorId: "a", status: "ARCHIVED" }))).toEqual([]);
  });
  it("shows direct publish only with the grant", () => {
    expect(names(availableActions({ ...author, canPublishDirectly: true }, { authorId: "a", status: "DRAFT" }))).toEqual(["submit", "publish"]);
    expect(names(availableActions({ ...author, canPublishDirectly: true }, { authorId: "b", status: "DRAFT" }))).toEqual([]);
  });
  it("tells the UI what to collect", () => {
    const a = availableActions(editor, { authorId: "a", status: "IN_REVIEW" });
    expect(a.find((x) => x.action === "request-changes")!.input).toBe("reason");
    expect(a.find((x) => x.action === "approve")!.input).toBe("note");
    expect(availableActions(editor, { authorId: "a", status: "APPROVED" }).find((x) => x.action === "schedule")!.input).toBe("schedule");
  });
});
