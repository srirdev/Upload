import { BadgeCheck, Bike, Clock3, CreditCard, FileCheck2, LogOut, Mail, MapPin, Phone, ShieldAlert, type LucideIcon } from "lucide-react";
import { signOut } from "@/app/layouts/shells";
import { ChangePasswordButton } from "@/shared/components/auth/ChangePassword";
import { useRider } from "@/modules/rider/api";
import { useAvailability } from "@/modules/rider/components/AvailabilityToggle";
import { useAuth } from "@/shared/api/authStore";
import { Avatar, StatusPill, type StatusKind } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, SectionHeader } from "@/shared/components/ui/card";
import { Switch } from "@/shared/components/ui/fields";
import { FadeIn } from "@/shared/components/ui/motion";
import { PageLoader } from "@/shared/components/ui/states";

const KYC: Record<string, { kind: StatusKind; label: string; icon: LucideIcon }> = {
  pending: { kind: "waiting", label: "Under review", icon: Clock3 },
  approved: { kind: "done", label: "Verified", icon: BadgeCheck },
  rejected: { kind: "problem", label: "Needs attention", icon: ShieldAlert },
};

export function RiderProfilePage() {
  const r = useRider().data;
  const user = useAuth((s) => s.user);
  const { online, change, pending } = useAvailability();
  if (!r) return <PageLoader />;
  const kyc = KYC[r.kyc_status]!;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <FadeIn>
        <section className="bg-midnight relative overflow-hidden rounded-4xl p-6 text-white shadow-lift">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-orange/25 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <Avatar name={r.full_name} className="size-16 text-xl ring-4 ring-white/15" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-extrabold">{r.full_name}</h1>
              <p className="text-sm text-white/70">Delivery Partner · {r.base_area}</p>
              <StatusPill kind={kyc.kind} className="mt-2 bg-white text-navy">{kyc.label}</StatusPill>
            </div>
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.05}>
        <Card className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-navy">Available for deliveries</p>
            <p className="text-sm text-muted">{online ? "You're receiving new run offers." : "Turn on to receive new run offers."}</p>
          </div>
          <Switch checked={online} onChange={change} disabled={pending} label="Available for deliveries" tone="mint" />
        </Card>
      </FadeIn>

      <FadeIn delay={0.08}>
        <Card pad="lg">
          <SectionHeader title="Your details" />
          <dl className="divide-y divide-border">
            <Row icon={Phone} label="Mobile" value={user?.mobile ? `+91 ${user.mobile}` : "—"} />
            {user?.email && <Row icon={Mail} label="Email" value={user.email} />}
            <Row icon={MapPin} label="Base area" value={r.base_area} />
            <Row icon={Bike} label="Vehicle" value={r.vehicle_number} />
            <Row icon={CreditCard} label="UPI ID for payouts" value={r.upi_id} />
            <Row icon={FileCheck2} label="Documents" value={[r.has_dl && "Driving licence", r.has_rc && "Vehicle RC"].filter(Boolean).join(" · ") || "—"} />
          </dl>
        </Card>
      </FadeIn>

      <ChangePasswordButton className="w-full" />
      <Button variant="danger-soft" size="lg" className="w-full" onClick={signOut}>
        <LogOut className="size-5" aria-hidden /> Log out
      </Button>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="ml-auto truncate text-right font-semibold text-navy">{value}</dd>
    </div>
  );
}
