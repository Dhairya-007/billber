import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  use: { ...devices["Pixel 7"], channel: "chrome", baseURL: "http://localhost:4173", permissions: ["clipboard-read", "clipboard-write"] },
  webServer: { command: "npm run preview", url: "http://localhost:4173", reuseExistingServer: true },
});
