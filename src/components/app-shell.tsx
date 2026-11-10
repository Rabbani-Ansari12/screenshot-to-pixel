import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, ArrowDownToLine, ArrowLeftRight, Bell, Boxes, BriefcaseBusiness, Building2,
  ChartNoAxesCombined, CheckCheck, ChevronDown, CircleHelp, ClipboardList, Command, CreditCard,
  FileCheck2, FileClock, FileText, HardHat, Home, Layers3, LayoutDashboard, LifeBuoy, Menu,
  MessageCircle, Moon, MoreHorizontal, Package, PanelLeftClose, Plus, Search, Settings2, ShieldCheck,
  Sun, Truck, Users, Wallet, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Role } from "@/types/domain";
import { cn } from "@/lib/utils";

const groups = [
  { label: "OVERVIEW", items: [{ label: "Dashboard", path: "/", icon: LayoutDashboard }] },
  { label: "AUTOMATION", items: [
    { label: "Document inbox", path: "/documents", icon: FileText },
    { label: "Review queue", path: "/review", icon: CheckCheck, badge: "3" },
    { label: "WhatsApp messages", path: "/whatsapp", icon: MessageCircle },
  ] },
  { label: "OPERATIONS", items: [
    { label: "Customer orders", path: "/orders", icon: ClipboardList },
    { label: "Purchases", path: "/purchases", icon: ArrowDownToLine },
    { label: "Truck trips", path: "/trips", icon: Truck },
    { label: "Delivery & shortages", path: "/shortages", icon: ArrowLeftRight },
    { label: "Stock ledger", path: "/stock", icon: Boxes },
  ] },
  { label: "VERIFICATION", items: [
    { label: "Bill reconciliation", path: "/reconciliation", icon: FileCheck2 },
    { label: "Provider bills", path: "/bills/provider", icon: FileText },
    { label: "Transporter bills", path: "/bills/transporter", icon: Truck },
  ] },
  { label: "FINANCE", items: [
    { label: "Invoices", path: "/invoices", icon: FileText },
    { label: "Payments", path: "/payments", icon: CreditCard },
    { label: "Expenses", path: "/expenses", icon: Wallet },
    { label: "Profit & loss", path: "/profit", icon: ChartNoAxesCombined },
  ] },
  { label: "MASTERS", items: [
    { label: "Customers", path: "/customers", icon: Building2 },
    { label: "Material providers", path: "/providers", icon: Package },
    { label: "Transporters", path: "/transporters", icon: Truck },
    { label: "Vehicles & drivers", path: "/vehicles", icon: HardHat },
    { label: "Materials", path: "/materials", icon: Layers3 },
  ] },
  { label: "INSIGHTS", items: [{ label: "Reports", path: "/reports", icon: ChartNoAxesCombined }] },
  { label: "ADMINISTRATION", items: [
    { label: "Employees & permissions", path: "/employees", icon: Users },
    { label: "Audit history", path: "/audit", icon: FileClock },
    { label: "Settings", path: "/settings", icon: Settings2 },
  ] },
];

function SidebarContent({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const employeeHidden = new Set(["/employees", "/settings"]);
  return <>
    <div className="flex h-[76px] items-center gap-3 border-b border-sidebar-border px-5">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"><Layers3 className="size-5" /></div>
      <div className="min-w-0"><p className="font-display text-[15px] font-extrabold tracking-tight">Meridian <span className="font-medium text-sidebar-foreground/70">Supply</span></p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-sidebar-foreground/50">Operations studio</p></div>
      <div className="ml-auto hidden rounded-md border border-sidebar-border px-1.5 py-1 text-[10px] text-sidebar-foreground/55 xl:block">LIVE</div>
    </div>
    <div className="flex items-center gap-3 border-b border-sidebar-border/70 px-4 py-4">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-[11px] font-bold text-sidebar-primary">AM</div>
      <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">Aarav Mehta</p><p className="mt-0.5 text-[10px] text-sidebar-foreground/55">{role} · Pune, India</p></div>
      <ChevronDown className="size-3.5 text-sidebar-foreground/50" />
    </div>
    <nav className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-5" aria-label="Main navigation">
      {groups.map((group) => {
        const visible = group.items.filter((item) => role === "Owner" || !employeeHidden.has(item.path));
        if (!visible.length) return null;
        return <div key={group.label}>
          <p className="mb-2 px-3 text-[9px] font-bold tracking-[0.17em] text-sidebar-foreground/40">{group.label}</p>
          <div className="space-y-0.5">
            {visible.map((item) => {
              const active = pathname === item.path;
              const Icon = item.icon;
              return <Link key={item.path} to={item.path} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("group flex min-h-[36px] items-center gap-2.5 rounded-lg px-3 text-[11.5px] font-medium transition-colors", active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "text-sidebar-foreground/68 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground")}>
                <Icon className={cn("size-[15px] shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
                <span className="truncate">{item.label}</span>
                {item.badge && <span className="ml-auto grid size-[17px] place-items-center rounded-full bg-sidebar-primary text-[9px] font-bold text-sidebar-primary-foreground">{item.badge}</span>}
                {active && <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />}
              </Link>;
            })}
          </div>
        </div>;
      })}
    </nav>
    <div className="mx-3 mb-3 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3.5">
      <div className="flex items-center justify-between"><span className="text-[10px] font-semibold">Automations active</span><span className="relative size-2 rounded-full bg-emerald-400"><span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" /></span></div>
      <p className="mt-1 text-[9px] leading-relaxed text-sidebar-foreground/55">WhatsApp documents are being monitored.</p>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-sidebar-border"><div className="h-full w-[91%] rounded-full bg-sidebar-primary" /></div>
    </div>
    <div className="flex items-center justify-between border-t border-sidebar-border px-4 py-3 text-[10px] text-sidebar-foreground/45"><span>Meridian Materials © 2026</span><LifeBuoy className="size-3.5" /></div>
  </>;
}

export function AppShell({ children, title, eyebrow }: { children: React.ReactNode; title: string; eyebrow: string }) {
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const [role, setRole] = useState<Role>("Owner");
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const quickLinks = groups.flatMap((group) => group.items).filter((item) => role === "Owner" || !["/employees", "/settings"].includes(item.path));
  const searchResults = quickLinks.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 7);
  const openSearch = () => setSearchOpen(true);
  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    const dark = document.documentElement.classList.contains("dark");
    localStorage.setItem("meridian-theme", dark ? "dark" : "light");
    toast.success(`${dark ? "Dark" : "Light"} appearance enabled`);
  };
  return <div className="min-h-screen bg-background">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] flex-col bg-sidebar text-sidebar-foreground lg:flex"><SidebarContent role={role} /></aside>
    <div className="min-h-screen lg:pl-[244px]">
      <header className="sticky top-0 z-20 flex h-[66px] items-center gap-3 border-b border-border/80 bg-background/95 px-4 backdrop-blur-xl md:px-7">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu className="size-[18px]" /></Button>
        <div className="min-w-0 flex-1"><p className="hidden text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground sm:block">{eyebrow}</p><p className="truncate font-display text-[15px] font-bold sm:mt-0.5">{title}</p></div>
        <TooltipProvider delayDuration={300}><div className="hidden w-full max-w-[310px] sm:block">
          <Button variant="outline" onClick={openSearch} className="h-[36px] w-full justify-start gap-2 border-border/75 bg-card px-3 text-[11px] font-normal text-muted-foreground shadow-none"><Search className="size-3.5" /><span className="flex-1 text-left">Search anything...</span><span className="flex items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 text-[9px]"><Command className="size-2.5" /> K</span></Button>
        </div>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label="Exceptions requiring attention" onClick={() => toast.info("3 exceptions need a closer look") }><Bell className="size-[17px]" /><span className="absolute right-1.5 top-1.5 size-[7px] rounded-full border border-background bg-amber-500" /></Button></TooltipTrigger><TooltipContent>Exceptions only</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><div className="hidden items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-600/5 px-2.5 py-1.5 lg:flex"><span className="size-1.5 rounded-full bg-emerald-600" /><span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">WhatsApp connected</span></div></TooltipTrigger><TooltipContent>Simulated connection for this demo</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Toggle light or dark appearance" onClick={toggleTheme}><Sun className="size-4 dark:hidden" /><Moon className="hidden size-4 dark:block" /></Button></TooltipTrigger><TooltipContent>Change appearance</TooltipContent></Tooltip>
        <label className="hidden items-center gap-1 text-[9px] font-medium text-muted-foreground md:flex"><span>View as</span><select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-8 max-w-[102px] cursor-pointer rounded-md border border-border bg-card px-2 text-[10px] font-semibold text-foreground outline-none focus:ring-1 focus:ring-ring" aria-label="Choose demo role"><option>Owner</option><option>Employee</option></select></label>
        <div className="grid size-[31px] shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">AM</div>
        </TooltipProvider>
      </header>
      <main id="main-content" className="mx-auto max-w-[1600px] px-4 pb-24 pt-5 md:px-7 md:pb-12 md:pt-7 xl:px-9">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-5px_18px_-16px_var(--foreground)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
        {[
          ["Dashboard", "/", Home], ["Orders", "/orders", ClipboardList], ["Review", "/review", CheckCheck], ["Trips", "/trips", Truck], ["More", "more", MoreHorizontal],
        ].map(([label, path, Icon]) => path === "more" ? <button key={String(label)} onClick={() => setMobileNav(true)} className="flex min-h-[43px] flex-col items-center justify-center gap-1 text-muted-foreground" aria-label="More navigation"><MoreHorizontal className="size-[18px]" /><span className="text-[9px] font-medium">More</span></button> : <Link key={String(label)} to={String(path)} className={cn("relative flex min-h-[43px] flex-col items-center justify-center gap-1", pathname === path ? "text-primary" : "text-muted-foreground")}><Icon className="size-[18px]" /><span className="text-[9px] font-medium">{label}</span>{pathname === path && <span className="absolute top-0 h-0.5 w-7 rounded-full bg-primary" />}</Link>)}
      </nav>
    </div>
    <Sheet open={mobileNav} onOpenChange={setMobileNav}><SheetContent side="left" className="flex w-[min(304px,88vw)] flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"><SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle></SheetHeader><SidebarContent role={role} onNavigate={() => setMobileNav(false)} /></SheetContent></Sheet>
    <Sheet open={searchOpen} onOpenChange={setSearchOpen}><SheetContent side="top" className="mx-auto mt-12 h-fit max-h-[75vh] w-[min(620px,calc(100%-24px))] overflow-hidden rounded-xl border bg-background p-0 shadow-2xl sm:top-16">
      <SheetHeader className="sr-only"><SheetTitle>Search all records</SheetTitle></SheetHeader><div className="flex items-center gap-3 border-b px-4"><Search className="size-4 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages, customers, trips..." aria-label="Search pages and records" className="h-[58px] border-0 px-0 text-sm shadow-none focus-visible:ring-0" /><Button size="icon" variant="ghost" aria-label="Close search" onClick={() => setSearchOpen(false)}><X className="size-4" /></Button></div>
      <div className="p-2"><p className="px-2 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Pages & workspaces</p>{searchResults.length ? searchResults.map((item) => { const Icon = item.icon; return <Link key={item.path} to={item.path} onClick={() => setSearchOpen(false)} className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12px] hover:bg-accent"><Icon className="size-4 text-muted-foreground" />{item.label}<span className="ml-auto text-[10px] text-muted-foreground">Open</span></Link>; }) : <p className="p-5 text-center text-xs text-muted-foreground">No matching pages.</p>}</div>
    </SheetContent></Sheet>
    <div className="fixed bottom-20 right-3 z-10 hidden xl:flex"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="size-9 rounded-full bg-background shadow-md" onClick={openSearch} aria-label="Open global search"><Search className="size-4" /></Button></TooltipTrigger><TooltipContent>Search · Ctrl K</TooltipContent></Tooltip></TooltipProvider></div>
  </div>;
}
