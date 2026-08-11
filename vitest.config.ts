import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 120_000,
    include: ["tests/**/*.test.ts"],
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
