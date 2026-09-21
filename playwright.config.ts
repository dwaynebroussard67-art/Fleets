import { defineConfig } from "@playwright/test";
const auth = process.env.FLEET_AUTH_TESTS === "1";
const port = auth ? 3100 : 3000;
const baseURL = process.env.FLEET_TEST_URL || `http://localhost:${port}`;
export default defineConfig({
  testDir: auth ? "./tests/auth-browser" : "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : {},
  },
  webServer: process.env.FLEET_TEST_URL
    ? undefined
    : {
        command:
          auth || !process.env.CI
            ? `npm run dev -- --port ${port}`
            : `npm run start -- --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: auth
          ? {
              // Test-only SDK endpoints. All calls are intercepted by Playwright; never real credentials.
              NEXT_PUBLIC_SUPABASE_URL: "https://fleet-test.supabase.co",
              NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-only-public-key",
              FLEET_BUILD_DIR: ".next/auth-tests",
            }
          : {},
      },
});
