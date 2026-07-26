import { Spinner } from "@/components/ui/spinner";

/** Full-route loading fallback, shared by every route's loading.tsx. */
function RouteLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6">
      <span className="animate-fade-up font-heading text-lg font-semibold text-foreground">
        Avela
      </span>
      <Spinner className="h-4 w-14 animate-fade-up text-primary" label={label} />
    </div>
  );
}

export { RouteLoading };
