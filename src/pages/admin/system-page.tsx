import { AlertTriangle, Bot, RefreshCw, RotateCcw, ServerCrash, Timer } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ErrorLogEntry, FailedJob } from "@/services/admin.service";
import { Button } from "@/components/ui/button";
import { ErrorState, InfoNote, KpiCard, SectionCard } from "@/components/common";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { api, useAction, useErrorLogs, useFailedJobs, useSettings } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";

/** Owner view of background processing: failed document jobs (with retry) and logged errors. */
export function SystemPage() {
  const jobs = useFailedJobs();
  const errors = useErrorLogs();
  const { data: settings } = useSettings();
  const retry = useAction((id: string) => api.admin.retryJob(id), "Queued again", {
    invalidate: [["system"], ["documents"]],
  });
  const retryAll = useAction(
    () => api.admin.retryAllFailedJobs(),
    (n) => `${n} job(s) queued again`,
    {
      invalidate: [["system"], ["documents"]],
    },
  );
  if (jobs.error) return <ErrorState error={jobs.error} />;
  const failed = (jobs.data ?? []).filter((j) => j.status === "Failed");
  const jobColumns: Column<FailedJob>[] = [
    {
      id: "file",
      header: "Document",
      mobile: "title",
      sortValue: (j) => j.fileName,
      cell: (j) => (
        <Link
          to="/documents/$documentId"
          params={{ documentId: j.documentId }}
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {j.fileName}
        </Link>
      ),
    },
    { id: "source", header: "Channel", cell: (j) => j.source },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (j) => j.status,
      cell: (j) => (
        <StatusBadge status={j.status} tone={j.status === "Failed" ? "danger" : "warning"} />
      ),
    },
    {
      id: "attempts",
      header: "Attempts",
      align: "right",
      cell: (j) => `${j.attempts} / ${j.maxAttempts}`,
    },
    {
      id: "error",
      header: "Last error",
      cell: (j) => (
        <span className="line-clamp-2 max-w-md text-xs text-muted-foreground">{j.lastError}</span>
      ),
    },
    {
      id: "at",
      header: "Updated",
      sortValue: (j) => j.updatedAt,
      cell: (j) => formatDateTime(j.updatedAt),
    },
    {
      id: "retry",
      header: "",
      cell: (j) => (
        <Button
          size="sm"
          variant="outline"
          disabled={retry.isPending}
          onClick={(e) => {
            e.stopPropagation();
            retry.mutate(j.jobId);
          }}
        >
          <RotateCcw className="size-3.5" /> Retry
        </Button>
      ),
    },
  ];
  const errorColumns: Column<ErrorLogEntry>[] = [
    { id: "at", header: "Time", sortValue: (e) => e.at, cell: (e) => formatDateTime(e.at) },
    {
      id: "source",
      header: "Where",
      mobile: "subtitle",
      sortValue: (e) => e.source,
      cell: (e) => e.source,
    },
    {
      id: "level",
      header: "Level",
      mobile: "badge",
      cell: (e) => (
        <StatusBadge
          status={e.level === "warn" ? "Warning" : "Error"}
          tone={e.level === "warn" ? "warning" : "danger"}
        />
      ),
    },
    {
      id: "message",
      header: "Message",
      mobile: "title",
      cell: (e) => <span className="line-clamp-2 max-w-xl text-xs">{e.message}</span>,
      exportValue: (e) => e.message,
    },
    {
      id: "request",
      header: "Request id",
      hideBelow: "xl",
      cell: (e) => (
        <span className="font-mono text-[11px] text-muted-foreground">{e.requestId}</span>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="System Health"
        description="Background document processing and errors from the server and the app."
        actions={
          failed.length > 0 && (
            <Button onClick={() => retryAll.mutate(undefined)} disabled={retryAll.isPending}>
              <RefreshCw className="size-4" /> Retry all failed ({failed.length})
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Failed jobs" value={failed.length} icon={ServerCrash} tone="red" />
        <KpiCard
          label="Retrying"
          value={(jobs.data ?? []).length - failed.length}
          icon={Timer}
          tone="amber"
        />
        <KpiCard
          label="Errors logged (latest 200)"
          value={errors.data?.filter((e) => e.level === "error").length ?? "—"}
          icon={AlertTriangle}
        />
        <KpiCard
          label="AI readings today"
          value={settings ? `${settings.ai.callsToday} / ${settings.ai.dailyCallCap}` : "—"}
          hint="Daily cap set in Settings"
          icon={Bot}
          href="/settings"
        />
      </div>
      <SectionCard title="Document jobs that need attention" className="mb-4">
        <DataTable
          data={jobs.data}
          isLoading={jobs.isLoading}
          columns={jobColumns}
          getRowId={(j) => j.jobId}
          searchText={(j) => `${j.fileName} ${j.lastError}`}
          emptyTitle="Nothing failed"
          emptyDescription="Every document was processed or is waiting its turn."
          exportName="failed-jobs"
        />
      </SectionCard>
      <SectionCard
        title="Error log"
        description="Kept for 90 days. Use the request id when reporting a problem."
      >
        {errors.error ? (
          <ErrorState error={errors.error} />
        ) : (
          <DataTable
            data={errors.data}
            isLoading={errors.isLoading}
            columns={errorColumns}
            getRowId={(e) => e.id}
            searchText={(e) => `${e.source} ${e.message} ${e.requestId}`}
            filters={[
              {
                id: "level",
                label: "Levels",
                options: [
                  { value: "error", label: "Errors" },
                  { value: "warn", label: "Warnings" },
                ],
                value: (e) => e.level,
              },
            ]}
            dateValue={(e) => e.at}
            defaultSort={{ id: "at", desc: true }}
            emptyTitle="No errors logged"
            exportName="error-log"
          />
        )}
      </SectionCard>
      <InfoNote className="mt-4">
        Retrying resets the attempts and puts the document back in the queue. Documents identical to
        an earlier upload are never read again by the AI.
      </InfoNote>
    </>
  );
}
