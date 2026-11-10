import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, Plus, Wallet } from "lucide-react";
import type { ExpenseCategory, ExpenseView } from "@/types";
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
import { ChartBox, ChartTooltip, axisProps, gridProps, series } from "@/components/charts";
import { ErrorState, KpiCard, SectionCard } from "@/components/common";
import { DataTable, optionsFrom, type Column } from "@/components/data-table";
import { EntityPicker } from "@/components/entity-picker";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { api, useAction, useExpenses, useMasterOptions, useTrips } from "@/hooks/queries";
import { DEMO_TODAY, formatDate, formatINR, formatINRCompact } from "@/lib/format";

const CATEGORIES: ExpenseCategory[] = [
  "Labour",
  "Loading",
  "Unloading",
  "Fuel",
  "Toll",
  "Waiting Charges",
  "Other",
];
const schema = z.object({
  date: z.string().min(1, "Required"),
  category: z.enum(["Labour", "Loading", "Unloading", "Fuel", "Toll", "Waiting Charges", "Other"]),
  amount: z.number({ invalid_type_error: "Enter amount" }).positive("Must be more than 0"),
  description: z.string().min(3, "Describe the expense"),
  paidTo: z.string().min(2, "Who was paid?"),
  mode: z.enum(["UPI", "Bank Transfer", "Cheque", "Cash"]),
  orderId: z.string(),
  tripId: z.string(),
});
type Values = z.infer<typeof schema>;

function ExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: options } = useMasterOptions();
  const { data: trips } = useTrips();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: DEMO_TODAY,
      category: "Loading",
      amount: Number.NaN,
      description: "",
      paidTo: "",
      mode: "Cash",
      orderId: "",
      tripId: "",
    },
  });
  const add = useAction(
    api.payments.addExpense,
    (e) => `${e.category} expense of ${formatINR(e.amount)} added`,
  );
  const orderOptions = useMemo(
    () => [
      { value: "", label: "Not linked" },
      ...(options?.orders ?? []).map((o) => ({ value: o.id, label: o.ref })),
    ],
    [options],
  );
  const tripOptions = useMemo(
    () => [
      { value: "", label: "Not linked" },
      ...(trips ?? []).slice(0, 80).map((t) => ({
        value: t.id,
        label: t.id,
        hint: `${t.vehiclePlate} · ${formatDate(t.loading.at)}`,
      })),
    ],
    [trips],
  );
  const submit = async (v: Values) => {
    const trip = trips?.find((t) => t.id === v.tripId);
    await add.mutateAsync({
      ...v,
      orderId: v.orderId || trip?.orderId || null,
      tripId: v.tripId || null,
    });
    form.reset();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            Linking to an order or trip is optional but makes order profit more accurate.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="expense-form"
            onSubmit={form.handleSubmit(submit)}
            className="grid gap-4 sm:grid-cols-2"
            noValidate
          >
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
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
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Unloading crew at Ring Road site" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paidTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid to</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                      {["Cash", "UPI", "Bank Transfer", "Cheque"].map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tripId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trip (optional)</FormLabel>
                  <FormControl>
                    <EntityPicker
                      value={field.value}
                      onChange={field.onChange}
                      options={tripOptions}
                      placeholder="Not linked"
                      aria-label="Linked trip"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="orderId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Order (optional)</FormLabel>
                  <FormControl>
                    <EntityPicker
                      value={field.value}
                      onChange={field.onChange}
                      options={orderOptions}
                      placeholder="Not linked"
                      aria-label="Linked order"
                    />
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
          <Button type="submit" form="expense-form" disabled={add.isPending}>
            {add.isPending && <Loader2 className="size-4 animate-spin" />}Add expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExpensesPage() {
  const { data, isLoading, error } = useExpenses();
  const [open, setOpen] = useState(false);
  const byCategory = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        category: c,
        amount: (data ?? []).filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0),
      })).sort((a, b) => b.amount - a.amount),
    [data],
  );
  if (error) return <ErrorState error={error} />;
  const total = data?.reduce((s, e) => s + e.amount, 0) ?? 0;
  const month = (data ?? [])
    .filter((e) => e.date.startsWith(DEMO_TODAY.slice(0, 7)))
    .reduce((s, e) => s + e.amount, 0);
  const columns: Column<ExpenseView>[] = [
    { id: "date", header: "Date", sortValue: (e) => e.date, cell: (e) => formatDate(e.date) },
    {
      id: "category",
      header: "Category",
      mobile: "badge",
      sortValue: (e) => e.category,
      cell: (e) => <StatusBadge status={e.category} tone="neutral" />,
    },
    {
      id: "description",
      header: "Description",
      mobile: "title",
      cell: (e) => (
        <div>
          <p className="font-medium">{e.description}</p>
          <p className="text-xs text-muted-foreground">{e.paidTo}</p>
        </div>
      ),
    },
    {
      id: "linked",
      header: "Linked to",
      cell: (e) =>
        e.tripRef ? (
          <Link
            to="/trips/$tripId"
            params={{ tripId: e.tripRef }}
            className="text-primary hover:underline"
          >
            {e.tripRef}
          </Link>
        ) : e.orderId ? (
          <Link
            to="/orders/$orderId"
            params={{ orderId: e.orderId }}
            className="text-primary hover:underline"
          >
            {e.orderRef}
          </Link>
        ) : (
          <span className="text-muted-foreground">General</span>
        ),
    },
    { id: "mode", header: "Mode", hideBelow: "xl", cell: (e) => e.mode },
    { id: "by", header: "Recorded by", hideBelow: "xl", cell: (e) => e.recordedBy },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: (e) => e.amount,
      cell: (e) => <span className="font-semibold tabular-nums">{formatINR(e.amount)}</span>,
    },
  ];
  return (
    <>
      <PageHeader
        title="Expenses"
        description="Labour, loading, unloading, fuel, tolls and waiting charges — linked to orders and trips where possible."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add expense
          </Button>
        }
      />
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          <KpiCard label="This month" value={formatINRCompact(month)} icon={Wallet} tone="amber" />
          <KpiCard
            label="Since June"
            value={formatINRCompact(total)}
            hint={`${data?.length ?? 0} entries`}
            icon={Wallet}
          />
        </div>
        <SectionCard title="By category" description="Since June">
          <ChartBox height={220} label="Bar chart of expenses by category">
            <ResponsiveContainer>
              <BarChart data={byCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis
                  type="number"
                  {...axisProps}
                  tickFormatter={(v: number) => formatINRCompact(v)}
                />
                <YAxis type="category" dataKey="category" {...axisProps} width={120} />
                <Tooltip
                  content={<ChartTooltip format="inr" />}
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                />
                <Bar
                  dataKey="amount"
                  name="Amount"
                  fill={series(0)}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(e) => e.id}
        searchText={(e) => `${e.description} ${e.paidTo} ${e.tripRef ?? ""} ${e.orderRef ?? ""}`}
        searchPlaceholder="Search description, paid to, trip…"
        filters={[
          {
            id: "category",
            label: "Categories",
            options: CATEGORIES.map((c) => ({ value: c, label: c })),
            value: (e) => e.category,
          },
          {
            id: "linked",
            label: "Links",
            options: [
              { value: "trip", label: "Linked to trip" },
              { value: "order", label: "Linked to order" },
              { value: "none", label: "General" },
            ],
            value: (e) => (e.tripId ? "trip" : e.orderId ? "order" : "none"),
          },
          {
            id: "by",
            label: "Recorded by",
            options: optionsFrom(data?.map((e) => e.recordedBy) ?? []),
            value: (e) => e.recordedBy,
          },
        ]}
        dateValue={(e) => e.date}
        defaultSort={{ id: "date", desc: true }}
        exportName="expenses"
      />
      <ExpenseDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
