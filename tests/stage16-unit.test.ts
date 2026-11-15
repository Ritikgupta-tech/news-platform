import { describe, expect, it } from "vitest";
import { createAdvertisementSchema } from "../src/server/advertisements/service";
import { siteSettingsSchema, DEFAULT_SETTINGS } from "../src/server/settings/service";

describe("Stage 16: Advertisements & Settings unit tests", () => {
  describe("createAdvertisementSchema", () => {
    it("validates valid advertisement input", () => {
      const valid = {
        title: "Summer Tech Conference 2026",
        placement: "HOME_PROMO",
        imageUrl: "https://example.com/ad.jpg",
        linkUrl: "https://example.com/summit",
        isActive: true,
      };
      const parsed = createAdvertisementSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.title).toBe("Summer Tech Conference 2026");
        expect(parsed.data.placement).toBe("HOME_PROMO");
      }
    });

    it("rejects invalid links and short titles", () => {
      const bad = {
        title: "A",
        placement: "SIDEBAR",
        imageUrl: "",
        linkUrl: "",
      };
      const parsed = createAdvertisementSchema.safeParse(bad);
      expect(parsed.success).toBe(false);
    });
  });

  describe("siteSettingsSchema", () => {
    it("parses default settings correctly", () => {
      const parsed = siteSettingsSchema.safeParse(DEFAULT_SETTINGS);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.siteName).toBe("E News");
        expect(parsed.data.requireEditorialReview).toBe(true);
      }
    });

    it("rejects invalid contact email", () => {
      const bad = { ...DEFAULT_SETTINGS, contactEmail: "not-an-email" };
      const parsed = siteSettingsSchema.safeParse(bad);
      expect(parsed.success).toBe(false);
    });

    it("validates custom retention within bounds", () => {
      const custom = { ...DEFAULT_SETTINGS, analyticsRetentionDays: 180 };
      const parsed = siteSettingsSchema.safeParse(custom);
      expect(parsed.success).toBe(true);
    });
  });
});
