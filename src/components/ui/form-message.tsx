import { cn } from "@/lib/utils";

function FormMessage({
  variant = "error",
  className,
  children,
}: {
  variant?: "error" | "success";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        variant === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-success/30 bg-success/10 text-success",
        className
      )}
    >
      {children}
    </div>
  );
}

export { FormMessage };
