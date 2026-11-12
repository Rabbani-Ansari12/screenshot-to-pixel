/**
 * Finance end to end: order → purchase → trip (delivery slip sent through the driver link) →
 * provider bill → transporter bill → reconcile → invoice → payment → profit.
 *
 * It WRITES data, so it only runs against a NON-production project with seed masters (at least
 * one customer + site, material, provider, transporter + vehicle) and an owner test user:
 *   E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD   owner of the test business
 *   E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY   the same project the app points at
 *   E2E_ALLOW_WRITES=1                     explicit opt-in (never set this for production)
 * Optional real bills (read by Gemini; without them the bills are entered as staff would type them):
 *   E2E_PROVIDER_BILL / E2E_TRANSPORTER_BILL   paths to bill photos / PDFs matching the trip
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { devices, expect, test, type Page } from "@playwright/test";

const env = (k: string) => process.env[k] ?? "";
const owner = { email: env("E2E_OWNER_EMAIL"), password: env("E2E_OWNER_PASSWORD") };
const supabaseUrl = env("E2E_SUPABASE_URL") || env("VITE_SUPABASE_URL");
const anonKey = env("E2E_SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
const slip = "supabase/functions/process-document/fixtures/clean-unloading.png";
const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function rpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

async function first(db: SupabaseClient, table: string, filter: Record<string, string> = {}) {
  let q = db.from(table).select("*").is("deleted_at", null);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q.limit(1).single();
  if (error) throw new Error(`${table}: ${error.message} (seed masters first)`);
  return data as Record<string, string>;
}

test("order → trip → bills → reconcile → invoice → payment → profit", async ({ page, browser }) => {
  test.skip(
    !owner.email || !owner.password || !supabaseUrl || !anonKey || env("E2E_ALLOW_WRITES") !== "1",
    "Writes data: set E2E_ALLOW_WRITES=1 and the E2E_* variables for a TEST project only",
  );
  test.setTimeout(420_000);

  // ---- Setup through the same RPCs the order / purchase / trip forms use ----
  const db = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { error: authError } = await db.auth.signInWithPassword(owner);
  expect(authError).toBeNull();
  const customer = await first(db, "customers");
  const site = await first(db, "construction_sites", { customer_id: customer["id"]! });
  const material = await first(db, "materials", { unit: "MT" });
  const provider = await first(db, "material_providers");
  const transporter = await first(db, "transporters");
  const vehicle = await first(db, "vehicles", { transporter_id: transporter["id"]! });
  const order = await rpc<{ id: string; order_code: string }>(db, "create_order", {
    p_order: { customer_id: customer["id"], site_id: site["id"] },
    p_items: [{ material_id: material["id"], quantity: 30, unit: "MT", selling_rate: 1900 }],
  });
  const purchase = await rpc<{ id: string }>(db, "create_purchase", {
    p_purchase: {
      provider_id: provider["id"],
      delivery_mode: "direct_to_site",
      order_id: order.id,
      purchase_date: today,
    },
    p_items: [{ material_id: material["id"], quantity: 30, unit: "MT", rate: 1450 }],
  });
  const trip = await rpc<{ id: string; trip_code: string }>(db, "create_trip", {
    p_trip: {
      order_id: order.id,
      material_id: material["id"],
      provider_id: provider["id"],
      purchase_id: purchase.id,
      transporter_id: transporter["id"],
      vehicle_id: vehicle["id"],
      freight_amount: 5800,
    },
    p_loading: { gross: 42.18, tare: 14.06, slip_number: `E2E-${Date.now()}` },
    // Delivery weight as the office would confirm it; the driver's slip below is the evidence
    // (with a real Gemini key it is matched to this trip, or lands in review).
    p_delivery: { gross: 41.6, tare: 14.05 },
  });
  const loaded = 28.12;
  const delivered = 27.55;

  // ---- Driver sends the delivery slip through the link ----
  await signIn(page);
  await page.goto(`/trips/${trip.trip_code}`);
  await page.getByRole("button", { name: "Generate link" }).click();
  const link = await page.getByLabel("Driver upload link").inputValue();
  const phone = await browser.newContext({ ...devices["Pixel 5"] });
  const driver = await phone.newPage();
  await driver.goto(link);
  await driver.getByRole("button", { name: "Unloading slip" }).click();
  await driver.getByLabel("Choose files").setInputFiles(slip);
  await driver.getByRole("button", { name: /^Send/ }).click();
  await expect(driver.getByText("Received.")).toBeVisible({ timeout: 60_000 });
  await phone.close();

  // ---- Provider and transporter bills ----
  const billNo = `E2E-${Date.now()}`;
  let providerBillId: string;
  let transporterBillId: string;
  if (env("E2E_PROVIDER_BILL") && env("E2E_TRANSPORTER_BILL")) {
    for (const [file, type] of [
      [env("E2E_PROVIDER_BILL"), "Provider Bill"],
      [env("E2E_TRANSPORTER_BILL"), "Transporter Bill"],
    ] as const) {
      await page.goto("/uploads");
      await page.getByRole("button", { name: "Upload documents" }).click();
      await page.getByLabel("Choose files to upload").setInputFiles(file);
      await page.getByLabel(/^Document type for/).click();
      await page.getByRole("option", { name: type }).click();
      await page.getByRole("button", { name: /^Upload 1 file/ }).click();
    }
    const billFor = async (table: string, party: string) => {
      let id = "";
      await expect
        .poll(
          async () => {
            const { data } = await db
              .from(table)
              .select("id")
              .eq(
                party === "provider" ? "provider_id" : "transporter_id",
                party === "provider" ? provider["id"]! : transporter["id"]!,
              )
              .gte("created_at", new Date(Date.now() - 600_000).toISOString())
              .limit(1);
            id = data?.[0]?.id ?? "";
            return id;
          },
          { timeout: 240_000, intervals: [5_000] },
        )
        .not.toBe("");
      return id;
    };
    providerBillId = await billFor("provider_bills", "provider");
    transporterBillId = await billFor("transporter_bills", "transporter");
  } else {
    providerBillId = (
      await rpc<{ id: string }>(db, "create_bill", {
        p_kind: "provider",
        p_bill: {
          party_id: provider["id"],
          bill_number: `P-${billNo}`,
          bill_date: today,
          total_amount: 40774,
        },
        p_items: [
          {
            date: today,
            vehicle_number: vehicle["vehicle_number"],
            material_id: material["id"],
            quantity: loaded,
            unit: "MT",
            rate: 1450,
            amount: 40774,
          },
        ],
      })
    ).id;
    // Billed ₹6,200 against the agreed ₹5,800 per trip: a difference to decide on.
    transporterBillId = (
      await rpc<{ id: string }>(db, "create_bill", {
        p_kind: "transporter",
        p_bill: {
          party_id: transporter["id"],
          bill_number: `T-${billNo}`,
          bill_date: today,
          total_amount: 6200,
          period_from: today,
          period_to: today,
        },
        p_items: [{ date: today, vehicle_number: vehicle["vehicle_number"], amount: 6200 }],
      })
    ).id;
  }

  // ---- Reconcile: provider bill matches; transporter bill needs a decision ----
  await page.goto(`/reconciliation/${providerBillId}`);
  await expect(page.getByText("Line-by-line matching")).toBeVisible();
  await page.goto(`/reconciliation/${transporterBillId}`);
  await expect(page.getByText("Line-by-line matching")).toBeVisible();
  const decide = async (button: string, note: string) => {
    await page.getByRole("button", { name: button }).first().click();
    await page.getByLabel("Note").fill(note);
    await page.getByRole("dialog").getByRole("button", { name: button }).click();
  };
  if (
    await page
      .getByText(/Rate differs|Mismatch/)
      .first()
      .isVisible()
  ) {
    await decide("Approve Difference", "Waiting charge agreed by phone (E2E)");
    await expect(page.getByText("Difference Approved").first()).toBeVisible();
  }
  await decide("Mark Reconciled", "Checked against the trip sheet (E2E)");
  await expect(page.getByText("Reconciled").first()).toBeVisible();

  // ---- Invoice from the confirmed delivery ----
  await page.goto(`/invoices/new?orderId=${order.id}`);
  await expect(page.getByText(trip.trip_code)).toBeVisible();
  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
  const invoiceId = page.url().split("/").pop()!;
  const subtotal = Math.round(delivered * 1900 * 100) / 100;
  await expect(page.getByText("Payment status")).toBeVisible();

  // ---- Partial payment; the database keeps the balance ----
  await page.getByRole("link", { name: "Record payment" }).click();
  await page.getByLabel("Amount (₹)").fill("20000");
  await page.getByLabel("Reference").fill(`UTR-${billNo}`);
  await page.getByRole("button", { name: "Record payment" }).last().click();
  await expect(page.getByText(/Recorded PAY-/)).toBeVisible();
  const { data: inv } = await db
    .from("v_invoice_list")
    .select("subtotal, paid_amount, balance, payment_status")
    .eq("id", invoiceId)
    .single();
  expect(Number(inv?.subtotal)).toBeCloseTo(subtotal, 2);
  expect(Number(inv?.paid_amount)).toBe(20000);
  expect(inv?.payment_status).toBe("partial");

  // ---- Profit: sales − purchase − transport; the receipt is not profit ----
  const { data: p } = await db
    .from("v_order_profit")
    .select("sales_value, purchase_cost, transport_cost, estimated_profit, profit_status")
    .eq("order_id", order.id)
    .single();
  expect(Number(p?.sales_value)).toBeCloseTo(subtotal, 2);
  expect(Number(p?.estimated_profit)).toBeCloseTo(
    Number(p?.sales_value) - Number(p?.purchase_cost) - Number(p?.transport_cost),
    2,
  );
  expect(p?.profit_status).toBe("estimated");
  await page.goto("/profit");
  await expect(page.getByText(order.order_code).first()).toBeVisible();
});
