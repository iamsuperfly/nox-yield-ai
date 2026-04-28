import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-emerald-glow/30 bg-emerald-glow/10 text-emerald-glow",
        secondary: "border-zinc-800 bg-zinc-900 text-zinc-300",
        outline: "border-zinc-800 text-zinc-300",
        warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        info: "border-sky-500/30 bg-sky-500/10 text-sky-300",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
