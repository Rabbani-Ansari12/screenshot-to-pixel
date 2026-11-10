import { formatDate, formatMonth } from "@/lib/format";
import { clone, db, delay } from "./core";
import {
  lookup,
  profitOf,
  toBillView,
  toExpenseView,
  toInvoiceView,
  toTripView,
  tripPurchaseCost,
  tripSalesValue,
} from "./views";

export type ReportId =
  | "daily"
  | "monthly"
  | "customer"
  | "material"
  | "provider-purchase"
  | "transporter-expense"
  | "vehicle-trips"
  | "shortage"
  | "pending-bills"
  | "customer-outstanding"
  | "payables"
  | "expense"
  | "order-pl"
  | "monthly-pl";

export interface ReportMeta {
  id: ReportId;
  title: string;
  description: string;
  category: "Operations" | "Sales" | "Purchases" | "Finance";
}

export const REPORTS: ReportMeta[] = [
  {
    id: "daily",
    title: "Daily Report",
    description: "Trips, quantities and value for each day.",
    category: "Operations",
  },
  {
    id: "monthly",
    title: "Monthly Report",
    description: "Month-wise dispatch, delivery and sales.",
    category: "Operations",
  },
  {
    id: "customer",
    title: "Customer-wise Report",
    description: "Sales, quantity and outstanding per customer.",
    category: "Sales",
  },
  {
    id: "material",
    title: "Material-wise Report",
    description: "Quantity, sales and margin by material.",
    category: "Sales",
  },
  {
    id: "provider-purchase",
    title: "Provider Purchase Report",
    description: "Purchases and payables per material provider.",
    category: "Purchases",
  },
  {
    id: "transporter-expense",
    title: "Transporter Expense Report",
    description: "Freight cost per transporter, per trip and per MT.",
    category: "Purchases",
  },
  {
    id: "vehicle-trips",
    title: "Vehicle-wise Trip Report",
    description: "Trips and delivery differences per vehicle.",
    category: "Operations",
  },
  {
    id: "shortage",
    title: "Shortage Report",
    description: "Trips above tolerance and their outcomes.",
    category: "Operations",
  },
  {
    id: "pending-bills",
    title: "Pending Bills Report",
    description: "Provider and transporter bills not yet reconciled or paid.",
    category: "Finance",
  },
  {
    id: "customer-outstanding",
    title: "Customer Outstanding Report",
    description: "Unpaid invoice balances by customer.",
    category: "Finance",
  },
  {
    id: "payables",
    title: "Payables Report",
    description: "What we owe providers and transporters.",
    category: "Finance",
  },
  {
    id: "expense",
    title: "Expense Report",
    description: "Operating expenses by category and month.",
    category: "Finance",
  },
  {
    id: "order-pl",
    title: "Order-wise P&L",
    description: "Estimated profit for every order.",
    category: "Finance",
  },
  {
    id: "monthly-pl",
    title: "Monthly P&L",
    description: "Sales, costs and estimated profit per month.",
    category: "Finance",
  },
];

export type ColumnFormat = "text" | "inr" | "number" | "qty" | "percent" | "date";

export interface ReportResult {
  meta: ReportMeta;
  columns: { key: string; label: string; format: ColumnFormat }[];
  rows: Record<string, string | number>[];
  chart: {
    type: "bar" | "line";
    xKey: string;
    series: { key: string; label: string }[];
    data: Record<string, string | number>[];
    valueFormat: ColumnFormat;
  } | null;
  summary: { label: string; value: number; format: ColumnFormat }[];
}

export interface ReportFilters {
  from: string;
  to: string;
}

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const inRange = (date: string, f: ReportFilters) =>
  (!f.from || date.slice(0, 10) >= f.from) && (!f.to || date.slice(0, 10) <= f.to);

// TODO(backend): each report becomes a Postgres view or RPC; filters passed as parameters.
export async function getReport(id: ReportId, filters: ReportFilters): Promise<ReportResult> {
  await delay(350);
  const meta = REPORTS.find((r) => r.id === id) ?? REPORTS[0]!;
  const trips = db.trips.filter((t) => inRange(t.loading.at, filters));
  const tripViews = trips.map(toTripView);
  const invoices = db.invoices.filter((i) => inRange(i.date, filters)).map(toInvoiceView);
  const bills = db.bills.filter((b) => inRange(b.date, filters)).map(toBillView);
  const expenses = db.expenses.filter((e) => inRange(e.date, filters)).map(toExpenseView);
  let result: Omit<ReportResult, "meta">;

  switch (id) {
    case "daily": {
      const days = [...new Set(trips.map((t) => t.loading.at.slice(0, 10)))].sort().reverse();
      const rows = days.map((d) => {
        const ts = trips.filter((t) => t.loading.at.startsWith(d));
        return {
          date: d,
          trips: ts.length,
          loaded: sum(ts.map((t) => t.loading.net)),
          delivered: sum(ts.map((t) => t.delivery?.net ?? 0)),
          value: Math.round(sum(ts.map(tripSalesValue))),
        };
      });
      result = {
        columns: [
          { key: "date", label: "Date", format: "date" },
          { key: "trips", label: "Trips", format: "number" },
          { key: "loaded", label: "Loaded qty", format: "number" },
          { key: "delivered", label: "Delivered qty", format: "number" },
          { key: "value", label: "Sales value", format: "inr" },
        ],
        rows,
        chart: {
          type: "bar",
          xKey: "label",
          series: [{ key: "trips", label: "Trips" }],
          data: rows
            .slice(0, 21)
            .reverse()
            .map((r) => ({ label: formatDate(r.date).slice(0, 6), trips: r.trips })),
          valueFormat: "number",
        },
        summary: [
          { label: "Trips", value: trips.length, format: "number" },
          { label: "Sales value", value: sum(rows.map((r) => r.value)), format: "inr" },
        ],
      };
      break;
    }
    case "monthly":
    case "monthly-pl": {
      const months = [
        ...new Set(trips.map((t) => (t.delivery?.at ?? t.loading.at).slice(0, 7))),
      ].sort();
      const rows = months.map((m) => {
        const ts = trips.filter((t) => (t.delivery?.at ?? t.loading.at).startsWith(m));
        const p = profitOf(
          ts,
          expenses.filter((e) => e.date.startsWith(m)),
        );
        return {
          month: formatMonth(m),
          trips: ts.length,
          loaded: sum(ts.map((t) => t.loading.net)),
          delivered: sum(ts.map((t) => t.delivery?.net ?? 0)),
          sales: p.salesValue,
          cost: p.salesValue - p.profit,
          profit: p.profit,
          margin: Math.round(p.marginPct * 10) / 10,
        };
      });
      const pl = id === "monthly-pl";
      result = {
        columns: pl
          ? [
              { key: "month", label: "Month", format: "text" },
              { key: "sales", label: "Sales value", format: "inr" },
              { key: "cost", label: "Total cost", format: "inr" },
              { key: "profit", label: "Estimated profit", format: "inr" },
              { key: "margin", label: "Margin", format: "percent" },
            ]
          : [
              { key: "month", label: "Month", format: "text" },
              { key: "trips", label: "Trips", format: "number" },
              { key: "loaded", label: "Dispatched qty", format: "number" },
              { key: "delivered", label: "Delivered qty", format: "number" },
              { key: "sales", label: "Sales value", format: "inr" },
            ],
        rows,
        chart: pl
          ? {
              type: "line",
              xKey: "month",
              series: [
                { key: "sales", label: "Sales" },
                { key: "cost", label: "Cost" },
                { key: "profit", label: "Profit" },
              ],
              data: rows,
              valueFormat: "inr",
            }
          : {
              type: "bar",
              xKey: "month",
              series: [{ key: "trips", label: "Trips" }],
              data: rows,
              valueFormat: "number",
            },
        summary: [
          { label: "Sales value", value: sum(rows.map((r) => r.sales)), format: "inr" },
          { label: "Estimated profit", value: sum(rows.map((r) => r.profit)), format: "inr" },
        ],
      };
      break;
    }
    case "customer":
    case "customer-outstanding": {
      const rows = db.customers
        .map((c) => {
          const inv = invoices.filter((i) => i.customerId === c.id);
          const ts = tripViews.filter((t) => t.customerId === c.id);
          return {
            customer: c.name,
            trips: ts.length,
            quantity: sum(ts.map((t) => t.deliveredQty ?? 0)),
            invoiced: sum(inv.map((i) => i.total)),
            received: sum(inv.map((i) => i.paid)),
            outstanding: sum(inv.map((i) => i.balance)),
            overdue: sum(inv.filter((i) => i.overdueDays > 0).map((i) => i.balance)),
          };
        })
        .filter((r) => r.invoiced > 0 || r.trips > 0)
        .sort((a, b) =>
          id === "customer" ? b.invoiced - a.invoiced : b.outstanding - a.outstanding,
        );
      const outstanding = id === "customer-outstanding";
      result = {
        columns: outstanding
          ? [
              { key: "customer", label: "Customer", format: "text" },
              { key: "invoiced", label: "Invoiced", format: "inr" },
              { key: "received", label: "Received", format: "inr" },
              { key: "outstanding", label: "Outstanding", format: "inr" },
              { key: "overdue", label: "Overdue", format: "inr" },
            ]
          : [
              { key: "customer", label: "Customer", format: "text" },
              { key: "trips", label: "Trips", format: "number" },
              { key: "quantity", label: "Delivered qty", format: "number" },
              { key: "invoiced", label: "Invoiced", format: "inr" },
              { key: "outstanding", label: "Outstanding", format: "inr" },
            ],
        rows,
        chart: {
          type: "bar",
          xKey: "customer",
          series: [
            {
              key: outstanding ? "outstanding" : "invoiced",
              label: outstanding ? "Outstanding" : "Invoiced",
            },
          ],
          data: rows
            .slice(0, 8)
            .map((r) => ({ ...r, customer: r.customer.split(" ").slice(0, 2).join(" ") })),
          valueFormat: "inr",
        },
        summary: [
          { label: "Invoiced", value: sum(rows.map((r) => r.invoiced)), format: "inr" },
          { label: "Outstanding", value: sum(rows.map((r) => r.outstanding)), format: "inr" },
        ],
      };
      break;
    }
    case "material": {
      const rows = db.materials
        .map((m) => {
          const ts = trips.filter((t) => t.materialId === m.id);
          const sales = sum(ts.map(tripSalesValue));
          const cost = sum(ts.map((t) => tripPurchaseCost(t) + t.freight));
          return {
            material: m.name,
            unit: m.unit,
            trips: ts.length,
            quantity: sum(ts.map((t) => t.delivery?.net ?? t.loading.net)),
            sales: Math.round(sales),
            margin: Math.round(sales - cost),
            marginPct: sales ? Math.round(((sales - cost) / sales) * 1000) / 10 : 0,
          };
        })
        .filter((r) => r.trips > 0);
      result = {
        columns: [
          { key: "material", label: "Material", format: "text" },
          { key: "unit", label: "Unit", format: "text" },
          { key: "quantity", label: "Quantity", format: "number" },
          { key: "sales", label: "Sales value", format: "inr" },
          { key: "margin", label: "Gross margin", format: "inr" },
          { key: "marginPct", label: "Margin %", format: "percent" },
        ],
        rows,
        chart: {
          type: "bar",
          xKey: "material",
          series: [{ key: "margin", label: "Gross margin" }],
          data: rows,
          valueFormat: "inr",
        },
        summary: [
          { label: "Sales value", value: sum(rows.map((r) => r.sales)), format: "inr" },
          { label: "Gross margin", value: sum(rows.map((r) => r.margin)), format: "inr" },
        ],
      };
      break;
    }
    case "provider-purchase": {
      const rows = db.providers.map((p) => {
        const ps = db.purchases.filter((x) => x.providerId === p.id && inRange(x.date, filters));
        const value = sum(
          ps.map((x) => x.quantity * x.rate + x.additionalCosts.reduce((s, c) => s + c.amount, 0)),
        );
        const pb = bills.filter((b) => b.kind === "Provider" && b.partyId === p.id);
        return {
          provider: p.name,
          purchases: ps.length,
          quantity: sum(ps.map((x) => x.quantity)),
          value: Math.round(value),
          billed: sum(pb.map((b) => b.total)),
          payable: sum(pb.map((b) => b.outstanding)),
        };
      });
      result = {
        columns: [
          { key: "provider", label: "Provider", format: "text" },
          { key: "purchases", label: "Purchases", format: "number" },
          { key: "quantity", label: "Quantity", format: "number" },
          { key: "value", label: "Purchase value", format: "inr" },
          { key: "billed", label: "Billed (incl. GST)", format: "inr" },
          { key: "payable", label: "Payable", format: "inr" },
        ],
        rows,
        chart: {
          type: "bar",
          xKey: "provider",
          series: [{ key: "value", label: "Purchase value" }],
          data: rows.map((r) => ({ ...r, provider: r.provider.split(" ")[0] ?? r.provider })),
          valueFormat: "inr",
        },
        summary: [
          { label: "Purchase value", value: sum(rows.map((r) => r.value)), format: "inr" },
          { label: "Payable", value: sum(rows.map((r) => r.payable)), format: "inr" },
        ],
      };
      break;
    }
    case "transporter-expense": {
      const rows = db.transporters.map((t) => {
        const ts = trips.filter((x) => x.transporterId === t.id);
        const freight = sum(ts.map((x) => x.freight));
        const mt = sum(
          ts.filter((x) => lookup.material(x.materialId)?.unit === "MT").map((x) => x.loading.net),
        );
        return {
          transporter: t.name,
          trips: ts.length,
          freight,
          perTrip: ts.length ? Math.round(freight / ts.length) : 0,
          perMT: mt
            ? Math.round(
                sum(
                  ts
                    .filter((x) => lookup.material(x.materialId)?.unit === "MT")
                    .map((x) => x.freight),
                ) / mt,
              )
            : 0,
        };
      });
      result = {
        columns: [
          { key: "transporter", label: "Transporter", format: "text" },
          { key: "trips", label: "Trips", format: "number" },
          { key: "freight", label: "Total freight", format: "inr" },
          { key: "perTrip", label: "Avg per trip", format: "inr" },
          { key: "perMT", label: "Avg per MT", format: "inr" },
        ],
        rows,
        chart: {
          type: "bar",
          xKey: "transporter",
          series: [{ key: "perMT", label: "Cost per MT" }],
          data: rows.map((r) => ({
            ...r,
            transporter: r.transporter.split(" ").slice(0, 2).join(" "),
          })),
          valueFormat: "inr",
        },
        summary: [
          { label: "Total freight", value: sum(rows.map((r) => r.freight)), format: "inr" },
          { label: "Trips", value: sum(rows.map((r) => r.trips)), format: "number" },
        ],
      };
      break;
    }
    case "vehicle-trips":
    case "shortage": {
      if (id === "shortage") {
        const rows = tripViews
          .filter((t) => t.shortageStatus && t.shortageStatus !== "Normal")
          .map((t) => ({
            trip: t.id,
            date: t.loading.at,
            vehicle: t.vehiclePlate,
            material: t.materialName,
            loaded: t.loadedQty,
            delivered: t.deliveredQty ?? 0,
            difference: t.difference ?? 0,
            status: t.shortageStatus ?? "",
            outcome: t.investigation?.outcome ?? "Pending",
          }));
        const byVehicle = [...new Set(rows.map((r) => r.vehicle))]
          .map((v) => ({ vehicle: v, trips: rows.filter((r) => r.vehicle === v).length }))
          .sort((a, b) => b.trips - a.trips);
        result = {
          columns: [
            { key: "trip", label: "Trip", format: "text" },
            { key: "date", label: "Date", format: "date" },
            { key: "vehicle", label: "Vehicle", format: "text" },
            { key: "material", label: "Material", format: "text" },
            { key: "difference", label: "Difference", format: "number" },
            { key: "status", label: "Status", format: "text" },
            { key: "outcome", label: "Outcome", format: "text" },
          ],
          rows,
          chart: {
            type: "bar",
            xKey: "vehicle",
            series: [{ key: "trips", label: "Trips above tolerance" }],
            data: byVehicle,
            valueFormat: "number",
          },
          summary: [
            { label: "Trips above tolerance", value: rows.length, format: "number" },
            {
              label: "Total difference",
              value: sum(rows.map((r) => r.difference)),
              format: "number",
            },
          ],
        };
      } else {
        const rows = db.vehicles
          .map((v) => {
            const ts = tripViews.filter((t) => t.vehicleId === v.id);
            const done = ts.filter((t) => t.difference !== null);
            return {
              vehicle: v.plate,
              transporter: lookup.transporter(v.transporterId)?.name ?? "",
              trips: ts.length,
              loaded: sum(ts.map((t) => t.loadedQty)),
              avgDiff: done.length
                ? Math.round((sum(done.map((t) => t.difference ?? 0)) / done.length) * 100) / 100
                : 0,
              aboveTolerance: done.filter((t) => t.shortageStatus !== "Normal").length,
            };
          })
          .filter((r) => r.trips > 0);
        result = {
          columns: [
            { key: "vehicle", label: "Vehicle", format: "text" },
            { key: "transporter", label: "Transporter", format: "text" },
            { key: "trips", label: "Trips", format: "number" },
            { key: "loaded", label: "Loaded qty", format: "number" },
            { key: "avgDiff", label: "Avg difference", format: "number" },
            { key: "aboveTolerance", label: "Above tolerance", format: "number" },
          ],
          rows,
          chart: {
            type: "bar",
            xKey: "vehicle",
            series: [{ key: "trips", label: "Trips" }],
            data: rows,
            valueFormat: "number",
          },
          summary: [
            { label: "Vehicles", value: rows.length, format: "number" },
            { label: "Trips", value: sum(rows.map((r) => r.trips)), format: "number" },
          ],
        };
      }
      break;
    }
    case "pending-bills":
    case "payables": {
      const open = bills.filter((b) =>
        id === "pending-bills"
          ? b.reconStatus !== "Reconciled" || b.outstanding > 0
          : b.outstanding > 0,
      );
      const rows = open.map((b) => ({
        bill: b.billNo,
        party: b.partyName,
        kind: b.kind,
        date: b.date,
        total: b.total,
        paid: b.paid,
        outstanding: b.outstanding,
        status: b.reconStatus,
        overdue: b.overdueDays,
      }));
      const byParty = [...new Set(rows.map((r) => r.party))]
        .map((p) => ({
          party: p.split(" ").slice(0, 2).join(" "),
          outstanding: sum(rows.filter((r) => r.party === p).map((r) => r.outstanding)),
        }))
        .sort((a, b) => b.outstanding - a.outstanding);
      result = {
        columns: [
          { key: "bill", label: "Bill no.", format: "text" },
          { key: "party", label: "Party", format: "text" },
          { key: "kind", label: "Type", format: "text" },
          { key: "date", label: "Date", format: "date" },
          { key: "total", label: "Total", format: "inr" },
          { key: "outstanding", label: "Outstanding", format: "inr" },
          { key: "status", label: "Reconciliation", format: "text" },
        ],
        rows,
        chart: {
          type: "bar",
          xKey: "party",
          series: [{ key: "outstanding", label: "Outstanding" }],
          data: byParty,
          valueFormat: "inr",
        },
        summary: [
          { label: "Bills", value: rows.length, format: "number" },
          { label: "Outstanding", value: sum(rows.map((r) => r.outstanding)), format: "inr" },
        ],
      };
      break;
    }
    case "expense": {
      const cats = [...new Set(expenses.map((e) => e.category))];
      const rows = expenses.map((e) => ({
        id: e.id,
        date: e.date,
        category: e.category,
        description: e.description,
        paidTo: e.paidTo,
        amount: e.amount,
        linked: e.tripRef ?? e.orderRef ?? "—",
      }));
      result = {
        columns: [
          { key: "date", label: "Date", format: "date" },
          { key: "category", label: "Category", format: "text" },
          { key: "description", label: "Description", format: "text" },
          { key: "paidTo", label: "Paid to", format: "text" },
          { key: "linked", label: "Linked to", format: "text" },
          { key: "amount", label: "Amount", format: "inr" },
        ],
        rows,
        chart: {
          type: "bar",
          xKey: "category",
          series: [{ key: "amount", label: "Amount" }],
          data: cats
            .map((c) => ({
              category: c,
              amount: sum(expenses.filter((e) => e.category === c).map((e) => e.amount)),
            }))
            .sort((a, b) => Number(b.amount) - Number(a.amount)),
          valueFormat: "inr",
        },
        summary: [
          { label: "Expenses", value: rows.length, format: "number" },
          { label: "Total", value: sum(rows.map((r) => r.amount)), format: "inr" },
        ],
      };
      break;
    }
    case "order-pl": {
      const rows = db.orders
        .filter((o) => trips.some((t) => t.orderId === o.id))
        .map((o) => {
          const ts = trips.filter((t) => t.orderId === o.id);
          const p = profitOf(
            ts,
            expenses.filter((e) => e.orderId === o.id),
          );
          return {
            order: o.ref,
            customer: lookup.customer(o.customerId)?.name ?? "",
            sales: p.salesValue,
            purchase: p.purchaseCost,
            transport: p.transportCost,
            other: p.loadingUnloading + p.labour + p.other,
            profit: p.profit,
            margin: Math.round(p.marginPct * 10) / 10,
          };
        })
        .reverse();
      result = {
        columns: [
          { key: "order", label: "Order", format: "text" },
          { key: "customer", label: "Customer", format: "text" },
          { key: "sales", label: "Sales", format: "inr" },
          { key: "purchase", label: "Purchase", format: "inr" },
          { key: "transport", label: "Transport", format: "inr" },
          { key: "other", label: "Other costs", format: "inr" },
          { key: "profit", label: "Est. profit", format: "inr" },
          { key: "margin", label: "Margin", format: "percent" },
        ],
        rows,
        chart: {
          type: "bar",
          xKey: "order",
          series: [{ key: "profit", label: "Estimated profit" }],
          data: rows
            .slice(0, 12)
            .reverse()
            .map((r) => ({ ...r, order: r.order.replace("ORD-2026-", "#") })),
          valueFormat: "inr",
        },
        summary: [
          { label: "Sales", value: sum(rows.map((r) => r.sales)), format: "inr" },
          { label: "Estimated profit", value: sum(rows.map((r) => r.profit)), format: "inr" },
        ],
      };
      break;
    }
  }
  return clone({ meta, ...result });
}
