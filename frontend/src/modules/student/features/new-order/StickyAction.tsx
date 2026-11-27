import type { ReactNode } from "react";

/** Primary wizard action: pinned to the bottom of the screen on phones (thumb reach), inline on wider screens. */
export function StickyAction({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/70 bg-canvas/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      {note && <div className="mb-2 text-center text-xs text-muted">{note}</div>}
      {children}
    </div>
  );
}
