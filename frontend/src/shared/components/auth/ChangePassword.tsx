import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Lock } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { changePassword } from "@/shared/api/auth";
import { useAuth } from "@/shared/api/authStore";
import { Button, type ButtonProps } from "@/shared/components/ui/button";
import { Modal } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Spinner } from "@/shared/components/ui/states";
import { toast } from "@/shared/components/ui/toast";

const schema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** "Change password" button + dialog for any signed-in user. Other devices are signed out on success. */
export function ChangePasswordButton({ variant = "outline", className, label = "Change password" }: {
  variant?: ButtonProps["variant"]; className?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const setSession = useAuth((s) => s.setSession);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { current: "", password: "", confirm: "" } });
  const change = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => changePassword(v.current, v.password),
    onSuccess: (tokens) => {
      setSession(tokens);
      toast.success("Password changed. Other devices were signed out.");
      close(false);
    },
  });
  const close = (v: boolean) => {
    setOpen(v);
    if (!v) {
      form.reset();
      change.reset();
    }
  };
  const err = (m?: string) => m && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{m}</p>;

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        <KeyRound className="size-4" aria-hidden /> {label}
      </Button>
      <Modal open={open} onOpenChange={close} title="Change password" description="You'll stay signed in here; other devices are signed out.">
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => change.mutate(v))}>
          <div>
            <Label htmlFor="cp-current">Current password</Label>
            <Input id="cp-current" icon={Lock} type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.current} {...form.register("current")} />
            {err(form.formState.errors.current?.message)}
          </div>
          <div>
            <Label htmlFor="cp-new">New password</Label>
            <Input id="cp-new" icon={Lock} type="password" autoComplete="new-password" aria-invalid={!!form.formState.errors.password} {...form.register("password")} />
            {err(form.formState.errors.password?.message)}
          </div>
          <div>
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input id="cp-confirm" icon={Lock} type="password" autoComplete="new-password" aria-invalid={!!form.formState.errors.confirm} {...form.register("confirm")} />
            {err(form.formState.errors.confirm?.message ?? change.error?.message)}
          </div>
          <Button type="submit" className="w-full" disabled={change.isPending}>
            {change.isPending ? <Spinner className="text-white" /> : "Update password"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
