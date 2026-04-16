import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/e2e/**/*.e2e.test.ts"],
    setupFiles: ["test/e2e/_setup.ts"],
    testTimeout: 1_200_000, // 20 min — paid pipeline polls async jobs
    hookTimeout: 60_000,
    // Run files sequentially — the real API is a shared resource and we don't
    // want to hammer it with parallel requests during a smoke test.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
