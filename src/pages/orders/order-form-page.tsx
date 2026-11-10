import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Order, Unit } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DetailSkeleton, InfoNote, SectionCard } from "@/components/common";
import { EntityPicker } from "@/components/entity-picker";
import { PageHeader } from "@/components/page-header";
import { api, useAction, useMasterOptions, useOrderRecord } from "@/hooks/queries";
import { formatINR, todayIST } from "@/lib/format";
import { unitMismatchMessage } from "@/services/supabase/mappers";
import { ORDER_STATUSES } from "./orders-page";

const UNITS: Unit[] = ["MT", "CFT", "Brass", "m³", "Trips", "Bags", "Nos"];

const schema = z
  .object({
    customerId: z.string().min(1, "Choose a customer"),
    siteId: z.string().min(1, "Choose a site"),
    orderDate: z.string().min(1, "Required"),
    customerRef: z.string().min(1, "Enter the customer's PO / reference"),
    expectedDelivery: z.string().min(1, "Required"),
    status: z.enum(["Draft", "Confirmed", "In Progress", "Completed", "On Hold", "Cancelled"]),
    notes: z.string(),
    reason: z.string(),
    items: z
      .array(
        z.object({
          materialId: z.string().min(1, "Choose a material"),
          quantity: z
            .number({ invalid_type_error: "Enter a quantity" })
            .positive("Must be more than 0"),
          unit: z.enum(["MT", "CFT", "Brass", "m³", "Trips", "Bags", "Nos"]),
          sellingRate: z
            .number({ invalid_type_error: "Enter a rate" })
            .positive("Must be more than 0"),
        }),
      )
      .min(1, "Add at least one item"),
  })
  .refine((v) => v.expectedDelivery >= v.orderDate, {
    path: ["expectedDelivery"],
    message: "Must be on or after the order date",
  });
type Values = z.infer<typeof schema>;

const emptyValues = (): Values => ({
  customerId: "",
  siteId: "",
  orderDate: todayIST(),
  customerRef: "",
  expectedDelivery: todayIST(),
  status: "Confirmed",
  notes: "",
  reason: "",
  items: [{ materialId: "", quantity: Number.NaN, unit: "MT", sellingRate: Number.NaN }],
});

function toValues(o: Order): Values {
  return {
    customerId: o.customerId,
    siteId: o.siteId,
    orderDate: o.orderDate,
    customerRef: o.customerRef,
    expectedDelivery: o.expectedDelivery,
    status: o.status,
    notes: o.notes,
    reason: "",
    items: o.items.map(({ materialId, quantity, unit, sellingRate }) => ({
      materialId,
      quantity,
      unit,
      sellingRate,
    })),
  };
}

export function OrderFormPage({ orderId }: { orderId?: string }) {
  const editing = Boolean(orderId);
  const { data: options } = useMasterOptions();
  const { data: existing, isLoading } = useOrderRecord(orderId ?? "");
  const navigate = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: emptyValues() });
  const items = useFieldArray({ control: form.control, name: "items" });
  const create = useAction(api.orders.createOrder, (o) => `Order ${o.ref} created`);
  const update = useAction(
    (v: Values) => api.orders.updateOrder(orderId ?? "", { ...v, reason: v.reason.trim() }),
    "Order updated · change recorded in audit history",
  );

  useEffect(() => {
    if (existing && editing) form.reset(toValues(existing));
  }, [existing, editing, form]);

  const customerId = form.watch("customerId");
  const watchedItems = form.watch("items");
  const total = watchedItems.reduce(
    (s, i) =>
      s +
      (Number.isFinite(i.quantity) && Number.isFinite(i.sellingRate)
        ? i.quantity * i.sellingRate
        : 0),
    0,
  );
  const customerOptions = useMemo(
    () => (options?.customers ?? []).map((c) => ({ value: c.id, label: c.name, hint: c.city })),
    [options],
  );
  const siteOptions = (options?.sites ?? []).filter((s) => s.customerId === customerId && s.active);
  const materials = options?.materials ?? [];

  if (editing && (isLoading || !existing)) return <DetailSkeleton />;

  const quantitiesChanged = (v: Values) =>
    Boolean(existing) &&
    (existing?.items ?? []).some((old) => {
      const now = v.items.find((i) => i.materialId === old.materialId);
      return !now || now.quantity !== old.quantity || now.sellingRate !== old.sellingRate;
    });

  const onSubmit = async (v: Values) => {
    // Units must be the material's own unit: no MT <-> volume conversion, ever.
    let blocked = false;
    const seen = new Set<string>();
    v.items.forEach((item, i) => {
      const m = materials.find((x) => x.id === item.materialId);
      const mismatch = m ? unitMismatchMessage(m.unit, item.unit, m.name) : null;
      if (mismatch) {
        form.setError(`items.${i}.unit`, { message: mismatch });
        blocked = true;
      }
      if (seen.has(item.materialId)) {
        form.setError(`items.${i}.materialId`, {
          message: "This material is already in the order. Change that line instead.",
        });
        blocked = true;
      }
      seen.add(item.materialId);
    });
    if (editing && quantitiesChanged(v) && v.reason.trim().length < 3) {
      form.setError("reason", {
        message: "Give a reason for changing ordered quantities or rates (kept in audit history).",
      });
      blocked = true;
    }
    if (blocked) return;
    const saved = editing ? await update.mutateAsync(v) : await create.mutateAsync(v);
    void navigate({ to: "/orders/$orderId", params: { orderId: saved.id } });
  };

  return (
    <>
      <PageHeader
        title={editing ? `Edit ${existing?.ref ?? ""}` : "New customer order"}
        crumbs={[{ label: editing ? `Edit ${existing?.ref ?? ""}` : "New" }]}
        description="Trips, purchases and invoices will link to this order automatically as documents arrive."
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <SectionCard title="Customer & site">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <FormControl>
                      <EntityPicker
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          form.setValue("siteId", "");
                        }}
                        options={customerOptions}
                        placeholder="Choose customer"
                        aria-label="Customer"
                        aria-invalid={Boolean(fieldState.error)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="siteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Construction site</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!customerId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={customerId ? "Choose site" : "Choose customer first"}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {siteOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerRef"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer reference / PO</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. SBPL/PO/0540" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="orderDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expectedDelivery"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected delivery by</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ORDER_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Items"
            description="Selling rate defaults to the material's current rate."
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  items.append({
                    materialId: "",
                    quantity: Number.NaN,
                    unit: "MT",
                    sellingRate: Number.NaN,
                  })
                }
              >
                <Plus className="size-4" /> Add item
              </Button>
            }
          >
            <div className="space-y-3">
              {items.fields.map((row, index) => (
                <div
                  key={row.id}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-start"
                >
                  <FormField
                    control={form.control}
                    name={`items.${index}.materialId`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lg:sr-only">Material</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            field.onChange(v);
                            const m = materials.find((x) => x.id === v);
                            if (m) {
                              form.setValue(`items.${index}.unit`, m.unit);
                              form.setValue(`items.${index}.sellingRate`, m.sellingRate);
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger aria-label="Material">
                              <SelectValue placeholder="Material" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {materials.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lg:sr-only">Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            placeholder="Qty"
                            value={Number.isFinite(field.value) ? field.value : ""}
                            onChange={(e) => field.onChange(e.target.valueAsNumber)}
                            aria-label="Quantity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${index}.unit`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lg:sr-only">Unit</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger aria-label="Unit">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {UNITS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${index}.sellingRate`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lg:sr-only">Selling rate (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            placeholder="Rate ₹"
                            value={Number.isFinite(field.value) ? field.value : ""}
                            onChange={(e) => field.onChange(e.target.valueAsNumber)}
                            aria-label="Selling rate in rupees"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {(() => {
                    const item = watchedItems[index];
                    const m = materials.find((x) => x.id === item?.materialId);
                    const msg = m && item ? unitMismatchMessage(m.unit, item.unit, m.name) : null;
                    return msg ? (
                      <p
                        role="alert"
                        className="text-sm text-destructive sm:col-span-2 lg:col-span-5 lg:row-start-2"
                      >
                        {msg}
                      </p>
                    ) : null;
                  })()}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="justify-self-end lg:row-start-1 lg:col-start-5"
                    onClick={() => items.remove(index)}
                    disabled={items.fields.length === 1}
                    aria-label={`Remove item ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {form.formState.errors.items?.root && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.items.root.message}
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <span className="text-sm text-muted-foreground">Order value (before GST)</span>
              <span className="font-display text-xl font-bold tabular-nums">
                {formatINR(total)}
              </span>
            </div>
            <InfoNote className="mt-4">
              Quantities are kept in the unit you choose. There is no automatic MT ↔ volume
              conversion.
            </InfoNote>
          </SectionCard>

          {editing && (
            <SectionCard
              title="Reason for change"
              description="Needed when you change an ordered quantity or rate. Saved in Audit History."
            >
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Reason for change</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Customer revised PO to 120 MT" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SectionCard>
          )}

          <SectionCard title="Notes">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Delivery timings, site instructions…"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </SectionCard>

          <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
            <Button type="button" variant="outline" asChild>
              <Link to={(editing ? `/orders/${orderId ?? ""}` : "/orders") as string}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create order"}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
