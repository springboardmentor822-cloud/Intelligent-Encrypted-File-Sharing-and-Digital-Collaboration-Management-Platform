import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  outputDir: path.join(os.tmpdir(), "trustshare-playwright-results"),

  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
