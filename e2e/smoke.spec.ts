/**
 * Smoke tests against a running app + a NON-production Supabase project with seed data
 * (supabase/seed.sql) and two users. See playwright.config.ts for the environment variables.
 */
import { expect, test, type Page } from "@playwright/test";

const owner = {
  email: process.env["E2E_OWNER_EMAIL"],
  password: process.env["E2E_OWNER_PASSWORD"],
};
const employee = {
  email: process.env["E2E_EMPLOYEE_EMAIL"],
  password: process.env["E2E_EMPLOYEE_PASSWORD"],
};
const hasOwner = Boolean(owner.email && owner.password);
const hasEmployee = Boolean(employee.email && employee.password);

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Opens a Radix select (by its trigger) and picks the first option. */
async function pickFirst(page: Page, trigger: ReturnType<Page["getByRole"]>) {
  await trigger.click();
  await page.getByRole("option").first().click();
}

/** Opens the searchable entity picker and picks the first option. */
async function pickEntity(page: Page, name: string) {
  await page.getByRole("combobox", { name }).click();
  await page.getByRole("option").first().click();
}

test.describe("login", () => {
  test("shows the sign-in form and rejects a wrong password", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText(/Wrong email or password/);
  });
});

test.describe("owner", () => {
  test.skip(!hasOwner, "Set E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD (test project only)");

  test("creates an order", async ({ page }) => {
    await signIn(page, owner.email!, owner.password!);
    await page.goto("/orders/new");
    await pickEntity(page, "Customer");
    await pickFirst(
      page,
      page.getByRole("combobox", { name: /site/i }).or(page.getByText("Choose site")),
    );
    await page.getByPlaceholder("e.g. SBPL/PO/0540").fill(`E2E-${Date.now()}`);
    await pickFirst(page, page.getByRole("combobox", { name: "Material" }));
    await page.getByLabel("Quantity").fill("12");
    await page.getByRole("button", { name: "Create order" }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    await expect(page.getByText(/ORD-\d{4}-\d{4}/).first()).toBeVisible();
  });

  test("records a stock-yard purchase", async ({ page }) => {
    await signIn(page, owner.email!, owner.password!);
    await page.goto("/purchases");
    await page.getByRole("button", { name: "Record purchase" }).click();
    const sheet = page.getByRole("dialog");
    await pickFirst(page, sheet.getByText("Choose provider"));
    await pickFirst(page, sheet.getByText("Choose material"));
    await sheet.getByLabel(/Quantity/).fill("20");
    await sheet.getByLabel(/Purchase rate/).fill("1450");
    await sheet.getByText("Stock-Yard").click();
    await pickFirst(page, sheet.getByText("Choose yard"));
    await sheet.getByRole("button", { name: /Save|Record/ }).click();
    await expect(page.getByText(/recorded|saved/i).first()).toBeVisible();
    await expect(page.getByText(/PUR-\d{4}-\d{4}/).first()).toBeVisible();
  });

  test("creates a trip manually", async ({ page }) => {
    await signIn(page, owner.email!, owner.password!);
    await createTrip(page);
  });
});

async function createTrip(page: Page) {
  await page.goto("/trips/new");
  await pickEntity(page, "Order");
  await page
    .getByText("Choose material")
    .click()
    .catch(() => undefined); // auto-picked when only one
  if (
    await page
      .getByRole("option")
      .first()
      .isVisible()
      .catch(() => false)
  )
    await page.getByRole("option").first().click();
  await pickFirst(page, page.getByText("Choose provider"));
  await pickFirst(page, page.getByText("Choose transporter"));
  await pickFirst(page, page.getByText("Choose vehicle"));
  if (
    await page
      .getByText("Choose driver")
      .isVisible()
      .catch(() => false)
  )
    await pickFirst(page, page.getByText("Choose driver"));
  await page.getByLabel("Gross (MT)").first().fill("42.18");
  await page.getByLabel("Tare (MT)").first().fill("14.06");
  await page.getByPlaceholder("WB-12345").fill(`E2E-${Date.now()}`);
  await page.getByRole("button", { name: /Create trip/ }).click();
  await expect(page).toHaveURL(/\/trips\/TRP-\d{4}-\d{5,}$/);
  await expect(page.getByText("Loading record")).toBeVisible();
}

test.describe("restricted employee (view_records + manage_trips)", () => {
  test.skip(!hasEmployee, "Set E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD (test project only)");

  test("cannot create orders or open owner pages", async ({ page }) => {
    await signIn(page, employee.email!, employee.password!);
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Customer Orders" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New order" })).toHaveCount(0);
    await page.goto("/purchases");
    await expect(page.getByRole("button", { name: "Record purchase" })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await page.goto("/employees");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });

  test("can create a trip", async ({ page }) => {
    await signIn(page, employee.email!, employee.password!);
    await createTrip(page);
  });
});
