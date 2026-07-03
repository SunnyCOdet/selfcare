import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-md border border-input bg-white/[0.055] px-3.5 py-3 text-base outline-none transition-[border-color,box-shadow,background] placeholder:text-muted-foreground/60 focus-visible:border-accent/60 focus-visible:bg-white/[0.075] focus-visible:ring-[3px] focus-visible:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
