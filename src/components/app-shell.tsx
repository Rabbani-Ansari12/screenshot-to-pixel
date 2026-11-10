import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronDown,
  Command as CommandIcon,
  Inbox,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Search,
  Settings2,
  Sun,
  Truck,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotifications, useReviewItems, useWhatsAppStatus } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatRelative, initials } from "@/lib/format";
import { NAV_GROUPS, navItemFor, usesSampleData } from "@/lib/navigation";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { InfoNote, NoAccess } from "./common";
import { CommandPalette } from "./command-palette";
import { UploadDialog } from "./upload-dialog";

function useReviewCount() {
  const { data } = useReviewItems();
  return data?.filter((r) => r.status === "Open").length ?? 0;
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 rounded-lg">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
        <Layers3 className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[15px] font-extrabold leading-tight tracking-tight">
          Meridian Supply
        </span>
        <span className="block text-[11px] text-sidebar-foreground/60">
          Materials · Transport · Accounts
        </span>
      </span>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can } = useAuth();
  const reviewCount = useReviewCount();
  const active = navItemFor(pathname);
  const { data: wa } = useWhatsAppStatus();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Brand />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => can(i.requires));
          if (!items.length) return null;
          return (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const isActive = active?.path === item.path;
                  const Icon = item.icon;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={onNavigate}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "group flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-sidebar-ring",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/55",
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{item.label}</span>
                        {item.badge === "review" && reviewCount > 0 && (
                          <span
                            className="ml-auto rounded-full bg-amber-400 px-1.5 py-px text-[11px] font-bold text-amber-950"
                            aria-label={`${reviewCount} items to review`}
                          >
                            {reviewCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">WhatsApp automation</span>
          <span
            className={cn(
              "size-2 rounded-full",
              wa?.connected === false ? "bg-rose-400" : "bg-emerald-400",
            )}
            aria-hidden
          />
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-sidebar-foreground/60">
          {wa?.connected === false
            ? "Disconnected — use manual upload."
            : `Connected via Twilio · last message ${wa ? formatRelative(wa.lastMessageAt) : "…"}`}
        </p>
      </div>
    </div>
  );
}

function NotificationsBell() {
  const { data } = useNotifications();
  const unread = data?.filter((n) => !n.read).length ?? 0;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={`Exceptions${unread ? `, ${unread} new` : ""}`}
            >
              <Bell className="size-[18px]" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-amber-950">
                  {unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Exceptions only</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-semibold">Exceptions</p>
            <p className="text-xs text-muted-foreground">
              Only items that need a person. Routine events stay silent.
            </p>
          </div>
        </div>
        <ul className="max-h-[380px] divide-y overflow-y-auto">
          {(data ?? []).slice(0, 12).map((n) => (
            <li key={n.id}>
              <Link
                to={n.href}
                className={cn("flex gap-3 px-4 py-3 hover:bg-muted/50", n.read && "opacity-70")}
              >
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    n.severity === "danger" ? "text-rose-600" : "text-amber-600",
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.detail}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatRelative(n.at)}</p>
                </div>
                {!n.read && (
                  <span
                    className="ml-auto mt-1.5 size-2 shrink-0 rounded-full bg-amber-500"
                    aria-label="New"
                  />
                )}
              </Link>
            </li>
          ))}
          {!data?.length && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No exceptions. Everything is running automatically.
            </li>
          )}
        </ul>
        <div className="border-t px-4 py-2.5">
          <Link to="/review" className="text-sm font-medium text-primary hover:underline">
            Open review queue
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WhatsAppIndicator() {
  const { data } = useWhatsAppStatus();
  const connected = data?.connected !== false;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/whatsapp"
          className={cn(
            "hidden h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium md:flex",
            connected
              ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-600/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
          )}
        >
          <span
            className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-rose-500")}
            aria-hidden
          />
          WhatsApp {connected ? "connected" : "disconnected"}
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        {connected ? `Twilio · ${data?.number ?? ""}` : "Use manual upload until the line is back"}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => setTheme(readTheme()), []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Light / dark</TooltipContent>
    </Tooltip>
  );
}

function UserMenu() {
  const { user, logout, isOwner } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="Account menu">
          <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {initials(user.name)}
          </span>
          <span className="hidden text-left lg:block">
            <span className="block text-[13px] font-semibold leading-tight">{user.name}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">
              {user.role}
            </span>
          </span>
          <ChevronDown className="hidden size-3.5 opacity-60 lg:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p>{user.name}</p>
          <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isOwner && (
          <DropdownMenuItem onSelect={() => void navigate({ to: "/employees" })}>
            <UserCog className="size-4" /> Employees & permissions
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem onSelect={() => void navigate({ to: "/settings" })}>
            <Settings2 className="size-4" /> Settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            void logout().finally(() => navigate({ to: "/login" }));
          }}
        >
          <LogOut className="size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = navItemFor(pathname);
  const reviewCount = useReviewCount();
  const { can } = useAuth();
  const items = [
    { label: "Home", path: "/", icon: LayoutDashboard, show: true },
    { label: "Inbox", path: "/documents", icon: Inbox, show: can("view_records") },
    {
      label: "Review",
      path: "/review",
      icon: CheckCheck,
      show: can("review_documents"),
      badge: reviewCount,
    },
    { label: "Trips", path: "/trips", icon: Truck, show: can("view_records") },
  ].filter((i) => i.show);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      aria-label="Mobile navigation"
    >
      <ul className="grid grid-cols-5">
        {items.map((i) => {
          const isActive = active?.path === i.path;
          return (
            <li key={i.path}>
              <Link
                to={i.path}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <i.icon className="size-5" aria-hidden />
                {i.label}
                {"badge" in i && i.badge ? (
                  <span className="absolute right-[calc(50%-18px)] top-1.5 rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-950">
                    {i.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
            aria-label="Open full menu"
          >
            <MoreHorizontal className="size-5" aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [upload, setUpload] = useState(false);
  const item = navItemFor(pathname);
  const allowed = !item || can(item.requires);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] bg-sidebar text-sidebar-foreground lg:block">
        <SidebarNav />
      </aside>
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-lg sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <button
            type="button"
            onClick={() => setSearch(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 sm:max-w-md"
            aria-label="Search (Ctrl+K)"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Search trips, vehicles, orders…</span>
            <kbd className="ml-auto hidden items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[11px] sm:flex">
              <CommandIcon className="size-3" />K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <WhatsAppIndicator />
            <NotificationsBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-[1480px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12"
        >
          {allowed && usesSampleData(pathname) && (
            <InfoNote tone="warning" className="mb-4">
              This page still shows sample data. It will switch to your live records when this
              module is connected.
            </InfoNote>
          )}
          {allowed ? children : <NoAccess />}
        </main>
      </div>
      <MobileBottomNav onMore={() => setDrawer(true)} />
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent
          side="left"
          className="w-[290px] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>All pages</SheetDescription>
          </SheetHeader>
          <SidebarNav onNavigate={() => setDrawer(false)} />
        </SheetContent>
      </Sheet>
      <CommandPalette open={search} onOpenChange={setSearch} onUpload={() => setUpload(true)} />
      <UploadDialog open={upload} onOpenChange={setUpload} />
    </div>
  );
}
