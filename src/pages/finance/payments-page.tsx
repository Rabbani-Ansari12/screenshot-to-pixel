import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownLeft, ArrowUpRight, Plus, Wallet } from "lucide-react";
import type { PartyBalance } from "@/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartBox,
  ChartLegend,
  ChartTooltip,
  axisProps,
  gridProps,
  series,
} from "@/components/charts";
import { ErrorState, InfoNote, KpiCard, SectionCard } from "@/components/common";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { paymentColumns } from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { useFinanceTotals, useOutstanding, usePaymentsPage } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatINR, formatINRCompact } from "@/lib/format";
import type { TableQuery } from "@/services/supabase/table-query";
import { PaymentDialog } from "./payment-form";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** One direction of payments, paged and filtered on the server. */
function PaymentsTable({ direction }: { direction: "Incoming" | "Outgoing" }) {
  const [query, setQuery] = useState<TableQuery | null>(null);
  const { data, isLoading, error } = usePaymentsPage(query);
  // Stable callback: the table reports its query whenever this function changes.
  const onQueryChange = useCallback(
    (q: TableQuery) => setQuery({ ...q, filters: { ...q.filters, direction } }),
    [direction],
  );
  if (error) return <ErrorState error={error} />;
  return (
    <DataTable
      data={data?.rows}
      isLoading={isLoading || !query}
      server={{ total: data?.total ?? 0, onQueryChange }}
      columns={paymentColumns()}
      getRowId={(p) => p.id}
      searchText={(p) => `${p.ref} ${p.partyName} ${p.againstLabel} ${p.reference}`}
      searchPlaceholder="Search party, invoice, reference…"
      filters={[
        ...(direction === "Outgoing"
          ? [
              {
                id: "partyType",
                label: "Paid to",
                options: ["Provider", "Transporter"].map((m) => ({ value: m, label: m })),
                value: (p: { partyType: string }) => p.partyType,
              },
            ]
          : []),
        {
          id: "mode",
          label: "Modes",
          options: ["UPI", "Bank Transfer", "Cheque", "Cash"].map((m) => ({ value: m, label: m })),
          value: (p) => p.mode,
        },
      ]}
      dateValue={(p) => p.date}
      defaultSort={{ id: "date", desc: true }}
      exportName={`${direction.toLowerCase()}-payments`}
    />
  );
}

export function PaymentsPage({ record }: { record?: string }) {
  const { data: totals, error } = useFinanceTotals();
  const { data: outstanding } = useOutstanding();
  const { can } = useAuth();
  const [tab, setTab] = useState("incoming");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (record) setOpen(true);
  }, [record]);
  if (error) return <ErrorState error={error} />;
  const receivables = outstanding?.filter((o) => o.partyType === "Customer") ?? [];
  const payables = outstanding?.filter((o) => o.partyType !== "Customer") ?? [];
  const bucket = (rows: PartyBalance[], k: "current" | "d30" | "d60" | "d90") =>
    sum(rows.map((r) => r[k]));
  const aging = (
    [
      ["Not yet due", "current"],
      ["1–30 days", "d30"],
      ["31–60 days", "d60"],
      ["60+ days", "d90"],
    ] as const
  ).map(([label, k]) => ({
    label,
    receivable: bucket(receivables, k),
    payable: bucket(payables, k),
  }));

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money in from customers and out to providers and transporters. Partial payments are fine."
        actions={
          can("record_payments") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Record payment
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Received this month"
          value={totals ? formatINRCompact(totals.receivedMonth) : "—"}
          icon={ArrowDownLeft}
          tone="green"
        />
        <KpiCard
          label="Paid out this month"
          value={totals ? formatINRCompact(totals.paidMonth) : "—"}
          icon={ArrowUpRight}
          tone="amber"
        />
        <KpiCard
          label="Customers owe us"
          value={formatINRCompact(sum(receivables.map((r) => r.outstanding)))}
          hint={`${formatINRCompact(sum(receivables.map((r) => r.d30 + r.d60 + r.d90)))} past due`}
          icon={Wallet}
        />
        <KpiCard
          label="We owe"
          value={formatINRCompact(sum(payables.map((r) => r.outstanding)))}
          hint={`${formatINRCompact(sum(payables.map((r) => r.d30 + r.d60 + r.d90)))} past due`}
          icon={Wallet}
          tone="red"
        />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <SectionCard
          title="Aging"
          description="Outstanding by days past due date"
          actions={
            <ChartLegend
              items={[
                { label: "Receivable", color: series(0) },
                { label: "Payable", color: series(1) },
              ]}
            />
          }
        >
          <ChartBox height={240} label="Grouped bar chart of receivables and payables by age">
            <ResponsiveContainer>
              <BarChart data={aging} margin={{ left: 4, right: 4, top: 8 }} barGap={3}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis
                  {...axisProps}
                  tickFormatter={(v: number) => formatINRCompact(v)}
                  width={64}
                />
                <Tooltip
                  content={<ChartTooltip format="inr" />}
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                />
                <Bar
                  dataKey="receivable"
                  name="Receivable"
                  fill={series(0)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="payable"
                  name="Payable"
                  fill={series(1)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
        <SectionCard title="Outstanding summary" description="Largest balances first">
          <SimpleTable
            rows={(outstanding ?? []).filter((o) => o.outstanding > 0)}
            getRowId={(o) => `${o.partyType}-${o.partyId}`}
            maxRows={8}
            columns={[
              {
                id: "p",
                header: "Party",
                mobile: "title",
                cell: (o) => (
                  <div>
                    <p className="font-medium">{o.partyName}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.partyType === "Customer" ? "Receivable" : `Payable · ${o.partyType}`}
                    </p>
                  </div>
                ),
              },
              {
                id: "o",
                header: "Outstanding",
                align: "right",
                mobile: "badge",
                cell: (o) => (
                  <span className="font-semibold tabular-nums">{formatINR(o.outstanding)}</span>
                ),
              },
              {
                id: "c",
                header: "Not due",
                align: "right",
                hideBelow: "lg",
                cell: (o) => <span className="tabular-nums">{formatINRCompact(o.current)}</span>,
              },
              {
                id: "d",
                header: "Past due",
                align: "right",
                cell: (o) => (
                  <span
                    className={
                      o.d30 + o.d60 + o.d90 > 0
                        ? "font-semibold tabular-nums text-rose-600 dark:text-rose-400"
                        : "tabular-nums"
                    }
                  >
                    {formatINRCompact(o.d30 + o.d60 + o.d90)}
                  </span>
                ),
              },
            ]}
          />
        </SectionCard>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="incoming">Incoming · customers</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing · providers & transporters</TabsTrigger>
        </TabsList>
        <TabsContent value="incoming" className="mt-4">
          <PaymentsTable direction="Incoming" />
        </TabsContent>
        <TabsContent value="outgoing" className="mt-4">
          <PaymentsTable direction="Outgoing" />
        </TabsContent>
      </Tabs>
      <InfoNote className="mt-4">
        Money received from customers is cash flow, not profit. Profit is tracked in Profit & Loss.
      </InfoNote>
      <PaymentDialog open={open} onOpenChange={setOpen} preset={record} />
    </>
  );
}
