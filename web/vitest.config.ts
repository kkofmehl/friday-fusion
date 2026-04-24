import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Enables the @testing-library/react auto-cleanup hook so rendered output
    // from one test does not leak into the next.
    globals: true
  }
});
