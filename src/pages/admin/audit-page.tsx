import { Lock } from "lucide-react";
import type { AuditEvent } from "@/types";
import { ErrorState, InfoNote } from "@/components/common";
import { DataTable, optionsFrom, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useAuditEvents } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";

export function AuditPage() {
  const { data, isLoading, error } = useAuditEvents();
  if (error) return <ErrorState error={error} />;
  const columns: Column<AuditEvent>[] = [
    {
      id: "at",
      header: "Timestamp",
      sortValue: (e) => e.at,
      cell: (e) => <span className="whitespace-nowrap">{formatDateTime(e.at)}</span>,
    },
    {
      id: "user",
      header: "User",
      mobile: "subtitle",
      sortValue: (e) => e.userName,
      cell: (e) => (
        <span className={e.userName === "System" ? "text-muted-foreground" : "font-medium"}>
          {e.userName}
        </span>
      ),
    },
    {
      id: "action",
      header: "Action",
      mobile: "badge",
      sortValue: (e) => e.action,
      cell: (e) => (
        <StatusBadge
          status={e.action}
          tone={
            e.action === "Auto-recorded" || e.action === "Matched"
              ? "info"
              : e.action === "Corrected" || e.action === "Disputed"
                ? "warning"
                : e.action === "Deactivated"
                  ? "danger"
                  : "neutral"
          }
        />
      ),
    },
    {
      id: "entity",
      header: "Entity",
      mobile: "title",
      sortValue: (e) => e.entityType,
      cell: (e) => (
        <div>
          <p className="font-medium">{e.entityLabel}</p>
          <p className="text-xs text-muted-foreground">{e.entityType}</p>
        </div>
      ),
    },
    {
      id: "change",
      header: "Previous → new value",
      cell: (e) => (
        <div className="space-y-1">
          {e.changes.length ? (
            e.changes.map((c, i) => (
              <p key={i} className="text-xs">
                <span className="text-muted-foreground">{c.field}: </span>
                <span className="rounded bg-rose-500/10 px-1 text-rose-700 line-through decoration-rose-400/60 dark:text-rose-300">
                  {c.from}
                </span>
                <span className="mx-1 text-muted-foreground">→</span>
                <span className="rounded bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-300">
                  {c.to}
                </span>
              </p>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {e.note && <p className="max-w-md text-xs italic text-muted-foreground">“{e.note}”</p>}
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Audit History"
        description="Every change, correction, approval and automatic recording — who, when, and what changed."
        badge={<StatusBadge status="Read-only" tone="neutral" />}
      />
      <InfoNote className="mb-4">
        <Lock className="mr-1 inline size-3.5" />
        Entries can't be edited or deleted by anyone, including the owner.
      </InfoNote>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(e) => e.id}
        searchText={(e) =>
          `${e.userName} ${e.action} ${e.entityLabel} ${e.entityType} ${e.note} ${e.changes.map((c) => `${c.field} ${c.from} ${c.to}`).join(" ")}`
        }
        searchPlaceholder="Search user, record, value…"
        filters={[
          {
            id: "user",
            label: "Users",
            options: optionsFrom(data?.map((e) => e.userName) ?? []),
            value: (e) => e.userName,
          },
          {
            id: "entity",
            label: "Entities",
            options: optionsFrom(data?.map((e) => e.entityType) ?? []),
            value: (e) => e.entityType,
          },
          {
            id: "action",
            label: "Actions",
            options: optionsFrom(data?.map((e) => e.action) ?? []),
            value: (e) => e.action,
          },
        ]}
        dateValue={(e) => e.at}
        defaultSort={{ id: "at", desc: true }}
        pageSize={25}
        exportName="audit-history"
      />
    </>
  );
}
