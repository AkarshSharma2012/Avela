import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/dal";
import { getPostAuthDestination } from "@/lib/auth/route-rules";

export default async function RootPage() {
  const profile = await getCurrentProfile();
  redirect(getPostAuthDestination(profile));
}
