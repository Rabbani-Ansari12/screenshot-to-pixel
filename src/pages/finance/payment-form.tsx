import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { EntityPicker } from "@/components/entity-picker";
import {
  api,
  useAction,
  useMasterOptions,
  useOpenDocuments,
  usePaymentTarget,
  useSettings,
} from "@/hooks/queries";
import { formatDate, formatINR, todayIST } from "@/lib/format";

/** Select value meaning "let the database apply it to the oldest open invoices / bills". */
const OLDEST = "oldest";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    partyType: z.enum(["Customer", "Provider", "Transporter"]),
    partyId: z.string().min(1, "Choose a party"),
    againstId: z.string().min(1, "Choose an invoice or bill"),
    allowExcess: z.boolean(),
    date: z.string().min(1, "Required"),
    amount: z.number({ invalid_type_error: "Enter amount" }).positive("Must be more than 0"),
    mode: z.enum(["UPI", "Bank Transfer", "Cheque", "Cash"]),
    reference: z.string(),
    notes: z.string(),
  })
  .refine((v) => v.mode === "Cash" || v.reference.trim().length > 0, {
    path: ["reference"],
    message: "Enter UTR / UPI ref / cheque number",
  });
type Values = z.infer<typeof schema>;

/** Record a payment against an invoice (incoming) or bill (outgoing). Partial payments allowed. */
export function PaymentDialog({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preset?: string | undefined;
}) {
  const { data: options } = useMasterOptions();
  const { data: settings } = useSettings();
  const { data: target } = usePaymentTarget(open ? (preset ?? "") : "");
  const oldestFirst = settings?.payments.allocation === "oldest_first";
  const advances = Boolean(settings?.payments.allowOverpayment);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      partyType: "Customer",
      partyId: "",
      againstId: "",
      date: todayIST(),
      amount: Number.NaN,
      mode: "Bank Transfer",
      reference: "",
      notes: "",
      allowExcess: false,
    },
  });
  const [partyType, partyId, againstId, amount, allowExcess] = form.watch([
    "partyType",
    "partyId",
    "againstId",
    "amount",
    "allowExcess",
  ]);
  const { data: openDocs } = useOpenDocuments(partyType, partyId);
  const record = useAction(
    api.payments.recordPayment,
    (p) =>
      `Recorded ${p.ref}${p.onAccount > 0 ? ` · ${formatINR(p.onAccount)} kept on account` : ""}`,
  );

  useEffect(() => {
    if (!open || !target) return;
    form.reset({
      ...form.getValues(),
      partyType: target.partyType,
      partyId: target.partyId,
      againstId: target.id,
      amount: target.balance,
    });
  }, [open, target, form]);

  const parties = useMemo(() => {
    const list =
      partyType === "Customer"
        ? options?.customers
        : partyType === "Provider"
          ? options?.providers
          : options?.transporters;
    return (list ?? []).map((p) => ({ value: p.id, label: p.name, hint: p.city }));
  }, [partyType, options]);
  const doc = openDocs?.find((d) => d.id === againstId);
  const openTotal = (openDocs ?? []).reduce((s, d) => s + d.balance, 0);
  const balance = againstId === OLDEST ? openTotal : (doc?.balance ?? null);
  const remaining = balance !== null ? balance - (Number.isFinite(amount) ? amount : 0) : null;

  const submit = async (v: Values) => {
    if (balance !== null && v.amount > balance + 1 && !(advances && v.allowExcess)) {
      form.setError("amount", {
        message: `More than the outstanding ${formatINR(balance)}${advances ? " — tick “keep the extra as an advance”" : ""}`,
      });
      return;
    }
    await record.mutateAsync({
      ...v,
      againstId: v.againstId === OLDEST ? "" : v.againstId,
      direction: v.partyType === "Customer" ? "Incoming" : "Outgoing",
    });
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Money received from a customer, or paid to a provider or transporter.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="payment-form"
            onSubmit={form.handleSubmit(submit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="partyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <div
                    className="grid grid-cols-3 gap-2"
                    role="radiogroup"
                    aria-label="Payment type"
                  >
                    {(
                      [
                        ["Customer", "Received"],
                        ["Provider", "Paid to provider"],
                        ["Transporter", "Paid to transporter"],
                      ] as const
                    ).map(([t, label]) => (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={field.value === t}
                        onClick={() => {
                          field.onChange(t);
                          form.setValue("partyId", "");
                          form.setValue("againstId", "");
                        }}
                        className={cn(
                          "rounded-lg border px-2 py-2 text-xs font-medium",
                          field.value === t
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:bg-muted/50",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="partyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{partyType}</FormLabel>
                  <FormControl>
                    <EntityPicker
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        form.setValue("againstId", "");
                      }}
                      options={parties}
                      placeholder={`Choose ${partyType.toLowerCase()}`}
                      aria-label={partyType}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="againstId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{partyType === "Customer" ? "Invoice" : "Bill"}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      const d = openDocs?.find((x) => x.id === v);
                      if (d) form.setValue("amount", d.balance);
                      if (v === OLDEST) form.setValue("amount", openTotal);
                    }}
                    disabled={!partyId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            partyId
                              ? openDocs?.length
                                ? "Choose"
                                : "Nothing outstanding"
                              : "Choose party first"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {oldestFirst && (openDocs?.length ?? 0) > 1 && (
                        <SelectItem value={OLDEST}>
                          Oldest open first · {openDocs?.length} open · {formatINR(openTotal)}
                        </SelectItem>
                      )}
                      {openDocs?.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.label} · {formatDate(d.date)} · balance {formatINR(d.balance)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
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
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {["UPI", "Bank Transfer", "Cheque", "Cash"].map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
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
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference</FormLabel>
                    <FormControl>
                      <Input placeholder="UTR / UPI ref / cheque no." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {advances && (
              <FormField
                control={form.control}
                name="allowExcess"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(c) => field.onChange(c === true)}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">
                      Keep anything above the balance as an advance (on account)
                    </FormLabel>
                  </FormItem>
                )}
              />
            )}
            {doc && (
              <div
                className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-sm"
                aria-live="polite"
              >
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold tabular-nums">{formatINR(doc.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid before</p>
                  <p className="font-semibold tabular-nums">{formatINR(doc.paid)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining after this</p>
                  <p
                    className={cn(
                      "font-semibold tabular-nums",
                      remaining !== null && remaining < -1 && !allowExcess
                        ? "text-rose-600"
                        : remaining !== null && remaining <= 1
                          ? "text-emerald-600"
                          : "",
                    )}
                  >
                    {formatINR(Math.max(remaining ?? 0, 0))}
                  </p>
                </div>
              </div>
            )}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" disabled={record.isPending}>
            {record.isPending && <Loader2 className="size-4 animate-spin" />}Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
