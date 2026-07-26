"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ICON_TRANSITION = "absolute size-4 transition-all duration-[var(--duration-fast)] ease-out";

function PasswordInput({ className, ...props }: ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center rounded-md px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <span className="relative inline-flex size-4 items-center justify-center">
          <Eye
            aria-hidden="true"
            className={cn(ICON_TRANSITION, visible ? "scale-75 opacity-0" : "scale-100 opacity-100")}
          />
          <EyeOff
            aria-hidden="true"
            className={cn(ICON_TRANSITION, visible ? "scale-100 opacity-100" : "scale-75 opacity-0")}
          />
        </span>
      </button>
    </div>
  );
}

export { PasswordInput };
