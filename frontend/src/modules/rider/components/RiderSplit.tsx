import type { ReactNode } from "react";
import { BadgeIndianRupee, Bike, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { ScooterArt } from "@/shared/components/illustrations";
import { Logo } from "@/shared/components/Logo";
import { ProgressSteps } from "@/shared/components/ui/progress";

/** Onboarding layout: midnight hero (desktop side panel, phone header) + white form card. */
export function RiderSplit({ headline, sub, children }: { headline: string; sub: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[1fr_1.1fr]">
      <section className="bg-midnight relative overflow-hidden px-6 pb-24 pt-8 text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-orange/25 blur-3xl" />
        <Logo inverted className="relative" />
        <div className="relative mt-8 lg:mt-0">
          <h1 className="max-w-md font-display text-3xl font-extrabold leading-tight lg:text-[2.75rem]">{headline}</h1>
          <p className="mt-3 hidden max-w-md text-white/80 lg:block">{sub}</p>
          <ul className="mt-8 hidden space-y-3 lg:block">
            {[
              { icon: BadgeIndianRupee, text: "Payout shown before you accept" },
              { icon: Bike, text: "Batched pickups along one route" },
              { icon: Wallet, text: "Settlements straight to your UPI" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm font-semibold">
                <span className="glass-dark flex size-10 items-center justify-center rounded-2xl ring-1 ring-white/20"><Icon className="size-5" aria-hidden /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <ScooterArt className="pointer-events-none absolute -bottom-1 right-3 h-24 w-auto lg:static lg:h-40 lg:animate-float lg:self-end" />
      </section>
      <main className="relative -mt-16 px-4 pb-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-lg rounded-4xl bg-background p-6 shadow-lift ring-1 ring-border/60 sm:p-8"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

/** Registration -> documents -> review. */
export function RiderSteps({ current }: { current: number }) {
  return <ProgressSteps orientation="horizontal" current={current} steps={[{ label: "Your details" }, { label: "Documents" }, { label: "Verification" }]} />;
}
