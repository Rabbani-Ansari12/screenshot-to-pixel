import { useState } from "react";
import { Lock } from "lucide-react";
import type { AuditEvent } from "@/types";
import { ErrorState, InfoNote } from "@/components/common";
import { DataTable, type Column } from "@/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useAuditPage, useAuditUsers } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ENTITIES } from "@/services/admin.service";
import type { TableQuery } from "@/services/supabase/table-query";

const show = (v: unknown) =>
  v === undefined ? "" : v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

/** Every field of the record before and after the change; changed fields highlighted. */
function AuditDiff({ event, onClose }: { event: AuditEvent | null; onClose: () => void }) {
  const before = event?.before ?? {};
  const after = event?.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return (
    <Dialog open={Boolean(event)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {event?.entityType} · {event?.operation}
          </DialogTitle>
          <DialogDescription>
            {event
              ? `${formatDateTime(event.at)} · ${event.userName} · record ${event.entityId}`
              : ""}
            {event?.note ? ` · “${event.note}”` : ""}
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">Field</th>
              <th className="py-1.5 pr-2 font-medium">Before</th>
              <th className="py-1.5 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const changed = JSON.stringify(before[k]) !== JSON.stringify(after[k]);
              return (
                <tr key={k} className={changed ? "bg-amber-400/10" : ""}>
                  <td className="py-1 pr-2 align-top font-medium">{k}</td>
                  <td className="max-w-[16rem] break-words py-1 pr-2 align-top text-muted-foreground">
                    {show(before[k])}
                  </td>
                  <td className="max-w-[16rem] break-words py-1 align-top">{show(after[k])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}

export function AuditPage() {
  const [query, setQuery] = useState<TableQuery | null>(null);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const { data, isLoading, error } = useAuditPage(query);
  const { data: users } = useAuditUsers();
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
        Entries can't be edited or deleted by anyone, including the owner. Click an entry to see the
        full record before and after the change.
      </InfoNote>
      <AuditDiff event={open} onClose={() => setOpen(null)} />
      <DataTable
        data={data?.rows}
        isLoading={isLoading || !query}
        server={{ total: data?.total ?? 0, onQueryChange: setQuery }}
        columns={columns}
        getRowId={(e) => e.id}
        onRowClick={setOpen}
        searchText={(e) => `${e.note} ${e.entityId}`}
        searchPlaceholder="Search reason or record id…"
        filters={[
          {
            id: "user",
            label: "Users",
            options: [
              { value: "system", label: "System" },
              ...(users ?? []).map((u) => ({ value: u.id, label: u.name })),
            ],
            value: () => "",
          },
          {
            id: "entity",
            label: "Entities",
            options: Object.entries(AUDIT_ENTITIES)
              .map(([value, label]) => ({ value, label }))
              .sort((a, b) => a.label.localeCompare(b.label)),
            value: (e) => e.table ?? "",
          },
          {
            id: "action",
            label: "Actions",
            options: [
              { value: "INSERT", label: "Created" },
              { value: "UPDATE", label: "Changed" },
              { value: "DELETE", label: "Deleted" },
            ],
            value: (e) => e.operation ?? "",
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
