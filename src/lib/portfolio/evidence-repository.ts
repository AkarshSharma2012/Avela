import type { SupabaseClient } from "@supabase/supabase-js";

import type { AttachEvidenceInput } from "@/lib/portfolio/evidence";
import type { Database } from "@/types/database";
import type { ApplicationEvidenceLink, EvidenceLinkWithItem } from "@/types/portfolio";

type Client = SupabaseClient<Database>;

/** Postgres' unique_violation code — see the migration's `unique (application_plan_id, portfolio_item_id, evidence_purpose)`. */
const UNIQUE_VIOLATION = "23505";

export async function listEvidenceLinksForPlan(
  supabase: Client,
  userId: string,
  applicationPlanId: string
): Promise<EvidenceLinkWithItem[]> {
  const { data: links, error: linksError } = await supabase
    .from("application_evidence_links")
    .select("*")
    .eq("user_id", userId)
    .eq("application_plan_id", applicationPlanId)
    .order("created_at", { ascending: true });

  if (linksError) {
    console.error("[portfolio] failed to load evidence links for plan:", linksError.message);
    return [];
  }
  if (!links || links.length === 0) return [];

  const itemIds = [...new Set(links.map((link) => link.portfolio_item_id))];
  const { data: items, error: itemsError } = await supabase.from("portfolio_items").select("*").in("id", itemIds);

  if (itemsError) {
    console.error("[portfolio] failed to load evidence link items:", itemsError.message);
    return [];
  }

  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  return links
    .map((link) => {
      const item = itemById.get(link.portfolio_item_id);
      return item ? { ...link, item } : null;
    })
    .filter((entry): entry is EvidenceLinkWithItem => entry !== null);
}

export type ApplicationUsingItem = {
  applicationPlanId: string;
  opportunityTitle: string;
  purposes: ApplicationEvidenceLink["evidence_purpose"][];
};

/** "Applications using this evidence" for the item workspace page — two extra queries (plans, then opportunities) rather than an embedded join, same reasoning applications/repository.ts documents throughout. */
export async function listApplicationsUsingItem(
  supabase: Client,
  userId: string,
  portfolioItemId: string
): Promise<ApplicationUsingItem[]> {
  const { data: links, error: linksError } = await supabase
    .from("application_evidence_links")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", portfolioItemId);

  if (linksError) {
    console.error("[portfolio] failed to load applications using item:", linksError.message);
    return [];
  }
  if (!links || links.length === 0) return [];

  const planIds = [...new Set(links.map((link) => link.application_plan_id))];
  const { data: plans, error: plansError } = await supabase
    .from("application_plans")
    .select("id, opportunity_id")
    .eq("user_id", userId)
    .in("id", planIds);

  if (plansError || !plans) {
    if (plansError) console.error("[portfolio] failed to load evidence plans:", plansError.message);
    return [];
  }

  const opportunityIds = [...new Set(plans.map((plan) => plan.opportunity_id))];
  const { data: opportunities, error: opportunitiesError } = await supabase
    .from("opportunities")
    .select("id, title")
    .in("id", opportunityIds);

  if (opportunitiesError) {
    console.error("[portfolio] failed to load evidence opportunities:", opportunitiesError.message);
    return [];
  }

  const opportunityTitleById = new Map((opportunities ?? []).map((opportunity) => [opportunity.id, opportunity.title]));
  const opportunityIdByPlanId = new Map(plans.map((plan) => [plan.id, plan.opportunity_id]));

  const purposesByPlanId = new Map<string, ApplicationEvidenceLink["evidence_purpose"][]>();
  for (const link of links) {
    const existing = purposesByPlanId.get(link.application_plan_id) ?? [];
    existing.push(link.evidence_purpose);
    purposesByPlanId.set(link.application_plan_id, existing);
  }

  return [...purposesByPlanId.entries()]
    .map(([applicationPlanId, purposes]) => {
      const opportunityId = opportunityIdByPlanId.get(applicationPlanId);
      const opportunityTitle = opportunityId ? opportunityTitleById.get(opportunityId) : undefined;
      return opportunityTitle ? { applicationPlanId, opportunityTitle, purposes } : null;
    })
    .filter((entry): entry is ApplicationUsingItem => entry !== null);
}

async function findExistingEvidenceLink(
  supabase: Client,
  userId: string,
  input: AttachEvidenceInput
): Promise<ApplicationEvidenceLink | null> {
  const { data, error } = await supabase
    .from("application_evidence_links")
    .select("*")
    .eq("user_id", userId)
    .eq("application_plan_id", input.applicationPlanId)
    .eq("portfolio_item_id", input.portfolioItemId)
    .eq("evidence_purpose", input.evidencePurpose)
    .maybeSingle();

  if (error) {
    console.error("[portfolio] failed to look up evidence link:", error.message);
    return null;
  }
  return data;
}

/** Select-then-insert, with the migration's unique constraint as the race-safety backstop — same pattern createOrReuseApplicationPlan documents. Attaching the same (plan, item, purpose) twice reuses the existing link rather than erroring or duplicating it. */
export async function attachEvidenceLink(
  supabase: Client,
  userId: string,
  input: AttachEvidenceInput
): Promise<{ linkId: string | null; error: string | null }> {
  const existing = await findExistingEvidenceLink(supabase, userId, input);
  if (existing) return { linkId: existing.id, error: null };

  const { data, error } = await supabase
    .from("application_evidence_links")
    .insert({
      user_id: userId,
      application_plan_id: input.applicationPlanId,
      portfolio_item_id: input.portfolioItemId,
      evidence_purpose: input.evidencePurpose,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const raced = await findExistingEvidenceLink(supabase, userId, input);
      return raced ? { linkId: raced.id, error: null } : { linkId: null, error: error.message };
    }
    return { linkId: null, error: error.message };
  }

  return { linkId: data.id, error: null };
}

export async function removeEvidenceLink(supabase: Client, userId: string, linkId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("application_evidence_links").delete().eq("user_id", userId).eq("id", linkId);
  return { error: error?.message ?? null };
}

/** Every portfolio item id attached to at least one application — feeds the profile-strength "backing up a real application" signal. */
export async function listLinkedItemIdsForUser(supabase: Client, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("application_evidence_links").select("portfolio_item_id").eq("user_id", userId);

  if (error) {
    console.error("[portfolio] failed to load linked item ids:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.portfolio_item_id));
}

/** Evidence-link counts per application plan — feeds the dashboard's "plans missing evidence" count and the Application Center. */
export async function countEvidenceLinksByPlan(
  supabase: Client,
  userId: string,
  planIds: readonly string[]
): Promise<Map<string, number>> {
  if (planIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("application_evidence_links")
    .select("application_plan_id")
    .eq("user_id", userId)
    .in("application_plan_id", [...planIds]);

  if (error) {
    console.error("[portfolio] failed to count evidence links by plan:", error.message);
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.application_plan_id, (counts.get(row.application_plan_id) ?? 0) + 1);
  }
  return counts;
}
