import { ArrowRight, Clock3, FileType2, MapPin, Scale, Sparkles, Store, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { useColleges, useOrders, useProfile, useSlots } from "@/modules/student/api";
import { ACTIVE_STATUSES, type OrderSummary, type Slot } from "@/modules/student/api/types";
import { OrderCard, OrderStatusPill } from "@/modules/student/components/OrderCard";
import { ReferralCard } from "@/modules/student/components/ReferralCard";
import { ServiceCategories } from "@/modules/student/components/ServiceCategories";
import { TRACK_STEPS, trackStage } from "@/modules/student/components/status";
import { useNow } from "@/modules/student/hooks/useNow";
import { useStartOrder } from "@/modules/student/hooks/useStartOrder";
import { CampusArt, EmptyBoxArt, UploadHeroArt } from "@/shared/components/illustrations";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, SectionHeader } from "@/shared/components/ui/card";
import { FadeIn } from "@/shared/components/ui/motion";
import { ProgressSteps } from "@/shared/components/ui/progress";
import { EmptyState, ErrorState, ListSkeleton, Skeleton, Spinner } from "@/shared/components/ui/states";
import { countdown, formatDate, formatTime } from "@/shared/utils/format";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function HomePage() {
  const profile = useProfile().data!;
  const orders = useOrders();
  const colleges = useColleges();
  const slots = useSlots(profile.college_id);
  const start = useStartOrder();
  const now = useNow();

  const college = colleges.data?.find((c) => c.id === profile.college_id);
  const nextSlot = slots.data?.find((s) => s.is_open);
  const left = nextSlot ? countdown(nextSlot.cutoff_at, now) : null;
  const active = orders.data?.filter((o) => ACTIVE_STATUSES.includes(o.status)) ?? [];
  const recent = orders.data?.slice(0, 3) ?? [];
  const first = profile.full_name.split(" ")[0];

  const startButton = (variant: "white" | "default" = "white", label = "Upload documents") => (
    <Button size="lg" variant={variant} onClick={() => start.mutate()} disabled={start.isPending}>
      {start.isPending ? <Spinner className={variant === "white" ? undefined : "text-white"} /> : <>{label} <ArrowRight className="size-5" aria-hidden /></>}
    </Button>
  );

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <FadeIn className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{greeting()},</p>
          <h1 className="font-display text-3xl font-extrabold text-navy md:text-4xl">{first}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="violet" icon={MapPin}>{profile.college_name}</Badge>
            <Badge tone="neutral">{profile.department} · Year {profile.year}</Badge>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0 space-y-8">
          {/* Upload hero */}
          <FadeIn delay={0.05}>
            <Card tone="brand" pad="none" className="p-6 md:p-8">
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <Badge className="glass-dark mb-3 text-white ring-1 ring-white/25" icon={Sparkles}>Print & deliver</Badge>
                  <h2 className="font-display text-[1.75rem] font-extrabold leading-[1.1] md:text-4xl">
                    Upload now,
                    <br />
                    collect at the gate.
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-white/85 md:text-base">
                    PDF, Word, PowerPoint or photos. Delivered to {college?.security_cabin ?? "your security cabin"}.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {startButton()}
                    <span className="glass-dark inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-white/20" aria-live="polite">
                      <Timer className="size-4" aria-hidden />
                      {slots.isLoading ? "Checking slots…" : nextSlot ? <>Order within <b className="tabular">{left ?? "0m"}</b> for {nextSlot.label}</> : "No slots open right now"}
                    </span>
                  </div>
                </div>
                <UploadHeroArt className="hidden h-44 shrink-0 animate-float sm:block md:h-52" />
              </div>
            </Card>
          </FadeIn>

          {/* Services */}
          <FadeIn delay={0.1}>
            <section aria-labelledby="services">
              <SectionHeader title={<span id="services">What do you need?</span>} subtitle="Tap a service to see the options" />
              <ServiceCategories />
            </section>
          </FadeIn>

          {/* Feature banners (real features only) */}
          <FadeIn delay={0.15}>
            <section aria-label="Why UpLOAD" className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
              <Banner tone="bg-sunrise text-white" icon={Scale} title="Compare shop prices" text="See what each nearby shop charges for your exact order, then pick one." />
              <Banner tone="bg-midnight text-white" icon={Store} title="Shops do the queueing" text="Your order goes straight to a print shop's queue. No standing in line." />
              <Banner tone="bg-mintfresh text-navy" icon={FileType2} title="Word & PowerPoint OK" text="We convert DOCX and PPTX to PDF so you can check the page count." />
            </section>
          </FadeIn>

          {/* Recent orders */}
          <FadeIn delay={0.2}>
            <section aria-labelledby="recent">
              <SectionHeader
                title={<span id="recent">Recent orders</span>}
                action={recent.length > 0 && <Link to="/student/orders" className="text-sm font-semibold text-primary hover:underline">See all</Link>}
              />
              {orders.isLoading ? (
                <ListSkeleton rows={2} />
              ) : orders.isError ? (
                <ErrorState compact message={orders.error.message} onRetry={() => orders.refetch()} />
              ) : recent.length === 0 ? (
                <Card tone="flat">
                  <EmptyState compact art={EmptyBoxArt} title="No orders yet" hint="Your first print is one upload away." action={startButton("default", "Start your first order")} />
                </Card>
              ) : (
                <div className="space-y-3">{recent.map((o) => <OrderCard key={o.id} order={o} />)}</div>
              )}
            </section>
          </FadeIn>
        </div>

        {/* Right column: live order, slot, referral */}
        <div className="min-w-0 space-y-6">
          {active.map((o) => <ActiveOrder key={o.id} order={o} />)}
          <NextSlot loading={slots.isLoading} slot={nextSlot} others={slots.data?.filter((s) => s.is_open && s !== nextSlot).slice(0, 3) ?? []} left={left} cabin={college?.security_cabin} />
          <ReferralCard code={profile.referral_code} />
        </div>
      </div>
    </div>
  );
}

function Banner({ tone, icon: Icon, title, text }: { tone: string; icon: typeof Scale; title: string; text: string }) {
  return (
    <div className={`relative w-72 shrink-0 snap-start overflow-hidden rounded-3xl p-5 shadow-soft md:w-auto ${tone}`}>
      <div aria-hidden className="absolute -right-8 -top-8 size-28 rounded-full bg-white/12" />
      <Icon className="relative mb-3 size-7" aria-hidden />
      <p className="relative font-display text-lg font-bold">{title}</p>
      <p className="relative mt-1 text-sm opacity-90">{text}</p>
    </div>
  );
}

function ActiveOrder({ order }: { order: OrderSummary }) {
  const waitingPayment = order.status === "awaiting_payment";
  return (
    <FadeIn>
      <Card pad="lg" className="ring-2 ring-primary/15">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Live order</p>
            <p className="font-display text-xl font-extrabold text-navy">{order.code}</p>
            {order.slot_date && <p className="text-xs text-muted">Delivery on {formatDate(order.slot_date, { weekday: "short", day: "numeric", month: "short" })}</p>}
          </div>
          <OrderStatusPill status={order.status} />
        </div>
        {waitingPayment ? (
          <Button asChild className="w-full">
            <Link to={`/student/new/${order.id}?step=4`}>Continue to payment</Link>
          </Button>
        ) : (
          <>
            <ProgressSteps steps={TRACK_STEPS} current={trackStage(order.status)} orientation="horizontal" />
            <Button asChild variant="soft" className="mt-5 w-full">
              <Link to={`/student/orders/${order.id}`}>Track order <ArrowRight className="size-4" aria-hidden /></Link>
            </Button>
          </>
        )}
      </Card>
    </FadeIn>
  );
}

function NextSlot({ loading, slot, others, left, cabin }: { loading: boolean; slot?: Slot; others: Slot[]; left: string | null; cabin?: string }) {
  return (
    <Card tone="midnight" pad="lg">
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sun">Next delivery slot</p>
          {loading ? (
            <Skeleton className="mt-2 h-14 w-48 bg-none bg-white/15" />
          ) : slot ? (
            <>
              <p className="mt-1 font-display text-2xl font-extrabold">{slot.label}</p>
              <p className="text-sm text-white/80">
                {formatDate(slot.delivery_at, { weekday: "short", day: "numeric", month: "short" })} · arrives {formatTime(slot.delivery_at)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-xl font-bold">No slots open right now</p>
              <p className="text-sm text-white/75">New slots open through the day. Check back soon.</p>
            </>
          )}
        </div>
        <CampusArt className="h-20 shrink-0" />
      </div>
      {slot && (
        <div className="relative mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="glass-dark rounded-2xl p-3 ring-1 ring-white/15">
            <p className="flex items-center gap-1.5 text-xs text-white/70"><Clock3 className="size-3.5" aria-hidden /> Order within</p>
            <p className="font-display text-lg font-bold tabular">{left ?? "Closing"}</p>
          </div>
          <div className="glass-dark rounded-2xl p-3 ring-1 ring-white/15">
            <p className="flex items-center gap-1.5 text-xs text-white/70"><MapPin className="size-3.5" aria-hidden /> Drop point</p>
            <p className="truncate font-semibold">{cabin ?? "Security cabin"}</p>
          </div>
        </div>
      )}
      {others.length > 0 && (
        <ul className="relative mt-3 flex flex-wrap gap-2" aria-label="Later slots">
          {others.map((s) => (
            <li key={`${s.slot_id}${s.date}`} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">
              {s.label} · {formatDate(s.delivery_at, { weekday: "short" })} {formatTime(s.delivery_at)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
