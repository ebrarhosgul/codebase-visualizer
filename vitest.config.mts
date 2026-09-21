import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Credential cookies need a secret; the server refuses to run without one.
    env: { AI_COOKIE_SECRET: "vitest-only-cookie-secret-not-for-real-use" },
    // Local agent skill folders ship node:test files that Vitest cannot run.
    exclude: [...configDefaults.exclude, ".agents/**", ".claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
