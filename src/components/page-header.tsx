import { ChevronRight, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PageHeader({ title, description, action, actionLabel, secondary }: { title: string; description: string; action?: () => void; actionLabel?: string; secondary?: boolean }) {
  return <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0"><div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-muted-foreground"><span>Meridian Supply</span><ChevronRight className="size-3" /><span className="text-foreground/70">{title}</span></div><h1 className="font-display text-[22px] font-extrabold tracking-tight sm:text-[26px]">{title}</h1><p className="mt-1.5 max-w-2xl text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{description}</p></div>
    <div className="flex shrink-0 items-center gap-2"><Button variant="outline" size="sm" className="h-[34px] gap-1.5 px-3 text-[10px]" onClick={() => toast.success("Your report is ready to download")}><Download className="size-3.5" /> Export</Button>{actionLabel && <Button size="sm" className="h-[34px] gap-1.5 px-3.5 text-[10px]" onClick={action}><Plus className="size-3.5" />{actionLabel}</Button>}</div>
  </div>;
}
