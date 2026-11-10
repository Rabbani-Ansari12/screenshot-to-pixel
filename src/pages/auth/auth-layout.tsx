import type { ReactNode } from "react";
import { CheckCircle2, Layers3 } from "lucide-react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col">
        <div className="dashboard-grid absolute inset-0 opacity-20" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Layers3 className="size-5" />
          </span>
          <span className="font-display text-lg font-extrabold">Meridian Supply</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="font-display text-3xl font-extrabold leading-tight">
            Slips arrive on WhatsApp. Trips record themselves.
          </h2>
          <p className="mt-3 text-sidebar-foreground/70">
            You only step in when something doesn't add up.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-sidebar-foreground/80">
            {[
              "Weighbridge slips read and matched to trips automatically",
              "Bills reconciled line by line against recorded trips",
              "Shortages flagged against material tolerance",
              "Order-wise profit with landed cost",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-sidebar-foreground/50">
          Demo build · all data is sample data
        </p>
      </div>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
