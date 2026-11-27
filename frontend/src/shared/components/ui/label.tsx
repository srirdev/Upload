import type * as React from "react";
import { cn } from "@/shared/utils/cn";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-semibold text-ink-2", className)} {...props} />;
}
