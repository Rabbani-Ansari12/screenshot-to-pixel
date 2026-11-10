import { useState, type ReactNode } from "react";
import { CalendarDays, Search, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEMO_TODAY, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Option } from "@/types";

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface FilterSelect {
  id: string;
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toDate = (s: string) => new Date(`${s}T00:00:00`);
const shift = (days: number) => {
  const d = toDate(DEMO_TODAY);
  d.setDate(d.getDate() + days);
  return iso(d);
};

const PRESETS: { label: string; range: DateRangeValue }[] = [
  { label: "Today", range: { from: DEMO_TODAY, to: DEMO_TODAY } },
  { label: "Last 7 days", range: { from: shift(-6), to: DEMO_TODAY } },
  { label: "Last 30 days", range: { from: shift(-29), to: DEMO_TODAY } },
  { label: "This month", range: { from: `${DEMO_TODAY.slice(0, 7)}-01`, to: DEMO_TODAY } },
  { label: "Last month", range: { from: "2026-10-01", to: "2026-10-31" } },
  { label: "This quarter", range: { from: "2026-10-01", to: DEMO_TODAY } },
];

export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected: DateRange | undefined = value.from
    ? { from: toDate(value.from), to: value.to ? toDate(value.to) : undefined }
    : undefined;
  const label = value.from
    ? `${formatDate(value.from)} – ${value.to ? formatDate(value.to) : "…"}`
    : "Any date";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 justify-start gap-2 font-normal",
            !value.from && "text-muted-foreground",
            className,
          )}
          aria-label="Filter by date range"
        >
          <CalendarDays className="size-4" /> <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:border-b-0 sm:border-r">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="justify-start text-xs"
                onClick={() => {
                  onChange(p.range);
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-xs text-muted-foreground"
              onClick={() => {
                onChange({ from: "", to: "" });
                setOpen(false);
              }}
            >
              All time
            </Button>
          </div>
          <Calendar
            mode="range"
            numberOfMonths={1}
            defaultMonth={selected?.from ?? toDate(DEMO_TODAY)}
            selected={selected}
            onSelect={(r) =>
              onChange({
                from: r?.from ? iso(r.from) : "",
                to: r?.to ? iso(r.to) : r?.from ? iso(r.from) : "",
              })
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({
  search,
  onSearch,
  placeholder = "Search…",
  selects = [],
  dateRange,
  onDateRange,
  extra,
  onReset,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  selects?: FilterSelect[];
  dateRange?: DateRangeValue;
  onDateRange?: (v: DateRangeValue) => void;
  extra?: ReactNode;
  onReset?: () => void;
}) {
  const active = Boolean(search || selects.some((s) => s.value !== "all") || dateRange?.from);
  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center" role="search">
      <div className="relative md:w-72">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-9"
          aria-label={placeholder}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {selects.map((s) => (
          <Select key={s.id} value={s.value} onValueChange={s.onChange}>
            <SelectTrigger className="h-9 min-w-[140px]" aria-label={s.label}>
              <SelectValue placeholder={s.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {s.label.toLowerCase()}</SelectItem>
              {s.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {dateRange && onDateRange && (
          <DateRangePicker
            value={dateRange}
            onChange={onDateRange}
            className="col-span-2 sm:col-span-1"
          />
        )}
      </div>
      {extra}
      {active && onReset && (
        <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={onReset}>
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  );
}
