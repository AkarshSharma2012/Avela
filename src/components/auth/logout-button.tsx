import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

function LogoutButton() {
  return (
    <form action={logout}>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="relative before:absolute before:-inset-2 before:content-['']"
      >
        Log out
      </Button>
    </form>
  );
}

export { LogoutButton };
