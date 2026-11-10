import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Briefcase, Crown, Layers3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AuthLayout } from "./auth-layout";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  role: z.enum(["Owner", "Employee"]),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { login, user, ready } = useAuth();
  const navigate = useNavigate();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "aarav@meridiansupply.in", password: "demo1234", role: "Owner" },
  });
  const role = form.watch("role");

  useEffect(() => {
    if (ready && user) void navigate({ to: "/" });
  }, [ready, user, navigate]);

  const pickRole = (r: Values["role"]) => {
    form.setValue("role", r);
    form.setValue("email", r === "Owner" ? "aarav@meridiansupply.in" : "neha@meridiansupply.in");
  };

  const onSubmit = async (v: Values) => {
    await login(v.email, v.role);
    void navigate({ to: "/" });
  };

  return (
    <AuthLayout>
      <div className="mb-8 flex items-center gap-2 lg:hidden">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Layers3 className="size-5" />
        </span>
        <span className="font-display text-lg font-extrabold">Meridian Supply</span>
      </div>
      <h1 className="font-display text-2xl font-extrabold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Only the owner and employees have logins.
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Demo role</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["Owner", Crown, "Full access"],
                  ["Employee", Briefcase, "Neha · Operations"],
                ] as const
              ).map(([r, Icon, hint]) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => pickRole(r)}
                  aria-pressed={role === r}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    role === r
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50",
                  )}
                >
                  <Icon className="size-4 text-primary" />
                  <p className="mt-1.5 text-sm font-semibold">{r}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </button>
              ))}
            </div>
          </fieldset>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}Sign in
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Demo: any password with 4+ characters works.
          </p>
        </form>
      </Form>
    </AuthLayout>
  );
}
