import { cache } from "react";

import { getApplicationPlans, type ApplicationPlanBundle } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";

/**
 * Both the authenticated layout's sidebar snapshot and the dashboard page
 * need this same per-user data within the same request. Wrapped in React's
 * `cache()` — like `getCurrentProfile` in auth/dal.ts — so whichever one
 * runs first pays for the query and the other reads the memoized result,
 * never a second round trip.
 */
export const getCachedApplicationPlans = cache(async (userId: string): Promise<ApplicationPlanBundle[]> => {
  const supabase = await createClient();
  return getApplicationPlans(supabase, userId);
});
