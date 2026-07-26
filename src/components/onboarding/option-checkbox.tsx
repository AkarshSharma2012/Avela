"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

function OptionCheckbox({
  id,
  checked,
  onCheckedChange,
  label,
  className,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3.5 py-2.5 text-sm text-foreground transition-colors",
        "hover:bg-muted",
        "has-data-[checked]:border-primary has-data-[checked]:bg-[color-mix(in_oklch,var(--primary),transparent_92%)]",
        className
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <span>{label}</span>
    </label>
  );
}

export { OptionCheckbox };
