/**
 * Driver link end to end: staff generate a link on a trip → the driver opens /u/:token on a phone
 * → uploads a slip → it appears in the inbox → it is recorded automatically or lands in review.
 * Needs a NON-production project with seed data, the document worker deployed and (for the last
 * step) a real GEMINI_API_KEY. See playwright.config.ts for the environment variables.
 *   E2E_TRIP_CODE   optional; defaults to the first trip on the trips list
 *   E2E_SLIP        optional path to a real slip photo (defaults to a synthetic fixture)
 */
import { devices, expect, test } from "@playwright/test";

const owner = {
  email: process.env["E2E_OWNER_EMAIL"],
  password: process.env["E2E_OWNER_PASSWORD"],
};
const slip =
  process.env["E2E_SLIP"] ?? "supabase/functions/process-document/fixtures/clean-unloading.png";

test("generate link → driver uploads on a phone → document is processed", async ({
  page,
  browser,
}) => {
  test.skip(
    !owner.email || !owner.password,
    "Set E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD (test project only)",
  );
  test.setTimeout(240_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill(owner.email!);
  await page.getByLabel("Password", { exact: true }).fill(owner.password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);

  let tripCode = process.env["E2E_TRIP_CODE"];
  if (!tripCode) {
    await page.goto("/trips");
    tripCode =
      (
        await page
          .getByText(/TRP-\d{4}-\d{5,}/)
          .first()
          .textContent()
      )?.trim() ?? "";
  }
  await page.goto(`/trips/${tripCode}`);
  const card = page
    .getByText("Driver upload link")
    .locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  const regenerate = page.getByRole("button", { name: "Regenerate" });
  if (await regenerate.isVisible().catch(() => false)) {
    await regenerate.click();
    await page.getByRole("button", { name: "Regenerate" }).last().click();
  } else {
    await page.getByRole("button", { name: "Generate link" }).click();
  }
  const linkInput = page.getByLabel("Driver upload link");
  await expect(linkInput).toBeVisible();
  const link = await linkInput.inputValue();
  expect(link).toMatch(/\/u\/[A-Za-z0-9_-]{43}$/);
  await expect(card).toBeVisible();

  // The driver's phone: a separate, signed-out mobile context.
  const phone = await browser.newContext({ ...devices["Pixel 5"] });
  const driver = await phone.newPage();
  await driver.goto(link);
  await expect(driver.getByText(tripCode)).toBeVisible();
  await expect(driver.getByRole("navigation")).toHaveCount(0);
  await driver.getByRole("button", { name: "Unloading slip" }).click();
  await driver.getByLabel("Choose files").setInputFiles(slip);
  await driver.getByLabel(/Your name/).fill("E2E Driver");
  await driver.getByRole("button", { name: /^Send/ }).click();
  await expect(driver.getByText("Received.")).toBeVisible({ timeout: 60_000 });
  await phone.close();

  // Back in the office: the document shows up and gets processed.
  await page.goto("/uploads");
  await page.getByRole("tab", { name: "Recent uploads" }).click();
  await expect(page.getByText("E2E Driver").first()).toBeVisible({ timeout: 30_000 });
  await page.getByText("E2E Driver").first().click();
  await expect(page.getByText(/Sent through the driver link/)).toBeVisible();
  await expect
    .poll(async () => (await page.locator("main").textContent()) ?? "", {
      timeout: 180_000,
      intervals: [5_000],
    })
    .toMatch(/Automatically Recorded|Needs Review|Duplicate/);
});

test("expired, revoked or made-up links all show the same plain message", async ({ browser }) => {
  const phone = await browser.newContext({ ...devices["Pixel 5"] });
  const driver = await phone.newPage();
  await driver.goto(`/u/${"x".repeat(43)}`);
  await expect(driver.getByRole("alert")).toContainText("not valid any more", { timeout: 45_000 });
  await phone.close();
});
