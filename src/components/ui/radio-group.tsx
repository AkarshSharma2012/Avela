import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";

import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-wrap gap-2", className)}
      {...props}
    />
  );
}

/** A single choice in a `RadioGroup`, styled as a selectable pill/button. */
function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioPrimitive.Root>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-all duration-[var(--duration-fast)] ease-out select-none",
        "hover:-translate-y-px hover:bg-muted hover:shadow-sm active:translate-y-0 active:scale-[0.98]",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        "data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground data-[checked]:shadow-sm data-[checked]:hover:bg-primary-hover",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { RadioGroup, RadioGroupItem };
