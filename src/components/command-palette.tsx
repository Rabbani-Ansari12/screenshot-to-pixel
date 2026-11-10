import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, ClipboardPlus, FileUp, Loader2, Truck } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useGlobalSearch } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { NAV_ITEMS } from "@/lib/navigation";

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Global search (Ctrl/Cmd + K): pages, quick actions and records. */
export function CommandPalette({
  open,
  onOpenChange,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUpload: () => void;
}) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const { data: results, isFetching } = useGlobalSearch(debounced);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to });
  };
  const q = query.trim().toLowerCase();
  const pages = NAV_ITEMS.filter(
    (i) => can(i.requires) && (!q || i.label.toLowerCase().includes(q)),
  ).slice(0, q ? 6 : 8);
  const groups = [...new Set((results ?? []).map((r) => r.group))];
  const actions = [
    {
      label: "Upload document",
      icon: FileUp,
      run: () => {
        onOpenChange(false);
        onUpload();
      },
      show: can("view_records"),
    },
    {
      label: "Create customer order",
      icon: ClipboardPlus,
      run: () => go("/orders/new"),
      show: can("manage_orders"),
    },
    {
      label: "Create trip (manual)",
      icon: Truck,
      run: () => go("/trips/new"),
      show: can("manage_trips"),
    },
  ].filter((a) => a.show && (!q || a.label.toLowerCase().includes(q)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages, orders, trips, documents, parties and vehicles.
        </DialogDescription>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search trips, vehicles, orders, bills, customers…"
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{isFetching ? "Searching…" : "No results found."}</CommandEmpty>
            {actions.length > 0 && (
              <CommandGroup heading="Quick actions">
                {actions.map((a) => (
                  <CommandItem key={a.label} value={a.label} onSelect={a.run}>
                    <a.icon className="size-4" />
                    {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {pages.length > 0 && (
              <CommandGroup heading="Pages">
                {pages.map((p) => (
                  <CommandItem key={p.path} value={`page-${p.path}`} onSelect={() => go(p.path)}>
                    <p.icon className="size-4" />
                    {p.label}
                    <ArrowRight className="ml-auto size-3.5 opacity-40" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {isFetching && q.length >= 2 && !results?.length && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching records…
              </div>
            )}
            {groups.map((g) => (
              <CommandGroup key={g} heading={g}>
                {(results ?? [])
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <CommandItem
                      key={`${g}-${r.id}`}
                      value={`${g}-${r.id}`}
                      onSelect={() => go(r.href)}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>↑↓ to move · Enter to open</span>
            <span>
              <kbd className="rounded border bg-muted px-1">Esc</kbd> to close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
