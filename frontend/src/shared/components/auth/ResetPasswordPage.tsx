import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { resetPassword } from "@/shared/api/auth";
import { Logo } from "@/shared/components/Logo";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Spinner } from "@/shared/components/ui/states";
import { ROLE_LABEL, type Role } from "@/shared/types/auth";

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** Target of the emailed link: /<role>/reset-password?token=… Sets a new password, then asks to sign in. */
export function ResetPasswordPage({ role }: { role: Role }) {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const form = useForm({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const reset = useMutation({ mutationFn: (password: string) => resetPassword(token, password) });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
      <Logo />
      <div className="w-full max-w-md rounded-4xl bg-background p-6 shadow-lift ring-1 ring-border/60 sm:p-8">
        {reset.isSuccess ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-mint-soft text-success"><ShieldCheck className="size-7" aria-hidden /></span>
            <h1 className="font-display text-2xl font-extrabold text-navy">Password updated</h1>
            <p className="text-sm text-muted">For your security we signed you out on all devices. Sign in with your new password.</p>
            <Button asChild size="lg" className="w-full"><Link to={`/${role}/login`}>Go to sign in</Link></Button>
          </div>
        ) : !token ? (
          <div className="space-y-4 text-center">
            <h1 className="font-display text-2xl font-extrabold text-navy">This link is incomplete</h1>
            <p className="text-sm text-muted">Open the full link from your email, or request a new one from the sign-in page.</p>
            <Button asChild variant="outline" className="w-full"><Link to={`/${role}/login`}>Back to sign in</Link></Button>
          </div>
        ) : (
          <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => reset.mutate(v.password))}>
            <div>
              <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><KeyRound className="size-6" aria-hidden /></span>
              <h1 className="font-display text-2xl font-extrabold text-navy">Set a new password</h1>
              <p className="mt-1 text-sm text-muted">{ROLE_LABEL[role]} account</p>
            </div>
            <div>
              <Label htmlFor="reset-password">New password</Label>
              <Input id="reset-password" icon={Lock} type="password" autoComplete="new-password"
                aria-invalid={!!form.formState.errors.password} {...form.register("password")} />
              {form.formState.errors.password && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{form.formState.errors.password.message}</p>}
            </div>
            <div>
              <Label htmlFor="reset-confirm">Confirm new password</Label>
              <Input id="reset-confirm" icon={Lock} type="password" autoComplete="new-password"
                aria-invalid={!!form.formState.errors.confirm} {...form.register("confirm")} />
              {(form.formState.errors.confirm || reset.error) && (
                <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{form.formState.errors.confirm?.message ?? reset.error?.message}</p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={reset.isPending}>
              {reset.isPending ? <Spinner className="text-white" /> : "Save new password"}
            </Button>
            <Link to={`/${role}/login`} className="block text-center text-sm font-semibold text-primary hover:underline">Back to sign in</Link>
          </form>
        )}
      </div>
    </main>
  );
}
