import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { GiftArt } from "@/shared/components/illustrations";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { toast } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";

/**
 * The student's own referral code (from the profile). Copy or share it; no reward is promised here
 * because the backend doesn't define one yet.
 */
export function ReferralCard({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const message = `I print my notes and records with UpLOAD and collect them at the campus gate. Use my code ${code} when you sign up.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Referral code copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Long-press the code to copy it.");
    }
  }

  async function share() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: "UpLOAD", text: message, url: window.location.origin + "/student/login" });
    } catch {
      /* the user closed the share sheet */
    }
  }

  return (
    <Card tone="sun" pad="lg" className={cn("flex items-center gap-4", className)}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sun-ink">Invite friends</p>
        <h3 className="mt-1 font-display text-xl font-extrabold text-navy">Share UpLOAD with your class</h3>
        <p className="mt-1 text-sm text-ink-2">Your referral code</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-2xl border-2 border-dashed border-sun-ink/40 bg-background px-4 py-2 font-display text-lg font-extrabold tracking-[0.2em] text-navy select-all">
            {code}
          </span>
          <Button size="sm" variant="dark" onClick={copy} aria-label="Copy referral code">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="outline" onClick={share}>
            <Share2 className="size-4" aria-hidden /> Share
          </Button>
        </div>
      </div>
      <GiftArt className="hidden h-24 shrink-0 sm:block" />
    </Card>
  );
}
