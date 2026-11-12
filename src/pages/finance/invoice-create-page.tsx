import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { AdditionalCost, GstMode } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState, InfoNote, SectionCard } from "@/components/common";
import { EntityPicker } from "@/components/entity-picker";
import { PageHeader } from "@/components/page-header";
import {
  api,
  useAction,
  useInvoiceableTrips,
  useMasterOptions,
  useOrder,
  useSettings,
} from "@/hooks/queries";
import { formatDate, formatINR, formatNumber, todayIST } from "@/lib/format";
import { gstModeFor, gstStateCode } from "@/lib/gst";
import { InvoiceDocument, type InvoiceDocLine } from "./invoice-document";

export function InvoiceCreatePage({ orderId: initialOrder }: { orderId?: string }) {
  const navigate = useNavigate();
  const { data: options } = useMasterOptions();
  const { data: settings } = useSettings();
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState(initialOrder ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gstOn, setGstOn] = useState(true);
  const [date, setDate] = useState(todayIST());
  const [charges, setCharges] = useState<AdditionalCost[]>([]);
  const [notes, setNotes] = useState("");
  const { data: trips, isLoading: tripsLoading } = useInvoiceableTrips(orderId);
  const { data: orderDetail } = useOrder(orderId);
  const create = useAction(
    api.invoices.createInvoice,
    (i) => `Invoice ${i.number} created (${i.gstMode === "None" ? "no GST" : i.gstMode})`,
  );

  useEffect(() => {
    if (initialOrder && options)
      setCustomerId(options.orders.find((o) => o.id === initialOrder)?.customerId ?? "");
  }, [initialOrder, options]);
  const customer = options?.customers.find((c) => c.id === customerId);
  // Same rule as the database: place of supply (customer GSTIN / state) vs our state.
  const placeMode = gstModeFor(settings?.gst.stateCode, customer ?? {}, settings?.gst.defaultMode);
  const gstMode: GstMode = gstOn ? placeMode : "None";
  const placeCode = gstStateCode(customer?.gstin) ?? gstStateCode(customer?.state);
  useEffect(() => {
    setSelected(new Set((trips ?? []).map((t) => t.id)));
  }, [trips]);

  const customerOptions = useMemo(
    () => (options?.customers ?? []).map((c) => ({ value: c.id, label: c.name, hint: c.state })),
    [options],
  );
  const orderOptions = useMemo(
    () =>
      (options?.orders ?? [])
        .filter(
          (o) => o.customerId === customerId && o.status !== "Draft" && o.status !== "Cancelled",
        )
        .map((o) => ({
          value: o.id,
          label: o.ref,
          hint: options?.sites.find((s) => s.id === o.siteId)?.name ?? "",
        })),
    [options, customerId],
  );
  const chosen = (trips ?? []).filter((t) => selected.has(t.id));
  const lines: InvoiceDocLine[] = useMemo(() => {
    const byMaterial = new Map<string, typeof chosen>();
    chosen.forEach((t) =>
      byMaterial.set(t.materialId, [...(byMaterial.get(t.materialId) ?? []), t]),
    );
    return [...byMaterial.entries()].map(([materialId, ts]) => {
      const m = options?.materials.find((x) => x.id === materialId);
      const rate =
        orderDetail?.order.items.find((i) => i.materialId === materialId)?.sellingRate ??
        m?.sellingRate ??
        0;
      return {
        description: m?.name ?? materialId,
        hsn: m?.hsn ?? "",
        quantity: ts.reduce((s, t) => s + (t.deliveredQty ?? 0), 0),
        unit: m?.unit ?? "MT",
        rate,
        gstRate: m?.gstRate ?? 5,
        trips: ts.length,
      };
    });
  }, [chosen, options, orderDetail]);
  const site = options?.sites.find(
    (s) => s.id === options.orders.find((o) => o.id === orderId)?.siteId,
  );
  const due = new Date(`${date}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + (customer?.creditDays ?? 30));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = async () => {
    const inv = await create.mutateAsync({
      customerId,
      orderId,
      date,
      tripIds: [...selected],
      gstMode,
      additionalCharges: charges.filter((c) => c.label && c.amount > 0),
      notes,
    });
    void navigate({ to: "/invoices/$invoiceId", params: { invoiceId: inv.id } });
  };

  return (
    <>
      <PageHeader
        title="Create invoice from deliveries"
        crumbs={[{ label: "New" }]}
        description="Pick the order, tick the delivered trips, and quantities, rates and GST fill in automatically."
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <SectionCard title="1 · Customer & order">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-customer">Customer</Label>
                <EntityPicker
                  id="inv-customer"
                  value={customerId}
                  onChange={(v) => {
                    setCustomerId(v);
                    setOrderId("");
                  }}
                  options={customerOptions}
                  placeholder="Choose customer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-order">Order</Label>
                <EntityPicker
                  id="inv-order"
                  value={orderId}
                  onChange={setOrderId}
                  options={orderOptions}
                  placeholder={customerId ? "Choose order" : "Choose customer first"}
                  disabled={!customerId}
                />
              </div>
            </div>
          </SectionCard>
          <SectionCard
            title="2 · Confirmed deliveries"
            description="Delivered trips not on any invoice yet. Quantity = delivery weight."
            actions={
              trips?.length ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(
                      selected.size === trips.length ? new Set() : new Set(trips.map((t) => t.id)),
                    )
                  }
                >
                  {selected.size === trips.length ? "Clear all" : "Select all"}
                </Button>
              ) : null
            }
          >
            {!orderId ? (
              <EmptyState title="Choose an order" className="py-6" />
            ) : tripsLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading deliveries…</p>
            ) : !trips?.length ? (
              <EmptyState
                title="Nothing left to invoice"
                description="Every delivered trip on this order is already invoiced."
                className="py-6"
              />
            ) : (
              <ul className="max-h-[360px] divide-y overflow-y-auto rounded-lg border">
                {trips.map((t) => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                      <Checkbox
                        checked={selected.has(t.id)}
                        onCheckedChange={() => toggle(t.id)}
                        aria-label={`Include ${t.id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {t.id} · {t.materialName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(t.delivery?.at)} · {t.vehiclePlate} · slip{" "}
                          {t.delivery?.slipNo}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums">
                        {formatNumber(t.deliveredQty ?? 0, 2)} {t.unit}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="3 · Tax & charges">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-date">Invoice date</Label>
                <Input
                  id="inv-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>GST</Label>
                <ToggleGroup
                  type="single"
                  value={gstOn ? "on" : "off"}
                  onValueChange={(v) => v && setGstOn(v === "on")}
                  variant="outline"
                  className="w-full"
                  aria-label="GST"
                >
                  <ToggleGroupItem value="on" className="flex-1">
                    {placeMode === "IGST" ? "IGST" : "CGST + SGST"}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="off" className="flex-1">
                    No GST
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  {customer
                    ? placeCode
                      ? placeMode === "IGST"
                        ? `Place of supply ${placeCode} (${customer.state || "other state"}) → IGST`
                        : `Place of supply ${placeCode}, same state as us → CGST + SGST`
                      : "Customer state unknown → default tax mode from settings"
                    : "Split by the customer's place of supply"}
                </p>
              </div>
            </div>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-medium">Additional charges</legend>
              {charges.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_130px_auto] gap-2">
                  <Input
                    value={c.label}
                    onChange={(e) =>
                      setCharges((all) =>
                        all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    placeholder="e.g. Unloading charges"
                    aria-label="Charge label"
                  />
                  <Input
                    type="number"
                    value={Number.isFinite(c.amount) ? c.amount : ""}
                    onChange={(e) =>
                      setCharges((all) =>
                        all.map((x, j) => (j === i ? { ...x, amount: e.target.valueAsNumber } : x)),
                      )
                    }
                    placeholder="₹"
                    aria-label="Charge amount"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCharges((all) => all.filter((_, j) => j !== i))}
                    aria-label="Remove charge"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCharges((all) => [...all, { label: "", amount: Number.NaN }])}
              >
                <Plus className="size-4" /> Add charge
              </Button>
            </fieldset>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="inv-notes">Notes on invoice</Label>
              <Textarea
                id="inv-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </SectionCard>
          <InfoNote>
            The invoice starts as <strong>Unpaid</strong>. It becomes Partial or Paid as payments
            are recorded against it.
          </InfoNote>
        </div>
        <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <InvoiceDocument
            draft
            settings={settings}
            number={`${settings?.invoiceNumbering.prefix ?? "INV"}-${date.slice(0, 4)}-${String(settings?.invoiceNumbering.nextNumber ?? 0).padStart(4, "0")}`}
            date={date}
            dueDate={due.toISOString().slice(0, 10)}
            customer={{
              name: customer?.name ?? "",
              gstin: customer?.gstin ?? "",
              billingAddress: customer?.billingAddress ?? "",
              state: customer?.state ?? "",
            }}
            siteName={site?.name ?? ""}
            orderRef={options?.orders.find((o) => o.id === orderId)?.ref ?? ""}
            placeOfSupply={placeCode ?? ""}
            lines={lines}
            gstMode={gstMode}
            additionalCharges={charges.filter((c) => Number.isFinite(c.amount))}
            notes={notes}
          />
          <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
            <span className="text-sm text-muted-foreground">
              {selected.size} trip{selected.size === 1 ? "" : "s"} ·{" "}
              {formatINR(lines.reduce((s, l) => s + l.quantity * l.rate, 0))} before tax
            </span>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/invoices">Cancel</Link>
              </Button>
              <Button
                onClick={submit}
                disabled={!orderId || selected.size === 0 || create.isPending}
              >
                {create.isPending && <Loader2 className="size-4 animate-spin" />}Create invoice
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
