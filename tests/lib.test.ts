import { describe, expect, it } from "vitest";
import { slugify, withSuffix } from "../src/lib/slug";
import { readingMinutes } from "../src/lib/reading-time";
import { buildPageMeta, paginationSchema, toSkipTake } from "../src/lib/api/pagination";
import { can, ROLE_PERMISSIONS } from "../src/lib/permissions";
import { getEnv } from "../src/lib/env";
import { toErrorResponse } from "../src/lib/api/response";
import { ApiError } from "../src/lib/api/errors";
import { z } from "zod";

describe("slugify", () => {
  it("normalises text", () => {
    expect(slugify("India & World: Café Update!")).toBe("india-and-world-cafe-update");
    expect(slugify("   ")).toBe("untitled");
    expect(withSuffix("a", 1)).toBe("a");
    expect(withSuffix("a", 3)).toBe("a-3");
  });
});

describe("readingMinutes", () => {
  it("is at least one minute and scales", () => {
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("word ".repeat(440))).toBe(2);
    expect(readingMinutes("word ".repeat(441))).toBe(3);
  });
});

describe("pagination", () => {
  it("applies defaults, caps page size and computes meta", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(() => paginationSchema.parse({ pageSize: "500" })).toThrow();
    expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
    expect(buildPageMeta({ page: 1, pageSize: 10 }, 25)).toMatchObject({ totalPages: 3, hasNext: true });
    expect(buildPageMeta({ page: 1, pageSize: 10 }, 0)).toMatchObject({ totalPages: 1, hasNext: false });
  });
});

describe("permissions", () => {
  it("enforces the role ladder", () => {
    expect(can(["READER"], "article:publish")).toBe(false);
    expect(can(["AUTHOR"], "article:submit")).toBe(true);
    expect(can(["AUTHOR"], "article:publish")).toBe(false);
    expect(can(["EDITOR"], "article:publish")).toBe(true);
    expect(can(["EDITOR"], "user:manage")).toBe(false);
    expect(can(["ADMIN"], "audit:view")).toBe(true);
    expect(can([], "article:read")).toBe(false);
    expect(ROLE_PERMISSIONS.ADMIN.length).toBeGreaterThan(ROLE_PERMISSIONS.EDITOR.length);
  });
});

describe("env", () => {
  it("rejects short secrets", () => {
    expect(() => getEnv({ DATABASE_URL: "x", JWT_ACCESS_SECRET: "short", JWT_REFRESH_SECRET: "short" } as never)).toThrow(
      /Invalid environment/,
    );
  });
  it("accepts a valid config", () => {
    const s = "a".repeat(32);
    expect(getEnv({ DATABASE_URL: "x", JWT_ACCESS_SECRET: s, JWT_REFRESH_SECRET: s } as never).APP_URL).toBe(
      "http://localhost:3000",
    );
  });
});

describe("error envelope", () => {
  it("maps zod errors to 422", async () => {
    const err = z.object({ a: z.string() }).safeParse({}).error!;
    const res = toErrorResponse(err, "rid");
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
  it("maps ApiError and hides internals for unknown errors", async () => {
    expect(toErrorResponse(new ApiError(403, "FORBIDDEN", "no"), "r").status).toBe(403);
    const res = toErrorResponse(new Error("secret db password leaked"), "r");
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
