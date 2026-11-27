import { useState } from "react";
import { BookOpen, Check, GraduationCap, Hash, LogOut, Mail, Pencil, Phone, User, X } from "lucide-react";
import { signOut } from "@/app/layouts/shells";
import { ChangePasswordButton } from "@/shared/components/auth/ChangePassword";
import { useProfile, useRenameProfile } from "@/modules/student/api";
import { ReferralCard } from "@/modules/student/components/ReferralCard";
import { useAuth } from "@/shared/api/authStore";
import { Avatar } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, SectionHeader } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { FadeIn } from "@/shared/components/ui/motion";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";

export function ProfilePage() {
  const profile = useProfile().data!;
  const user = useAuth((s) => s.user);
  const rename = useRenameProfile();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.full_name);

  const rows = [
    { icon: Phone, label: "Mobile", value: user?.mobile ? `+91 ${user.mobile}` : "—" },
    { icon: Mail, label: "Email", value: user?.email || "Not added" },
    { icon: GraduationCap, label: "College", value: profile.college_name },
    { icon: BookOpen, label: "Department", value: `${profile.department} · Year ${profile.year}` },
    { icon: Hash, label: "Register number", value: profile.register_number },
  ];

  function save() {
    const v = name.trim();
    if (v.length < 2) return toast.error("Enter your full name");
    rename.mutate(v, {
      onSuccess: () => {
        setEditing(false);
        toast.success("Name updated. New cover pages will use it.");
      },
      onError: toastError,
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <FadeIn>
        <Card tone="brand" pad="lg" className="flex items-center gap-4">
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
          <Avatar name={profile.full_name} className="relative size-16 text-xl ring-4 ring-white/30" />
          <div className="relative min-w-0 flex-1">
            {editing ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <Input aria-label="Full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus className="h-11 text-navy" />
                <Button type="submit" size="icon" variant="white" aria-label="Save name" disabled={rename.isPending}>
                  {rename.isPending ? <Spinner /> : <Check className="size-5" />}
                </Button>
                <Button type="button" size="icon" variant="glass" aria-label="Cancel" onClick={() => { setEditing(false); setName(profile.full_name); }}>
                  <X className="size-5" />
                </Button>
              </form>
            ) : (
              <>
                <h1 className="truncate font-display text-2xl font-extrabold">{profile.full_name}</h1>
                <p className="truncate text-sm text-white/80">{profile.college_name}</p>
              </>
            )}
          </div>
          {!editing && (
            <Button variant="glass" size="sm" className="relative" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Edit name
            </Button>
          )}
        </Card>
      </FadeIn>

      <div className="grid gap-6 md:grid-cols-2">
        <Card pad="lg">
          <SectionHeader title="Account details" subtitle="Used on your cover pages and packet labels" />
          <dl className="divide-y divide-border">
            {rows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 py-3">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="ml-auto min-w-0 truncate text-right text-sm font-semibold text-navy">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-surface p-3 text-xs text-muted">
            <User className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            College, department and register number are fixed after sign-up. Contact support from the Help tab to change them.
          </p>
        </Card>

        <div className="space-y-6">
          <ReferralCard code={profile.referral_code} />
          <ChangePasswordButton className="w-full" />
          <Button variant="outline" size="lg" className="w-full" onClick={signOut}>
            <LogOut className="size-5" aria-hidden /> Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
