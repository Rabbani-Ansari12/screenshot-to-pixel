import { describe, expect, it } from "vitest";
import type { Tables as DbTables, Views } from "@/lib/supabase";
import {
  orderPayload,
  orderStatusToDb,
  outcomeFromDb,
  outcomeToDb,
  toMaterial,
  toOrderView,
  toPurchaseView,
  toRateHistory,
  toStockMovementView,
  toTripView,
  unitFromDb,
  unitMismatchMessage,
  unitToDb,
} from "@/services/supabase/mappers";
import { toAppError } from "@/services/supabase/errors";
import { toAppSettings, toAuditEvent } from "@/services/admin.service";
import { ID, ORDER_CODE, TRIP_CODE, fixtureTables } from "./fixtures";

const t = fixtureTables();
const one = <T>(table: string) => (t[table] as unknown as T[])[0] as T;

describe("units", () => {
  it("maps every database unit both ways", () => {
    for (const u of ["MT", "CFT", "BRASS", "CUM", "TRIP", "BAG", "NOS"] as const)
      expect(unitToDb(unitFromDb(u))).toBe(u);
    expect(unitFromDb("CUM")).toBe("m³");
    expect(unitFromDb("BRASS")).toBe("Brass");
  });

  it("never treats MT and volume units as comparable", () => {
    expect(unitMismatchMessage("MT", "MT")).toBeNull();
    expect(unitMismatchMessage("MT", "Brass", "River Sand")).toMatch(
      /River Sand is traded in MT, not Brass.*never converted/,
    );
    expect(unitMismatchMessage("m³", "CFT")).toMatch(/never converted/);
  });
});

describe("trip mapper", () => {
  const trip = toTripView(one<Views<"v_trip_list">>("v_trip_list"));

  it("uses the trip code as the id and keeps the database id", () => {
    expect(trip.id).toBe(TRIP_CODE);
    expect(trip.uuid).toBe(ID.trip);
  });

  it("shows loading vs delivered quantity and the DB difference / status", () => {
    expect(trip.loadedQty).toBe(28.12);
    expect(trip.deliveredQty).toBe(27.55);
    expect(trip.difference).toBe(0.57);
    expect(trip.shortageStatus).toBe("Needs Verification");
    expect(trip.status).toBe("Needs Verification");
    expect(trip.loading).toMatchObject({
      gross: 42.18,
      tare: 14.06,
      net: 28.12,
      slipNo: "WB-1001",
      source: "Weighbridge",
    });
  });

  it("handles a trip that is not delivered yet", () => {
    const row = {
      ...one<Views<"v_trip_list">>("v_trip_list"),
      delivery_weight_id: null,
      delivered_net: null,
      quantity_difference: null,
      tolerance_status: null,
      status: "in_transit" as const,
    };
    const v = toTripView(row);
    expect(v.delivery).toBeNull();
    expect(v.deliveredQty).toBeNull();
    expect(v.shortageStatus).toBeNull();
    expect(v.status).toBe("In Transit");
  });

  it("labels yard trips as own stock", () => {
    const v = toTripView({
      ...one<Views<"v_trip_list">>("v_trip_list"),
      provider_id: null,
      provider_name: null,
      stock_location_id: ID.yard,
      stock_location_name: "Hadapsar Yard",
    });
    expect(v.providerName).toBe("Own stock");
    expect(v.yardName).toBe("Hadapsar Yard");
  });

  it("maps investigation outcomes both ways", () => {
    expect(outcomeFromDb("moisture_or_spillage_loss")).toBe("Moisture / spillage loss");
    expect(outcomeToDb("Recovered from transporter")).toBe("recovered_from_transporter");
  });
});

describe("order mapper", () => {
  it("builds the view with items, progress and code", () => {
    const view = toOrderView(
      one<Views<"v_order_list">>("v_order_list"),
      t["order_items"] as unknown as DbTables<"order_items">[],
    );
    expect(view.ref).toBe(ORDER_CODE);
    expect(view.status).toBe("In Progress");
    expect(view.items).toEqual([
      { id: ID.orderItem, materialId: ID.material, quantity: 100, unit: "MT", sellingRate: 1860 },
    ]);
    expect(view.unitLabel).toBe("MT");
    expect(view.deliveredQty).toBe(27.55);
  });

  it("turns the form into RPC payloads with database enums", () => {
    const payload = orderPayload({
      customerId: "c",
      siteId: "s",
      orderDate: "2026-11-10",
      customerRef: "PO-1",
      expectedDelivery: "",
      status: "On Hold",
      notes: "",
      items: [{ materialId: "m", quantity: 6.5, unit: "Brass", sellingRate: 9000 }],
    });
    expect(payload.order).toMatchObject({ status: "on_hold", expected_delivery: null });
    expect(payload.items[0]).toEqual({
      material_id: "m",
      quantity: 6.5,
      unit: "BRASS",
      selling_rate: 9000,
    });
    expect(orderStatusToDb("In Progress")).toBe("in_progress");
  });
});

describe("purchase, material and stock mappers", () => {
  it("keeps the labelled cost breakdown and computes the landed rate", () => {
    const p = toPurchaseView(one<Views<"v_purchase_list">>("v_purchase_list"));
    expect(p.additionalCosts).toEqual([{ label: "Loading", amount: 1200 }]);
    expect(p.totalAmount).toBe(45600);
    expect(p.landedRate).toBe(1520);
    expect(p.deliveryMode).toBe("Direct-to-Site");
  });

  it("falls back to one line when only a total is stored", () => {
    const p = toPurchaseView({
      ...one<Views<"v_purchase_list">>("v_purchase_list"),
      cost_breakdown: [],
    });
    expect(p.additionalCosts).toEqual([{ label: "Additional costs", amount: 1200 }]);
  });

  it("builds rate history, carrying the other rate forward", () => {
    const history = toRateHistory(t["material_rates"] as never);
    expect(history).toEqual([
      { date: "2026-10-01", purchaseRate: 1450, sellingRate: 1820 },
      { date: "2026-11-01", purchaseRate: 1480, sellingRate: 1820 },
    ]);
    const m = toMaterial(one<DbTables<"materials">>("materials"), t["material_rates"] as never);
    expect(m).toMatchObject({ unit: "MT", tolerance: 0.3, purchaseRate: 1480, hsn: "2505" });
  });

  it("maps stock ledger rows (trip references by trip code)", () => {
    const row = {
      id: "sm1",
      business_id: ID.business,
      stock_location_id: ID.yard,
      stock_location_name: "Hadapsar Yard",
      material_id: ID.material,
      material_name: "River Sand",
      unit: "MT" as const,
      movement_type: "issued" as const,
      quantity: -26,
      movement_date: "2026-11-09",
      notes: null,
      reference_type: "trip",
      reference_code: TRIP_CODE,
      reference_id: ID.trip,
      balance_after: 124,
      created_at: "2026-11-09T00:00:00Z",
    };
    expect(toStockMovementView(row)).toMatchObject({
      type: "Issued",
      quantity: -26,
      referenceType: "Trip",
      referenceId: TRIP_CODE,
      balance: 124,
    });
  });
});

describe("settings and audit mappers", () => {
  it("maps app_settings to the settings page model", () => {
    const s = toAppSettings(
      one<DbTables<"app_settings">>("app_settings"),
      one<DbTables<"businesses">>("businesses"),
    );
    expect(s.autoProcessThreshold).toBe(85);
    expect(s.authoritativeWeight).toBe("Delivery");
    expect(s.invoiceNumbering).toEqual({
      prefix: "INV",
      format: "{PREFIX}-{YYYY}-{SEQ:4}",
      nextNumber: 1,
    });
    expect(s.enabledUnits).toContain("m³");
    expect(s.gst.defaultMode).toBe("CGST+SGST");
  });

  it("shows a corrected weight as a correction with old/new values, user and reason", () => {
    const e = toAuditEvent(
      one<DbTables<"audit_logs">>("audit_logs"),
      new Map([[ID.employee, "Neha Kulkarni"]]),
    );
    expect(e).toMatchObject({
      action: "Corrected",
      userName: "Neha Kulkarni",
      note: "Slip re-read",
    });
    expect(e.changes).toEqual([{ field: "Gross", from: "41.6", to: "41.9" }]);
  });
});

describe("error mapping", () => {
  it("turns RLS and constraint errors into readable messages", () => {
    expect(
      toAppError({
        code: "42501",
        message: 'new row violates row-level security policy for table "x"',
      }).message,
    ).toMatch(/permission/);
    expect(
      toAppError({
        code: "23505",
        message: "duplicate key value violates unique constraint vehicles_business_number_key",
      }).message,
    ).toMatch(/vehicle/);
    expect(
      toAppError({ code: "22023", message: "Give a reason for correcting a recorded weight." })
        .message,
    ).toBe("Give a reason for correcting a recorded weight.");
    expect(toAppError(new TypeError("Failed to fetch")).message).toMatch(/internet/);
  });
});
