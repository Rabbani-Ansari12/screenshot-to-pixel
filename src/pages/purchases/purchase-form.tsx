import { useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChartBox, ChartTooltip, axisProps, gridProps, series } from "@/components/charts";
import { EntityPicker } from "@/components/entity-picker";
import { api, useAction, useMasterOptions, useRateHistory } from "@/hooks/queries";
import { formatDate, formatINR, todayIST } from "@/lib/format";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    providerId: z.string().min(1, "Choose a provider"),
    materialId: z.string().min(1, "Choose a material"),
    orderId: z.string(),
    date: z.string().min(1, "Required"),
    quantity: z.number({ invalid_type_error: "Enter quantity" }).positive("Must be more than 0"),
    rate: z.number({ invalid_type_error: "Enter rate" }).positive("Must be more than 0"),
    deliveryMode: z.enum(["Direct-to-Site", "Stock-Yard"]),
    yardId: z.string(),
    additionalCosts: z.array(
      z.object({
        label: z.string().min(1, "Label"),
        amount: z.number({ invalid_type_error: "Amount" }).nonnegative(),
      }),
    ),
  })
  .refine((v) => (v.deliveryMode === "Stock-Yard" ? Boolean(v.yardId) : Boolean(v.orderId)), {
    path: ["orderId"],
    message: "Direct-to-site purchases need a linked order (stock purchases need a yard)",
  });
type Values = z.infer<typeof schema>;

/** Rate history chart for a provider + material pair. */
export function RateHistoryChart({
  providerId,
  materialId,
  current,
}: {
  providerId: string;
  materialId: string;
  current?: number;
}) {
  const { data } = useRateHistory(providerId, materialId);
  if (!providerId || !materialId)
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Pick a provider and material to see past rates.
      </p>
    );
  if (!data?.length)
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No earlier purchases of this material from this provider.
      </p>
    );
  const rows = data.map((d) => ({ ...d, label: formatDate(d.date).slice(0, 6) }));
  const avg = Math.round(data.reduce((s, d) => s + d.rate, 0) / data.length);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span>
          Last:{" "}
          <span className="font-semibold text-foreground">
            {formatINR(data[data.length - 1]?.rate ?? 0)}
          </span>
        </span>
        <span>
          Average: <span className="font-semibold text-foreground">{formatINR(avg)}</span>
        </span>
        {current !== undefined && Number.isFinite(current) && (
          <span>
            This entry:{" "}
            <span
              className={
                current > avg ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"
              }
            >
              {formatINR(current)}
            </span>
          </span>
        )}
      </div>
      <ChartBox height={170} label="Line chart of historical purchase rates">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ left: 0, right: 8, top: 6 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis
              {...axisProps}
              domain={["dataMin - 40", "dataMax + 40"]}
              tickFormatter={(v: number) => `₹${v}`}
              width={60}
            />
            <Tooltip content={<ChartTooltip format="inr" />} />
            <Line
              type="monotone"
              dataKey="rate"
              name="Purchase rate"
              stroke={series(0)}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartBox>
    </div>
  );
}

export function PurchaseFormSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: options } = useMasterOptions();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      providerId: "",
      materialId: "",
      orderId: "",
      date: todayIST(),
      quantity: Number.NaN,
      rate: Number.NaN,
      deliveryMode: "Direct-to-Site",
      yardId: "",
      additionalCosts: [{ label: "Loading charges", amount: 0 }],
    },
  });
  const extras = useFieldArray({ control: form.control, name: "additionalCosts" });
  const create = useAction(api.purchases.createPurchase, (p) => `Purchase ${p.ref} recorded`);
  const [providerId, materialId, mode, rate, quantity] = form.watch([
    "providerId",
    "materialId",
    "deliveryMode",
    "rate",
    "quantity",
  ]);
  const provider = options?.providers.find((p) => p.id === providerId);
  const materials = (options?.materials ?? []).filter(
    (m) => !provider || provider.materialIds.includes(m.id),
  );
  const material = options?.materials.find((m) => m.id === materialId);
  const orderOptions = useMemo(
    () =>
      (options?.orders ?? [])
        .filter(
          (o) =>
            ["Confirmed", "In Progress"].includes(o.status) &&
            (!materialId || o.materialIds.includes(materialId)),
        )
        .map((o) => ({
          value: o.id,
          label: o.ref,
          hint: options?.customers.find((c) => c.id === o.customerId)?.name ?? "",
        })),
    [options, materialId],
  );
  const extrasTotal = form
    .watch("additionalCosts")
    .reduce((s, c) => s + (Number.isFinite(c.amount) ? c.amount : 0), 0);
  const base = Number.isFinite(rate) && Number.isFinite(quantity) ? rate * quantity : 0;

  const submit = async (v: Values) => {
    await create.mutateAsync({
      ...v,
      unit: material?.unit ?? "MT",
      orderId: v.deliveryMode === "Direct-to-Site" ? v.orderId : null,
      yardId: v.deliveryMode === "Stock-Yard" ? v.yardId : null,
    });
    form.reset();
    onOpenChange(false);
  };
  const num = (f: { value: number; onChange: (v: number) => void }) => ({
    value: Number.isFinite(f.value) ? f.value : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => f.onChange(e.target.valueAsNumber),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Record purchase</SheetTitle>
          <SheetDescription>
            Most purchases are created automatically from loading slips. Use this for anything
            bought without a slip.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="space-y-4 px-4"
            noValidate
            id="purchase-form"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="providerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue("materialId", "");
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose provider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {options?.providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
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
                name="materialId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Material</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        const m = options?.materials.find((x) => x.id === v);
                        if (m) form.setValue("rate", m.purchaseRate);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose material" />
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
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity {material && `(${material.unit})`}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" inputMode="decimal" {...num(field)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase rate (₹ / {material?.unit ?? "unit"})</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="decimal" {...num(field)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="deliveryMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery mode</FormLabel>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid grid-cols-2 gap-2"
                  >
                    {(["Direct-to-Site", "Stock-Yard"] as const).map((m) => (
                      <Label
                        key={m}
                        htmlFor={`mode-${m}`}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-normal has-[:checked]:border-primary"
                      >
                        <RadioGroupItem id={`mode-${m}`} value={m} />
                        {m}
                      </Label>
                    ))}
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    {mode === "Direct-to-Site"
                      ? "Goes straight to the customer's site — stock is not affected."
                      : "Received into a yard — adds to stock."}
                  </p>
                </FormItem>
              )}
            />
            {mode === "Direct-to-Site" ? (
              <FormField
                control={form.control}
                name="orderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked customer order</FormLabel>
                    <FormControl>
                      <EntityPicker
                        value={field.value}
                        onChange={field.onChange}
                        options={orderOptions}
                        placeholder="Choose order"
                        aria-label="Linked order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="yardId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yard</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose yard" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {options?.yards.map((y) => (
                          <SelectItem key={y.id} value={y.id}>
                            {y.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Additional costs</legend>
              {extras.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-[1fr_120px_auto] gap-2">
                  <Input
                    {...form.register(`additionalCosts.${i}.label`)}
                    placeholder="e.g. Royalty"
                    aria-label="Cost label"
                  />
                  <Input
                    type="number"
                    {...form.register(`additionalCosts.${i}.amount`, { valueAsNumber: true })}
                    placeholder="₹"
                    aria-label="Cost amount"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => extras.remove(i)}
                    aria-label="Remove cost"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => extras.append({ label: "", amount: 0 })}
              >
                <Plus className="size-4" /> Add cost
              </Button>
            </fieldset>
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Material</span>
                <span className="tabular-nums">{formatINR(base)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Additional</span>
                <span className="tabular-nums">{formatINR(extrasTotal)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatINR(base + extrasTotal)}</span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">
                Historical rate · {provider?.name ?? "provider"} · {material?.name ?? "material"}
              </p>
              <RateHistoryChart providerId={providerId} materialId={materialId} current={rate} />
            </div>
          </form>
        </Form>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="purchase-form" disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}Save purchase
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
