import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
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
import { AuthLayout } from "./auth-layout";

const schema = z.object({ email: z.string().email("Enter a valid email") });

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });
  // TODO(backend): supabase.auth.resetPasswordForEmail(email)
  const onSubmit = async ({ email }: z.infer<typeof schema>) => {
    await new Promise((r) => setTimeout(r, 700));
    setSentTo(email);
  };
  return (
    <AuthLayout>
      <Link
        to="/login"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
      {sentTo ? (
        <div role="status">
          <span className="grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
            <MailCheck className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-extrabold">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If <span className="font-medium text-foreground">{sentTo}</span> belongs to an active
            account, a reset link is on its way. The link expires in 30 minutes.
          </p>
          <Button asChild variant="outline" className="mt-6 w-full">
            <Link to="/login">Return to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-extrabold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your work email and we'll send a reset link.
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@meridiansupply.in"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}Send
                reset link
              </Button>
            </form>
          </Form>
        </>
      )}
    </AuthLayout>
  );
}
