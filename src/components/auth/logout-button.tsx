import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className={cn("relative before:absolute before:-inset-2 before:content-['']", className)}
      >
        Log out
      </Button>
    </form>
  );
}

export { LogoutButton };
