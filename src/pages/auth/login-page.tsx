import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Layers3, Loader2 } from "lucide-react";
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
import { takeRedirect } from "@/components/protected-route";
import { useAuth } from "@/lib/auth";
import { AuthLayout } from "./auth-layout";
import { PasswordInput } from "@/components/password-input";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { login, user, ready, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (ready && user) void navigate({ to: takeRedirect() });
  }, [ready, user, navigate]);

  const onSubmit = async (v: Values) => {
    setError(null);
    clearNotice();
    try {
      await login(v.email, v.password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in. Please try again.");
      form.setValue("password", "");
    }
  };
  const message = error ?? notice;

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
      {message && (
        <div
          role="alert"
          className="mt-6 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" autoFocus {...field} />
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
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !ready}>
            {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}Sign in
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No account? Ask the owner to add you under Employees & Permissions.
          </p>
        </form>
      </Form>
    </AuthLayout>
  );
}
