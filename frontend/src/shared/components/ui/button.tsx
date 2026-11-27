import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils/cn";

const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold",
    "transition-[transform,background-color,box-shadow,color] duration-150 ease-out active:scale-[0.97]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /** The one primary action on a screen. */
        default: "bg-primary text-white shadow-glow hover:bg-primary-strong",
        /** Energetic secondary call to action (navy text keeps 5.8:1 on orange). */
        accent: "bg-orange text-navy hover:brightness-105 shadow-[0_10px_24px_-10px_rgb(242_105_13/0.7)]",
        success: "bg-mint text-navy hover:brightness-105 shadow-[0_10px_24px_-10px_rgb(20_184_110/0.7)]",
        dark: "bg-navy text-white hover:bg-midnight",
        soft: "bg-primary-soft text-primary hover:bg-[#e2d5ff]",
        outline: "border border-border bg-background text-navy hover:border-primary/40 hover:bg-surface",
        ghost: "text-navy hover:bg-surface",
        danger: "bg-danger text-white hover:brightness-95",
        "danger-soft": "bg-danger-soft text-danger hover:brightness-[0.98]",
        /** On gradient / dark heroes. */
        white: "bg-white text-primary shadow-soft hover:bg-white/90",
        glass: "glass-dark text-white ring-1 ring-white/25 hover:bg-white/20",
      },
      size: {
        default: "h-12 rounded-2xl px-5 text-sm",
        sm: "h-9 rounded-xl px-3 text-sm",
        lg: "h-14 rounded-2xl px-6 text-base",
        icon: "size-11 rounded-2xl",
        "icon-sm": "size-9 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
