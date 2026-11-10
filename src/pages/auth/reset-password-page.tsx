import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { AuthLayout } from "./auth-layout";

const schema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .regex(/[A-Za-z]/, "Include a letter")
      .regex(/\d/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type Values = z.infer<typeof schema>;

/** Landing page for password-reset and invite links (Supabase signs the user in from the link). */
export function ResetPasswordPage() {
  const { user, ready, recovery, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await updatePassword(v.password);
      toast.success("Password updated");
      void navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the password.");
    }
  };

  const canSet = Boolean(user) || recovery;

  return (
    <AuthLayout>
      <Link
        to="/login"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
      <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <KeyRound className="size-6" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-extrabold">Set a new password</h1>
      {!ready ? (
        <p className="mt-2 text-sm text-muted-foreground" aria-busy="true">
          Checking your link…
        </p>
      ) : !canSet ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is invalid or has expired. Ask for a new one.
          </p>
          <Button asChild variant="outline" className="mt-6 w-full">
            <Link to="/forgot-password">Send a new link</Link>
          </Button>
        </>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}Save
              password
            </Button>
          </form>
        </Form>
      )}
    </AuthLayout>
  );
}
