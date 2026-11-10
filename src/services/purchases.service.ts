import type {
  AdditionalCost,
  DeliveryMode,
  DocumentRecord,
  Purchase,
  PurchaseView,
  TripView,
  Unit,
} from "@/types";
import { NotFoundError, clone, db, delay, logAudit, nextId } from "./core";
import { toPurchaseView, toTripView } from "./views";

export interface PurchaseInput {
  providerId: string;
  materialId: string;
  orderId: string | null;
  date: string;
  quantity: number;
  unit: Unit;
  rate: number;
  additionalCosts: AdditionalCost[];
  deliveryMode: DeliveryMode;
  yardId: string | null;
}

export interface RatePointView {
  date: string;
  rate: number;
  ref: string;
  quantity: number;
}

// TODO(backend): supabase.from("purchases_view").select("*")
export async function listPurchases(): Promise<PurchaseView[]> {
  await delay();
  return clone(db.purchases.map(toPurchaseView).reverse());
}

export async function getPurchase(id: string): Promise<{
  purchase: PurchaseView;
  trips: TripView[];
  documents: DocumentRecord[];
  rateHistory: RatePointView[];
}> {
  await delay();
  const p = db.purchases.find((x) => x.id === id);
  if (!p) throw new NotFoundError(`Purchase ${id}`);
  const trips = db.trips.filter((t) => t.purchaseId === id);
  const docIds = new Set(
    trips.flatMap((t) => [t.loading.documentId, t.delivery?.documentId]).filter(Boolean),
  );
  return clone({
    purchase: toPurchaseView(p),
    trips: trips.map(toTripView),
    documents: db.documents.filter((d) => docIds.has(d.id)),
    rateHistory: rateHistorySync(p.providerId, p.materialId),
  });
}

function rateHistorySync(providerId: string, materialId: string): RatePointView[] {
  return db.purchases
    .filter((p) => p.providerId === providerId && p.materialId === materialId)
    .map((p) => ({ date: p.date, rate: p.rate, ref: p.ref, quantity: p.quantity }));
}

/** Historical purchase rates for a provider + material (used by the form chart). */
export async function getRateHistory(
  providerId: string,
  materialId: string,
): Promise<RatePointView[]> {
  await delay(150);
  return rateHistorySync(providerId, materialId);
}

// TODO(backend): supabase.from("purchases").insert(...)
export async function createPurchase(input: PurchaseInput): Promise<Purchase> {
  await delay(400);
  const id = nextId("PUR-2026-", db.purchases);
  const purchase: Purchase = {
    ...input,
    id,
    ref: id,
    documentIds: [],
    status: "Recorded",
    source: "Manual",
  };
  db.purchases.push(purchase);
  if (input.deliveryMode === "Stock-Yard" && input.yardId) {
    db.stockMovements.push({
      id: `STK-${id}`,
      yardId: input.yardId,
      materialId: input.materialId,
      date: input.date,
      type: "Received",
      quantity: input.quantity,
      referenceType: "Purchase",
      referenceId: id,
      note: "Received at yard from provider",
    });
  }
  logAudit({
    action: "Created",
    entityType: "Purchase",
    entityId: id,
    entityLabel: id,
    changes: [{ field: "Quantity", from: "—", to: `${input.quantity} ${input.unit}` }],
  });
  return clone(purchase);
}
