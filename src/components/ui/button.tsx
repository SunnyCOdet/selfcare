import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_18px_42px_-30px_rgba(247,248,242,0.85)] hover:bg-primary/90",
        ai: "bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-accent-foreground shadow-[0_18px_48px_-32px_rgba(200,255,61,0.9)] hover:brightness-105",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:border-white/20 hover:bg-surface-3",
        ghost: "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        outline:
          "border border-border bg-transparent text-foreground hover:border-accent/45 hover:bg-accent/10",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { Button, buttonVariants };
