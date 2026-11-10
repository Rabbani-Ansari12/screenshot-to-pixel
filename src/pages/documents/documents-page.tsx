import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileUp, Link2, Upload } from "lucide-react";
import type { DocumentRecord, DocumentType, ProcessingStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { DocumentThumbnail } from "@/components/document-viewer";
import { ErrorState } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UploadDialog } from "@/components/upload-dialog";
import { useDocuments } from "@/hooks/queries";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPES: DocumentType[] = [
  "Weighbridge Slip",
  "Loading Slip",
  "Unloading Slip",
  "Provider Bill",
  "Transporter Bill",
  "Delivery Photo",
  "Payment Receipt",
  "Other",
];
export const PROCESSING_STATUSES: ProcessingStatus[] = [
  "Received",
  "Processing",
  "Information Extracted",
  "Matched",
  "Automatically Recorded",
  "Needs Review",
  "Failed",
  "Duplicate",
  "Rejected",
];

export function ConfidenceValue({ value, threshold = 85 }: { value: number; threshold?: number }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className={cn(
            "block h-full rounded-full",
            value >= threshold ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-rose-500",
          )}
          style={{ width: `${value}%` }}
        />
      </span>
      <span
        className={cn(
          "tabular-nums",
          value < threshold && "font-semibold text-amber-700 dark:text-amber-300",
        )}
      >
        {value}%
      </span>
    </span>
  );
}

export function linkHref(link: NonNullable<DocumentRecord["link"]>) {
  if (link.type === "Trip") return `/trips/${link.id}`;
  if (link.type === "Provider Bill" || link.type === "Transporter Bill") return `/bills/${link.id}`;
  if (link.type === "Invoice") return `/invoices/${link.id}`;
  if (link.type === "Purchase") return `/purchases/${link.id}`;
  return "/payments";
}

export function DocumentsPage() {
  const { data, isLoading, error } = useDocuments();
  const [upload, setUpload] = useState(false);
  if (error) return <ErrorState error={error} />;

  const counts = PROCESSING_STATUSES.map((s) => ({
    s,
    n: data?.filter((d) => d.status === s).length ?? 0,
  }));
  const columns: Column<DocumentRecord>[] = [
    {
      id: "type",
      header: "Document",
      mobile: "title",
      sortValue: (d) => d.type,
      cell: (d) => (
        <Link
          to="/documents/$documentId"
          params={{ documentId: d.id }}
          className="flex items-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <DocumentThumbnail type={d.type} />
          <span className="min-w-0">
            <span className="block font-medium hover:underline">{d.type}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {d.ref ?? d.id} · {d.fileName}
            </span>
          </span>
        </Link>
      ),
    },
    {
      id: "sender",
      header: "Uploaded by",
      sortValue: (d) => d.senderName,
      cell: (d) => (
        <div>
          <p>{d.senderName}</p>
          {d.tripHint && <p className="text-xs text-muted-foreground">for {d.tripHint.label}</p>}
        </div>
      ),
    },
    {
      id: "source",
      header: "Source",
      hideBelow: "xl",
      cell: (d) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          {d.source === "Driver Link" ? (
            <Link2 className="size-3.5 text-muted-foreground" />
          ) : (
            <Upload className="size-3.5 text-muted-foreground" />
          )}
          {d.source}
        </span>
      ),
    },
    {
      id: "received",
      header: "Received",
      sortValue: (d) => d.receivedAt,
      cell: (d) => <span title={formatDateTime(d.receivedAt)}>{formatRelative(d.receivedAt)}</span>,
    },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (d) => d.status,
      cell: (d) => <StatusBadge status={d.status} />,
    },
    {
      id: "confidence",
      header: "Confidence",
      align: "right",
      sortValue: (d) => d.confidence,
      cell: (d) => <ConfidenceValue value={d.confidence} />,
    },
    {
      id: "linked",
      header: "Linked record",
      hideBelow: "lg",
      cell: (d) =>
        d.link ? (
          <Link
            to={linkHref(d.link)}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary hover:underline"
          >
            {d.link.type} · {d.link.label}
          </Link>
        ) : d.duplicateOf ? (
          <span className="text-xs text-muted-foreground">Copy of {d.duplicateOf}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Document Inbox"
        description="Every slip, bill, photo and receipt uploaded by your team — read by AI and matched to trips automatically."
        actions={
          <Button onClick={() => setUpload(true)}>
            <FileUp className="size-4" /> Upload Document
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Documents by status">
        {counts.map(({ s, n }) => (
          <span
            key={s}
            className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs"
          >
            <StatusBadge status={s} className="h-5 border-0 bg-transparent px-0" />{" "}
            <span className="font-semibold tabular-nums">{n}</span>
          </span>
        ))}
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(d) => d.id}
        rowHref={(d) => `/documents/${d.id}`}
        searchText={(d) =>
          `${d.ref ?? d.id} ${d.type} ${d.senderName} ${d.fileName} ${d.link?.label ?? ""}`
        }
        searchPlaceholder="Search sender, file, trip…"
        filters={[
          {
            id: "status",
            label: "Statuses",
            options: PROCESSING_STATUSES.map((s) => ({ value: s, label: s })),
            value: (d) => d.status,
          },
          {
            id: "type",
            label: "Types",
            options: TYPES.map((t) => ({ value: t, label: t })),
            value: (d) => d.type,
          },
          {
            id: "source",
            label: "Sources",
            options: [
              { value: "Staff Upload", label: "Uploaded" },
              { value: "Driver Link", label: "Driver link" },
            ],
            value: (d) => d.source,
          },
        ]}
        dateValue={(d) => d.receivedAt}
        defaultSort={{ id: "received", desc: true }}
        exportName="document-inbox"
        gridItem={(d) => (
          <Link
            to="/documents/$documentId"
            params={{ documentId: d.id }}
            className="block rounded-xl border bg-background p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <DocumentThumbnail type={d.type} className="size-12" />
              <StatusBadge status={d.status} />
            </div>
            <p className="mt-3 font-medium">{d.type}</p>
            <p className="truncate text-xs text-muted-foreground">
              {d.senderName} · {formatRelative(d.receivedAt)}
            </p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <ConfidenceValue value={d.confidence} />
              <span className="truncate text-xs text-muted-foreground">
                {d.link ? d.link.label : "Not linked"}
              </span>
            </div>
          </Link>
        )}
      />
      <UploadDialog open={upload} onOpenChange={setUpload} />
    </>
  );
}
