// Shared constants for the referral system. Kept out of
// lib/actions/referrals.ts because that file has "use server" and
// Next.js rejects ANY non-async export from a server-actions module —
// exporting `const X = "foo"` there silently breaks every function
// export in the same file. This file has no "use server" directive,
// so plain constants export fine and can be imported from both
// server actions and server components alike.

// Number of active paid referrals required to comp a subscription.
export const REFERRALS_REQUIRED = 3;

// Cookie name that carries the referral code from the landing page
// (?ref=CODE handled by proxy.ts) to the eventual signup flow
// (attributeSignup called from lib/session.ts).
export const REFERRAL_COOKIE = "gw_ref";

// 30 days — long enough to convert most warm intent, short enough
// that a stale code doesn't attribute a wholly unrelated signup
// six months later.
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
