/** Service layer against the fake client: payloads sent to RPCs and server-side list queries. */
import { afterEach, describe, expect, it } from "vitest";
import { setSupabaseClient } from "@/lib/supabase";
import * as orders from "@/services/orders.service";
import * as purchases from "@/services/purchases.service";
import * as trips from "@/services/trips.service";
import * as masters from "@/services/masters.service";
import { defaultTableQuery } from "@/services/supabase/table-query";
import { createFakeSupabase } from "./fake-supabase";
import { ID, ORDER_CODE, TRIP_CODE, fixtureTables } from "./fixtures";

afterEach(() => setSupabaseClient(undefined));

function fake(rpc: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const f = createFakeSupabase({ tables: fixtureTables(), userId: ID.owner, rpc });
  setSupabaseClient(f.client);
  return f;
}

describe("multi-table writes go through one RPC each", () => {
  it("createOrder sends header + items to create_order", async () => {
    const f = fake({ create_order: () => ({ id: ID.order, order_code: ORDER_CODE }) });
    const order = await orders.createOrder({
      customerId: ID.customer,
      siteId: ID.site,
      orderDate: "2026-11-10",
      customerRef: "PO-1",
      expectedDelivery: "2026-11-20",
      status: "Confirmed",
      notes: "",
      items: [{ materialId: ID.material, quantity: 100, unit: "MT", sellingRate: 1860 }],
    });
    expect(order.ref).toBe(ORDER_CODE);
    const call = f.calls.find((c) => c.name === "create_order");
    expect(call?.args["p_items"]).toEqual([
      { material_id: ID.material, quantity: 100, unit: "MT", selling_rate: 1860 },
    ]);
    expect(f.log.filter((l) => l.op !== "select")).toEqual([]); // no direct table writes
  });

  it("updateOrder passes the correction reason", async () => {
    const f = fake({ update_order: () => ({ id: ID.order, order_code: ORDER_CODE }) });
    await orders.updateOrder(ID.order, {
      customerId: ID.customer,
      siteId: ID.site,
      orderDate: "2026-11-01",
      customerRef: "PO-1",
      expectedDelivery: "2026-11-20",
      status: "In Progress",
      notes: "",
      reason: "Customer revised PO",
      items: [{ materialId: ID.material, quantity: 120, unit: "MT", sellingRate: 1860 }],
    });
    expect(f.calls[0]?.args).toMatchObject({
      p_order_id: ID.order,
      p_reason: "Customer revised PO",
    });
  });

  it("createPurchase sends the labelled costs and never touches stock itself", async () => {
    const f = fake({ create_purchase: () => ({ id: ID.purchase }) });
    await purchases.createPurchase({
      providerId: ID.provider,
      materialId: ID.material,
      orderId: ID.order,
      date: "2026-11-10",
      quantity: 30,
      unit: "MT",
      rate: 1480,
      additionalCosts: [
        { label: "Loading", amount: 1200 },
        { label: "Empty", amount: 0 },
      ],
      deliveryMode: "Direct-to-Site",
      yardId: ID.yard,
    });
    expect(f.calls[0]?.args).toMatchObject({
      p_purchase: { delivery_mode: "direct_to_site", order_id: ID.order, stock_location_id: null },
      p_items: [{ unit: "MT", cost_breakdown: [{ label: "Loading", amount: 1200 }] }],
    });
    expect(f.log.some((l) => l.table === "stock_movements")).toBe(false);
  });

  it("createTrip sends trip + loading + delivery weights in IST", async () => {
    const f = fake({ create_trip: () => ({ id: ID.trip, trip_code: TRIP_CODE }) });
    const trip = await trips.createTrip({
      orderId: ID.order,
      materialId: ID.material,
      source: "provider",
      providerId: ID.provider,
      yardId: null,
      transporterId: ID.transporter,
      vehicleId: ID.vehicle,
      driverId: ID.driver,
      loadingGross: 42.18,
      loadingTare: 14.06,
      loadingSlip: "WB-1",
      loadingAt: "2026-11-10T09:00",
      delivered: true,
      deliveryGross: 41.6,
      deliveryTare: 14.05,
      deliverySlip: "S-1",
      deliveryAt: "2026-11-10T13:00",
      freight: 5800,
    });
    expect(trip.id).toBe(TRIP_CODE);
    expect(f.calls[0]?.args).toMatchObject({
      p_trip: { stock_location_id: null, provider_id: ID.provider },
      p_loading: { gross: 42.18, tare: 14.06, measured_at: "2026-11-10T09:00:00+05:30" },
      p_delivery: { slip_number: "S-1", measured_at: "2026-11-10T13:00:00+05:30" },
    });
  });

  it("saveWeight resolves the trip code and passes the reason", async () => {
    const f = fake({ save_weight_record: () => null });
    await trips.saveWeight(TRIP_CODE, {
      kind: "delivery",
      gross: 41.9,
      tare: 14.05,
      slipNo: "S-1",
      reason: "Re-read",
    });
    expect(f.calls[0]?.args).toMatchObject({
      p_trip_id: ID.trip,
      p_record_type: "delivery",
      p_reason: "Re-read",
    });
  });

  it("surfaces database validation errors as readable messages", async () => {
    fake({
      save_weight_record: () => {
        throw new Error("Give a reason for correcting a recorded weight.");
      },
    });
    await expect(
      trips.saveWeight(TRIP_CODE, { kind: "delivery", gross: 1, tare: 0, slipNo: "x", reason: "" }),
    ).rejects.toThrow("Give a reason for correcting a recorded weight.");
  });
});

describe("server-side lists", () => {
  it("pages, searches and filters trips in the query", async () => {
    fake();
    const page = await trips.listTripsPage(defaultTableQuery({ search: "4821", pageSize: 10 }));
    expect(page.total).toBe(1);
    expect(page.rows[0]?.id).toBe(TRIP_CODE);
    const none = await trips.listTripsPage(defaultTableQuery({ filters: { status: "Delivered" } }));
    expect(none.total).toBe(0);
    const byVehicle = await trips.listTripsPage(
      defaultTableQuery({ filters: { vehicle: ID.vehicle } }),
    );
    expect(byVehicle.total).toBe(1);
  });

  it("filters orders by material through the material_ids array", async () => {
    fake();
    expect(
      (await orders.listOrdersPage(defaultTableQuery({ filters: { material: ID.material } })))
        .total,
    ).toBe(1);
    expect(
      (await orders.listOrdersPage(defaultTableQuery({ filters: { material: "other" } }))).total,
    ).toBe(0);
  });

  it("lists shortages from the trip view (difference above zero)", async () => {
    fake();
    const list = await trips.listShortages();
    expect(list.map((t) => t.id)).toEqual([TRIP_CODE]);
  });

  it("builds master rows with statistics", async () => {
    fake();
    const [vehicle] = await masters.listVehicles();
    expect(vehicle).toMatchObject({
      plate: "MH12AB4821",
      driverName: "Ramesh Pawar",
      shortageCount: 1,
    });
    const [provider] = await masters.listProviders();
    expect(provider?.materialNames).toEqual(["River Sand"]);
  });
});
