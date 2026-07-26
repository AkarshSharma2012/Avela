import { cn } from "@/lib/utils";

function FieldError({
  id,
  errors,
  className,
}: {
  id?: string;
  errors?: string[];
  className?: string;
}) {
  if (!errors || errors.length === 0) return null;

  return (
    <p
      id={id}
      role="alert"
      className={cn(
        "animate-in fade-in slide-in-from-top-0.5 text-sm text-destructive duration-[var(--duration-fast)]",
        className
      )}
    >
      {errors[0]}
    </p>
  );
}

export { FieldError };
