import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        success:
          "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
        danger:
          "border-rose-500/30 bg-rose-500/15 text-rose-300",
        warning:
          "border-amber-500/30 bg-amber-500/15 text-amber-300",
        info:
          "border-blue-500/30 bg-blue-500/15 text-blue-300",
      },
      size: {
        default: "px-2 py-0.5 text-xs",
        sm: "px-1.5 py-0 text-[10px]",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

// Status badge for tickets
const statusStyles: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  open: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  in_progress: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  pending_customer: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  closed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

function StatusBadge({ status, className, ...props }: { status: string } & React.ComponentProps<"span">) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        statusStyles[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        className
      )}
      {...props}
    >
      {label}
    </span>
  );
}

// Priority badge for tickets
const priorityStyles: Record<string, string> = {
  low: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  medium: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  urgent: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

function PriorityBadge({ priority, className, ...props }: { priority: string } & React.ComponentProps<"span">) {
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        priorityStyles[priority] || 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        className
      )}
      {...props}
    >
      {label}
    </span>
  );
}

export { Badge, badgeVariants, StatusBadge, PriorityBadge }
