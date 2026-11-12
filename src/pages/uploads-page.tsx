import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, FileUp, Link2, Upload } from "lucide-react";
import type { DocumentRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, KpiCard } from "@/components/common";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { DocumentThumbnail } from "@/components/document-viewer";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UploadDialog } from "@/components/upload-dialog";
import { api, useAction, useDriverLinks, useIntakeStats, useRecentUploads } from "@/hooks/queries";
import { usePermission } from "@/lib/auth";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { DriverLink } from "@/services/links.service";

const LINK_STATES = ["Active", "Expired", "Revoked", "Used up"];

function LinksTab() {
  const { data, isLoading, error } = useDriverLinks();
  const [revoking, setRevoking] = useState<DriverLink | null>(null);
  const revoke = useAction((id: string) => api.links.revokeLink(id), "Link revoked", {
    invalidate: [["links"]],
  });
  if (error) return <ErrorState error={error} />;
  const columns: Column<DriverLink>[] = [
    {
      id: "trip",
      header: "Trip",
      mobile: "title",
      sortValue: (l) => l.tripCode,
      cell: (l) => (
        <Link
          to="/trips/$tripId"
          params={{ tripId: l.tripCode }}
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {l.tripCode}
        </Link>
      ),
    },
    { id: "vehicle", header: "Vehicle", mobile: "subtitle", cell: (l) => l.vehiclePlate },
    {
      id: "state",
      header: "Status",
      mobile: "badge",
      sortValue: (l) => l.state,
      cell: (l) => <StatusBadge status={l.state} />,
    },
    {
      id: "uploads",
      header: "Uploads used",
      align: "right",
      sortValue: (l) => l.uploadCount,
      cell: (l) => `${l.uploadCount} / ${l.maxUploads}`,
    },
    {
      id: "expires",
      header: "Expires",
      sortValue: (l) => l.expiresAt,
      cell: (l) => formatDateTime(l.expiresAt),
    },
    {
      id: "created",
      header: "Created",
      hideBelow: "lg",
      sortValue: (l) => l.createdAt,
      cell: (l) => `${formatRelative(l.createdAt)} · ${l.createdBy}`,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      mobile: "hidden",
      cell: (l) =>
        l.state === "Active" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setRevoking(l);
            }}
          >
            <Ban className="size-4" /> Revoke
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(l) => l.id}
        rowHref={(l) => `/trips/${l.tripCode}`}
        searchText={(l) => `${l.tripCode} ${l.vehiclePlate} ${l.createdBy}`}
        searchPlaceholder="Search trip or vehicle…"
        filters={[
          {
            id: "state",
            label: "Statuses",
            options: LINK_STATES.map((s) => ({ value: s, label: s })),
            value: (l) => l.state,
          },
        ]}
        dateValue={(l) => l.createdAt}
        defaultSort={{ id: "expires", desc: true }}
        emptyTitle="No links match"
        emptyDescription="Generate a driver link from a trip page or from the trips list."
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(o) => !o && setRevoking(null)}
        destructive
        title={`Revoke the link for ${revoking?.tripCode ?? ""}?`}
        description="The driver will see that the link is no longer valid. Documents already sent stay."
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking) await revoke.mutateAsync(revoking.id);
          setRevoking(null);
        }}
      />
    </>
  );
}

function RecentTab() {
  const { data, isLoading, error } = useRecentUploads();
  if (error) return <ErrorState error={error} />;
  const columns: Column<DocumentRecord>[] = [
    {
      id: "doc",
      header: "Document",
      mobile: "title",
      sortValue: (d) => d.type,
      cell: (d) => (
        <span className="flex items-center gap-3">
          <DocumentThumbnail type={d.type} storagePath={d.storagePath} className="size-8" />
          <span className="min-w-0">
            <span className="block font-medium">{d.type}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {d.ref ?? d.id} · {d.fileName}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "by",
      header: "From",
      mobile: "subtitle",
      sortValue: (d) => d.senderName,
      cell: (d) => d.senderName,
    },
    {
      id: "source",
      header: "Source",
      sortValue: (d) => d.source,
      cell: (d) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          {d.source === "Driver Link" ? (
            <Link2 className="size-3.5" />
          ) : (
            <Upload className="size-3.5" />
          )}
          {d.source === "Driver Link" ? "Driver link" : "Staff upload"}
        </span>
      ),
    },
    {
      id: "trip",
      header: "Trip",
      hideBelow: "lg",
      cell: (d) => d.link?.label ?? d.tripHint?.label ?? "—",
    },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (d) => d.status,
      cell: (d) => <StatusBadge status={d.status} />,
    },
    {
      id: "received",
      header: "Received",
      sortValue: (d) => d.receivedAt,
      cell: (d) => formatRelative(d.receivedAt),
    },
  ];
  return (
    <DataTable
      data={data}
      isLoading={isLoading}
      columns={columns}
      getRowId={(d) => d.id}
      rowHref={(d) => `/documents/${d.id}`}
      searchText={(d) =>
        `${d.ref ?? ""} ${d.type} ${d.senderName} ${d.fileName} ${d.link?.label ?? ""} ${d.tripHint?.label ?? ""}`
      }
      searchPlaceholder="Search sender, trip, file…"
      filters={[
        {
          id: "source",
          label: "Sources",
          options: [
            { value: "Staff Upload", label: "Staff upload" },
            { value: "Driver Link", label: "Driver link" },
          ],
          value: (d) => d.source,
        },
      ]}
      dateValue={(d) => d.receivedAt}
      defaultSort={{ id: "received", desc: true }}
      emptyTitle="Nothing uploaded yet"
      emptyDescription="Upload slips here, or send drivers an upload link from a trip."
    />
  );
}

/** Uploads & Links: every way documents come in. */
export function UploadsPage() {
  const canLinks = usePermission("manage_trips");
  const canUpload = usePermission("review_documents") || canLinks;
  const { data: stats } = useIntakeStats();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Uploads & Links"
        description="Documents come in two ways: staff upload them here, and drivers send them through a trip's upload link."
        actions={
          canUpload && (
            <Button onClick={() => setOpen(true)}>
              <FileUp className="size-4" /> Upload documents
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Received today" value={stats?.receivedToday ?? "—"} icon={Upload} />
        <KpiCard
          label="Processed today"
          value={stats?.processedToday ?? "—"}
          icon={FileUp}
          tone="green"
        />
        <KpiCard label="Being read now" value={stats?.inProgress ?? "—"} icon={Link2} tone="blue" />
        <KpiCard label="Failed today" value={stats?.failedToday ?? "—"} icon={Ban} tone="red" />
      </div>
      <Tabs defaultValue={canLinks ? "links" : "recent"}>
        <TabsList>
          {canLinks && <TabsTrigger value="links">Driver links</TabsTrigger>}
          <TabsTrigger value="recent">Recent uploads</TabsTrigger>
        </TabsList>
        {canLinks && (
          <TabsContent value="links" className="mt-4">
            <LinksTab />
          </TabsContent>
        )}
        <TabsContent value="recent" className="mt-4">
          <RecentTab />
        </TabsContent>
      </Tabs>
      <UploadDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
