import { useState } from "react";
import { z } from "zod";
import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import type { Employee } from "@/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ErrorState, PageSkeleton, SectionCard } from "@/components/common";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { QuickAddDialog } from "@/components/quick-add-dialog";
import { StatusBadge } from "@/components/status-badge";
import { api, useAction, useEmployees, useSetPermission } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatRelative, initials } from "@/lib/format";
import { PERMISSION_INFO } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    name: z.string().min(2, "Required"),
    email: z.string().email("Enter a valid email"),
    phone: z.string().regex(/^\+?[\d\s]{10,15}$/, "Enter a valid phone"),
    designation: z.string().min(2, "Required"),
    permissions: z
      .array(
        z.enum([
          "view_records",
          "manage_orders",
          "review_documents",
          "manage_trips",
          "correct_extracted",
          "verify_bills",
          "record_payments",
          "view_financial_reports",
        ]),
      )
      .min(1, "Give at least one permission"),
    method: z.enum(["invite", "temp_password", "magic_link"]),
    password: z.string(),
  })
  .refine((v) => v.method !== "temp_password" || v.password.length >= 10, {
    path: ["password"],
    message: "Temporary password needs at least 10 characters",
  });

const resetSchema = z
  .object({ method: z.enum(["email", "temp_password"]), password: z.string() })
  .refine((v) => v.method !== "temp_password" || v.password.length >= 10, {
    path: ["password"],
    message: "Temporary password needs at least 10 characters",
  });

export function EmployeesPage() {
  const { data, isLoading, error } = useEmployees();
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState<Employee | null>(null);
  const [resetting, setResetting] = useState<Employee | null>(null);
  const { user } = useAuth();
  const create = useAction(
    (v: z.infer<typeof schema>) =>
      api.admin.createEmployee({
        name: v.name,
        email: v.email,
        phone: v.phone,
        designation: v.designation,
        permissions: v.permissions,
        method: v.method,
        ...(v.method === "temp_password" ? { password: v.password } : {}),
      }),
    (e) => `${e.name} added · they can sign in with ${e.email}`,
    { invalidate: [["employees"]] },
  );
  const reset = useAction(
    (v: { id: string; method: "email" | "temp_password"; password?: string }) =>
      api.admin.resetEmployeePassword(v.id, v.method, v.password),
    (r) => (r.method === "email" ? "Password reset link sent" : "Temporary password set"),
    { invalidate: [] },
  );
  const setActive = useAction(
    (v: { id: string; active: boolean }) => api.admin.setEmployeeActive(v.id, v.active),
    (e) => `${e.name} ${e.active ? "reactivated" : "deactivated"}`,
    { invalidate: [["employees"], ["audit"]] },
  );
  const setPermission = useSetPermission();
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <PageSkeleton rows={6} />;
  const staff = data.filter((e) => e.role === "Employee");
  const owners = data.filter((e) => e.role === "Owner");

  return (
    <>
      <PageHeader
        title="Employees & Permissions"
        description="Only the owner and employees log in. Turn permissions on or off — pages and menu items follow immediately."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add employee
          </Button>
        }
      />

      <SectionCard title="Team" className="mb-4" contentClassName="p-0">
        <ul className="divide-y">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold",
                  e.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {initials(e.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {e.name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · {e.designation}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.email} · {e.phone} ·{" "}
                  {e.lastActiveAt ? `active ${formatRelative(e.lastActiveAt)}` : "never signed in"}
                </p>
              </div>
              <StatusBadge
                status={e.role === "Owner" ? "Owner" : e.active ? "Active" : "Inactive"}
                tone={e.role === "Owner" ? "info" : undefined}
              />
              {e.id !== user?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResetting(e)}
                  aria-label={`Reset password for ${e.name}`}
                >
                  <KeyRound className="size-4" /> Reset password
                </Button>
              )}
              {e.role !== "Owner" && e.id !== user?.id && (
                <Button variant="outline" size="sm" onClick={() => setToggling(e)}>
                  {e.active ? (
                    <>
                      <UserX className="size-4" /> Deactivate
                    </>
                  ) : (
                    <>
                      <UserCheck className="size-4" /> Reactivate
                    </>
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Permission matrix"
        description="Changes save instantly and are written to Audit History."
        contentClassName="px-0 pb-2"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
                <th
                  scope="col"
                  className="sticky left-0 bg-muted/40 px-5 py-2 text-left font-semibold"
                >
                  Employee
                </th>
                {PERMISSION_INFO.map((p) => (
                  <th
                    key={p.key}
                    scope="col"
                    className="px-2 py-2 text-center font-semibold"
                    title={p.description}
                  >
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => (
                <tr key={o.id} className="border-b bg-primary/[0.03]">
                  <th scope="row" className="sticky left-0 bg-card px-5 py-3 text-left font-medium">
                    {o.name}{" "}
                    <span className="block text-xs font-normal text-muted-foreground">
                      Owner · always all
                    </span>
                  </th>
                  {PERMISSION_INFO.map((p) => (
                    <td key={p.key} className="px-2 py-3 text-center">
                      <Switch checked disabled aria-label={`${o.name}: ${p.label}`} />
                    </td>
                  ))}
                </tr>
              ))}
              {staff.map((e) => (
                <tr key={e.id} className={cn("border-b last:border-0", !e.active && "opacity-50")}>
                  <th scope="row" className="sticky left-0 bg-card px-5 py-3 text-left font-medium">
                    {e.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {e.designation}
                    </span>
                  </th>
                  {PERMISSION_INFO.map((p) => (
                    <td key={p.key} className="px-2 py-3 text-center">
                      <Switch
                        checked={e.permissions.includes(p.key)}
                        disabled={!e.active || setPermission.isPending}
                        onCheckedChange={(on) => setPermission.mutate({ id: e.id, key: p.key, on })}
                        aria-label={`${e.name}: ${p.label}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid gap-x-6 gap-y-2 border-t px-5 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {PERMISSION_INFO.map((p) => (
            <div key={p.key}>
              <dt className="font-semibold">{p.label}</dt>
              <dd className="text-muted-foreground">{p.description}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <QuickAddDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add employee"
        description="Choose how they sign in the first time. They only see what their permissions allow."
        schema={schema}
        defaults={{
          name: "",
          email: "",
          phone: "",
          designation: "",
          permissions: ["view_records"],
          method: "invite",
          password: "",
        }}
        fields={[
          { name: "name", label: "Full name" },
          { name: "designation", label: "Designation" },
          { name: "email", label: "Work email", type: "email" },
          { name: "phone", label: "Phone", type: "tel" },
          {
            name: "permissions",
            label: "Permissions",
            type: "multiselect",
            full: true,
            options: PERMISSION_INFO.map((p) => ({ value: p.key, label: p.label })),
          },
          {
            name: "method",
            label: "First sign-in",
            type: "select",
            options: [
              { value: "invite", label: "Email an invite (they set a password)" },
              { value: "magic_link", label: "Email a one-time sign-in link" },
              { value: "temp_password", label: "Temporary password (tell them yourself)" },
            ],
          },
          {
            name: "password",
            label: "Temporary password",
            hint: "Only for the temporary-password option. At least 10 characters.",
          },
        ]}
        onSubmit={(v) => create.mutateAsync(v)}
        submitLabel="Add employee"
      />
      <QuickAddDialog
        open={Boolean(resetting)}
        onOpenChange={(o) => !o && setResetting(null)}
        title={`Reset password · ${resetting?.name ?? ""}`}
        description="Email them a reset link, or set a temporary password and tell them yourself."
        schema={resetSchema}
        defaults={{ method: "email", password: "" }}
        fields={[
          {
            name: "method",
            label: "How",
            type: "select",
            full: true,
            options: [
              { value: "email", label: `Email a reset link to ${resetting?.email ?? ""}` },
              { value: "temp_password", label: "Set a temporary password" },
            ],
          },
          { name: "password", label: "Temporary password (only for that option)", full: true },
        ]}
        onSubmit={(v) =>
          resetting
            ? reset.mutateAsync({
                id: resetting.id,
                method: v.method,
                ...(v.method === "temp_password" ? { password: v.password } : {}),
              })
            : Promise.resolve()
        }
        submitLabel="Reset password"
      />
      <ConfirmDialog
        open={Boolean(toggling)}
        onOpenChange={(o) => !o && setToggling(null)}
        destructive={toggling?.active}
        title={
          toggling?.active ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling?.name ?? ""}?`
        }
        description={
          toggling?.active
            ? "They won't be able to sign in. Their past work and audit history stay."
            : "They'll be able to sign in again with their existing permissions."
        }
        confirmLabel={toggling?.active ? "Deactivate" : "Reactivate"}
        onConfirm={() =>
          toggling
            ? setActive.mutateAsync({ id: toggling.id, active: !toggling.active })
            : undefined
        }
      />
    </>
  );
}
