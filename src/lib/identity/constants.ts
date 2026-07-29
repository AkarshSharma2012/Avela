/** Spec section 9: "Rate-limit server-side: ... connected-account attempts ... proof-of-control challenges." */
export const MAX_POSSESSION_CHALLENGES_PER_WINDOW = 5;
export const POSSESSION_CHALLENGE_RATE_WINDOW_SECONDS = 60 * 60; // 1 hour

export const OAUTH_STATE_TTL_SECONDS = 60 * 10; // 10 minutes — just long enough for the GitHub redirect round trip.
