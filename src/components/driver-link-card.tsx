import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, Copy, Link2, Loader2, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SectionCard } from "@/components/common";
import { QrCode } from "@/components/qr-code";
import { StatusBadge } from "@/components/status-badge";
import { api, useAction, useTripLinks } from "@/hooks/queries";
import { usePermission } from "@/lib/auth";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { CreatedLink } from "@/services/links.service";

/** Copy / share helpers. Sharing is manual (SMS, WhatsApp, any app) — the app sends nothing itself. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy. Select the link and copy it.");
  }
}

export async function shareLink(link: CreatedLink, vehicle: string) {
  const text = `Upload the slips for ${link.tripCode} (${vehicle}) here: ${link.url}`;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: `Trip ${link.tripCode}`, text, url: link.url });
      return;
    } catch {
      /* cancelled */
      return;
    }
  }
  await copyText(text);
}

/** Driver upload link for one trip (trip detail page). */
export function DriverLinkCard({ tripCode, vehicle }: { tripCode: string; vehicle: string }) {
  const canManage = usePermission("manage_trips");
  const { data, isLoading } = useTripLinks(canManage ? tripCode : "");
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [confirm, setConfirm] = useState<null | "regenerate" | "revoke">(null);
  const generate = useAction(
    () => api.links.createLink({ tripCode }),
    "Driver link created · share it now, it is shown only once",
    { invalidate: [["links"]] },
  );
  const revoke = useAction((id: string) => api.links.revokeLink(id), "Link revoked", {
    invalidate: [["links"]],
  });
  if (!canManage) return null;

  const current = data?.current ?? null;
  const make = async () => setCreated(await generate.mutateAsync(undefined as never));

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" /> Driver upload link
        </span>
      }
      description="The driver opens it on their phone and sends slips and photos — no login."
      actions={current ? <StatusBadge status={current.state} /> : null}
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {created && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="mb-2 text-sm font-medium">
                Share this link now. For security it cannot be shown again (regenerate to get a new
                one).
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={created.url}
                  aria-label="Driver upload link"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void copyText(created.url)}
                  aria-label="Copy link"
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void shareLink(created, vehicle)}
                  aria-label="Share link"
                >
                  <Share2 className="size-4" />
                </Button>
              </div>
              <QrCode
                className="mt-3"
                text={created.url}
                label={`QR code for the ${created.tripCode} upload link`}
                fileName={`${created.tripCode}-upload-link`}
              />
            </div>
          )}

          {current ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Expires</dt>
                <dd>{formatDateTime(current.expiresAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Uploads left</dt>
                <dd>
                  {current.remaining} of {current.maxUploads}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd>
                  {formatRelative(current.createdAt)} by {current.createdBy}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last used</dt>
                <dd>{current.lastUsedAt ? formatRelative(current.lastUsedAt) : "Not yet"}</dd>
              </div>
            </dl>
          ) : (
            !created && (
              <p className="text-sm text-muted-foreground">No active link for this trip.</p>
            )
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => (current ? setConfirm("regenerate") : void make())}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : current ? (
                <RefreshCw className="size-4" />
              ) : (
                <Link2 className="size-4" />
              )}
              {current ? "Regenerate" : "Generate link"}
            </Button>
            {current && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm("revoke")}
                disabled={revoke.isPending}
              >
                <Ban className="size-4" /> Revoke
              </Button>
            )}
          </div>

          {(data?.documents.length ?? 0) > 0 && (
            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Received through links
              </p>
              <ul className="space-y-1.5">
                {data!.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      to="/documents/$documentId"
                      params={{ documentId: d.id }}
                      className="min-w-0 truncate text-primary hover:underline"
                    >
                      {d.type} · {d.senderName}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(d.receivedAt)}
                      </span>
                      <StatusBadge status={d.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm === "regenerate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Make a new link?"
        description="The current link stops working at once. Send the new link to the driver."
        confirmLabel="Regenerate"
        onConfirm={async () => {
          await make();
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === "revoke"}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title="Revoke this link?"
        description="The driver will see that the link is no longer valid. Documents already sent stay."
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (current) await revoke.mutateAsync(current.id);
          setCreated(null);
          setConfirm(null);
        }}
      />
    </SectionCard>
  );
}
