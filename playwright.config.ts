import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests (e2e/). They sign in for real, so point them at a LOCAL or STAGING
 * Supabase project with seed data and two test users — never at production:
 *
 *   E2E_BASE_URL            app URL (default: starts `npm run dev` on http://localhost:5173)
 *   E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD   (employee with view_records + manage_trips only)
 *
 * Without the credentials the signed-in tests are skipped.
 *   npx playwright install chromium   # once
 *   npm run test:e2e
 */
const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env["E2E_BASE_URL"]
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
