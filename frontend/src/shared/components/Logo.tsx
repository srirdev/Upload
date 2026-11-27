import { cn } from "@/shared/utils/cn";

/** UpLOAD mark: a page with an upward arrow on the signature gradient. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden focusable={false}>
      <defs>
        <linearGradient id="upload-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b1fd1" />
          <stop offset=".55" stopColor="#8b3df0" />
          <stop offset="1" stopColor="#f2690d" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#upload-mark)" />
      <path d="M13 10h10l6 6v13a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z" fill="#fff" />
      <path d="M23 10v4a2 2 0 0 0 2 2h4" fill="#ffc83d" />
      <path d="M19.5 28v-9m0 0-4 4m4-4 4 4" stroke="#6d28d9" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-display text-[1.375rem] font-extrabold tracking-tight", inverted ? "text-white" : "text-navy", className)}>
      <LogoMark />
      <span>
        Up<span className={inverted ? "text-sun" : "text-primary"}>LOAD</span>
      </span>
    </span>
  );
}
