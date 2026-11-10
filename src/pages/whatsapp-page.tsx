import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Eye, FileText, FileUp, MessageCircle, Search, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ChartBox,
  ChartLegend,
  ChartTooltip,
  axisProps,
  gridProps,
  series,
} from "@/components/charts";
import { EmptyState, ErrorState, InfoNote, PageSkeleton, SectionCard } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UploadDialog } from "@/components/upload-dialog";
import { api, useAction, useMessages, useWhatsAppStatus } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatRelative, formatTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PROCESSING_STATUSES } from "./documents/documents-page";

export function WhatsAppPage() {
  const { data: messages, isLoading, error } = useMessages();
  const { data: status } = useWhatsAppStatus();
  const { isOwner } = useAuth();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [upload, setUpload] = useState(false);
  const toggle = useAction(api.whatsapp.setWhatsAppConnected, (c) =>
    c ? "WhatsApp marked connected (demo)" : "WhatsApp marked disconnected (demo)",
  );

  const filtered = useMemo(
    () =>
      (messages ?? []).filter((m) => {
        const q = query.trim().toLowerCase();
        if (
          q &&
          !`${m.senderName} ${m.phone} ${m.text} ${m.documentIds.join(" ")}`
            .toLowerCase()
            .includes(q)
        )
          return false;
        if (state !== "all" && m.status !== state) return false;
        return true;
      }),
    [messages, query, state],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((m) => map.set(m.at.slice(0, 10), [...(map.get(m.at.slice(0, 10)) ?? []), m]));
    return [...map.entries()];
  }, [filtered]);

  if (error) return <ErrorState error={error} />;
  if (isLoading || !messages) return <PageSkeleton rows={6} />;
  const connected = status?.connected !== false;

  return (
    <>
      <PageHeader
        title="WhatsApp Messages"
        description="Read-only feed of the business WhatsApp number. Attachments go straight into the Document Inbox."
      />
      {!connected && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 sm:flex-row sm:items-center"
          role="alert"
        >
          <WifiOff className="size-5 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">WhatsApp is disconnected</p>
            <p className="text-sm text-muted-foreground">
              New slips and bills won't arrive automatically. Upload them by hand until the line is
              back.
            </p>
          </div>
          <Button onClick={() => setUpload(true)}>
            <FileUp className="size-4" /> Upload manually
          </Button>
        </div>
      )}
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <SectionCard title="Connection">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid size-11 place-items-center rounded-xl",
                connected ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600",
              )}
            >
              {connected ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}
            </span>
            <div>
              <p className="font-semibold">{connected ? "Connected via Twilio" : "Disconnected"}</p>
              <p className="text-sm text-muted-foreground">
                {status?.provider} · {status?.number}
              </p>
              <p className="text-xs text-muted-foreground">
                Last message {status ? formatRelative(status.lastMessageAt) : "—"}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">Today</dt>
              <dd className="font-display text-xl font-bold">{status?.today ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last 7 days</dt>
              <dd className="font-display text-xl font-bold">{status?.week ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Docs today</dt>
              <dd className="font-display text-xl font-bold">{status?.documentsToday ?? "—"}</dd>
            </div>
          </dl>
          {isOwner && (
            <label className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-dashed p-3 text-sm">
              <span>
                <span className="font-medium">Demo:</span> simulate connection
              </span>
              <Switch
                checked={connected}
                onCheckedChange={(c) => toggle.mutate(c)}
                aria-label="Simulate WhatsApp connection"
              />
            </label>
          )}
        </SectionCard>
        <SectionCard
          title="Message volume"
          description="Last 10 days"
          actions={
            <ChartLegend
              items={[
                { label: "Messages", color: series(0) },
                { label: "Documents", color: series(1) },
              ]}
            />
          }
        >
          <ChartBox height={200} label="Bar chart of WhatsApp messages and documents per day">
            <ResponsiveContainer>
              <BarChart
                data={(status?.daily ?? []).map((d) => ({
                  ...d,
                  label: formatDate(d.date).slice(0, 6),
                }))}
                margin={{ left: -20, right: 4, top: 8 }}
                barGap={2}
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip
                  content={<ChartTooltip format="number" />}
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                />
                <Bar
                  dataKey="messages"
                  name="Messages"
                  fill={series(0)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                />
                <Bar
                  dataKey="documents"
                  name="Documents"
                  fill={series(1)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
      </div>

      <SectionCard
        title="Incoming messages"
        description={
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" /> Read-only — replies are not sent from this app.
          </span>
        }
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sender, number, text"
                className="h-9 pl-9 sm:w-64"
                aria-label="Search messages"
              />
            </div>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="h-9 sm:w-48" aria-label="Processing status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PROCESSING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {byDay.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No messages match" />
        ) : (
          <div className="space-y-6">
            {byDay.slice(0, 12).map(([day, msgs]) => (
              <section key={day} aria-label={formatDate(day)}>
                <div className="sticky top-16 z-10 mb-3 flex justify-center">
                  <span className="rounded-full border bg-background px-3 py-0.5 text-xs text-muted-foreground shadow-sm">
                    {formatDate(day)}
                  </span>
                </div>
                <ul className="space-y-3">
                  {msgs.map((m) => (
                    <li key={m.id} className="flex gap-3">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                        aria-hidden
                      >
                        {initials(m.senderName)}
                      </span>
                      <div className="min-w-0 max-w-2xl flex-1 rounded-2xl rounded-tl-sm border bg-background px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-semibold">{m.senderName}</span>
                          <span className="text-xs text-muted-foreground">{m.phone}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatTime(m.at)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm">{m.text}</p>
                        {m.documentIds.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {m.documentIds.map((d) => (
                              <Link
                                key={d}
                                to="/documents/$documentId"
                                params={{ documentId: d }}
                                className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1 text-xs font-medium hover:bg-muted"
                              >
                                <FileText className="size-3.5" />
                                {d}
                              </Link>
                            ))}
                            <span className="text-xs text-muted-foreground">
                              {m.documentIds.length} attachment{m.documentIds.length > 1 ? "s" : ""}
                            </span>
                            <StatusBadge status={m.status} className="ml-auto" />
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {byDay.length > 12 && (
              <InfoNote>
                Showing the 12 most recent days. Use search to find older messages.
              </InfoNote>
            )}
          </div>
        )}
      </SectionCard>
      <UploadDialog open={upload} onOpenChange={setUpload} />
    </>
  );
}
