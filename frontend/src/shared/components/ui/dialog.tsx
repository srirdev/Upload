import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky action row at the bottom (primary action last). */
  footer?: ReactNode;
  className?: string;
}

function Close({ dark }: { dark?: boolean }) {
  return (
    <RD.Close
      aria-label="Close"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
        dark ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-muted hover:bg-surface hover:text-navy",
      )}
    >
      <X className="size-5" />
    </RD.Close>
  );
}

function Head({ title, description, dark }: { title: ReactNode; description?: ReactNode; dark?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <RD.Title className={cn("font-display text-xl font-bold", dark ? "text-white" : "text-navy")}>{title}</RD.Title>
        {description ? (
          <RD.Description className={cn("mt-1 text-sm", dark ? "text-white/60" : "text-muted")}>{description}</RD.Description>
        ) : (
          <RD.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RD.Description>
        )}
      </div>
      <Close dark={dark} />
    </div>
  );
}

const overlay = (
  <RD.Overlay asChild forceMount>
    <motion.div
      className="fixed inset-0 z-50 bg-navy/45 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    />
  </RD.Overlay>
);

/** Centred dialog on desktop; slides up as a bottom sheet on small screens. */
export function Modal({ open, onOpenChange, title, description, children, footer, className }: BaseProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            {overlay}
            <RD.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className={cn(
                  "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-4xl bg-background shadow-lift",
                  "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-4xl",
                  className,
                )}
              >
                <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border sm:hidden" aria-hidden />
                <div className="px-6 pb-2 pt-4 sm:pt-6"><Head title={title} description={description} /></div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
                {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}

/** Side drawer (detail panels on desktop; full width on phones). */
export function Drawer({
  open, onOpenChange, title, description, children, footer, className, side = "right", dark,
}: BaseProps & { side?: "right" | "left"; dark?: boolean }) {
  const from = side === "right" ? "100%" : "-100%";
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            {overlay}
            <RD.Content asChild forceMount>
              <motion.div
                initial={{ x: from }}
                animate={{ x: 0 }}
                exit={{ x: from }}
                transition={{ type: "spring", stiffness: 380, damping: 40 }}
                className={cn(
                  "fixed inset-y-0 z-50 flex w-full flex-col shadow-lift sm:w-[min(34rem,92vw)]",
                  dark ? "bg-midnight text-white" : "bg-background",
                  side === "right" ? "right-0 sm:rounded-l-4xl" : "left-0 sm:rounded-r-4xl",
                  className,
                )}
              >
                <div className={cn("border-b px-6 py-5", dark ? "border-white/10" : "border-border")}><Head title={title} description={description} dark={dark} /></div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
                {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}
