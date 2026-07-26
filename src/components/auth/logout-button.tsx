import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="outline" size="sm">
        Log out
      </Button>
    </form>
  );
}

export { LogoutButton };
