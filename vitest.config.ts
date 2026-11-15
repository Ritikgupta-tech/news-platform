import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database, so files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      // Test-only secrets. Never reuse in any real environment.
      JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef0123456789",
      JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef012345678",
      APP_URL: "http://localhost:3000",
      CRON_SECRET: "test-cron-secret-0123456789abcdef0123456789",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:5432/unused",
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
