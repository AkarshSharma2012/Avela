// Backed by public.integrity_signals / public.integrity_reviews /
// public.rate_limit_counters — see
// supabase/migrations/20260811000000_integrity_signals.sql.

import type { Database } from "@/types/database";

export type { IntegrityRiskLevel, IntegrityReviewDecision, IntegritySignalType, RateLimitBucket } from "@/types/database";

export type IntegritySignal = Database["public"]["Tables"]["integrity_signals"]["Row"];

export type IntegrityReview = Database["public"]["Tables"]["integrity_reviews"]["Row"];

export type RateLimitCounter = Database["public"]["Tables"]["rate_limit_counters"]["Row"];
