import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import type { Run } from "@/modules/rider/api/types";
import { Button } from "@/shared/components/ui/button";
import { rupees } from "@/shared/utils/format";

const BURST = ["#ffc83d", "#f2690d", "#14b86e", "#c4b0f5", "#ffffff", "#ff8a2b"];

/** Celebration after a run is completed. */
export function CompletedRun({ run, onClose }: { run: Run; onClose: () => void }) {
  return (
    <div className="bg-midnight relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden rounded-4xl px-6 py-12 text-center text-white shadow-lift">
      {/* Confetti burst (decorative) */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[38%]">
        {Array.from({ length: 18 }, (_, i) => {
          const angle = (i / 18) * Math.PI * 2;
          const dist = 110 + (i % 3) * 40;
          return (
            <motion.span
              key={i}
              className="absolute size-2.5 rounded-sm"
              style={{ background: BURST[i % BURST.length] }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
              animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, rotate: 220, scale: 1 }}
              transition={{ duration: 1.4, ease: "easeOut", delay: 0.15 }}
            />
          );
        })}
      </div>

      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 14 }}
        className="relative flex size-24 items-center justify-center rounded-full bg-mint text-navy shadow-[0_0_0_12px_rgb(20_184_110/0.18)]"
      >
        <Check className="size-12" strokeWidth={3} aria-hidden />
      </motion.span>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="relative mt-6 space-y-2">
        <h1 className="font-display text-3xl font-extrabold">Delivery complete</h1>
        <p className="text-white/80">
          {run.packet_count} packet{run.packet_count === 1 ? "" : "s"} delivered to {run.college.security_cabin}.
        </p>
        <p className="pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">You earned</p>
        <p className="font-display text-5xl font-extrabold text-sun tabular">{rupees(run.guaranteed_payout)}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="relative mt-8 flex w-full max-w-xs flex-col gap-2">
        <Button variant="white" size="lg" onClick={onClose}>Done</Button>
        <Button variant="glass" asChild>
          <Link to="/rider/earnings">View earnings <ArrowRight className="size-4" aria-hidden /></Link>
        </Button>
      </motion.div>
    </div>
  );
}
