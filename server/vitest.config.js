import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.{test,spec}.js"],
    exclude: ["node_modules/**", "dist/**"],
  },
});
