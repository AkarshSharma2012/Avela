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
    <p id={id} role="alert" className={cn("text-sm text-destructive", className)}>
      {errors[0]}
    </p>
  );
}

export { FieldError };
