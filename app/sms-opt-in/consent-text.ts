// The exact consent text shown on /sms-opt-in and stored verbatim with
// every opt-in record. Pulled out of actions.ts because Next.js's
// "use server" modules can only export async functions, not constants.
//
// Both the form page and the server action import from here, so the
// wording shown to the user, recorded in the DB, and quoted in /sms-consent
// stay in lockstep.
export const CONSENT_TEXT =
  "I agree to receive operational SMS from GigWright on behalf of the bandleader who hired me. Messages contain gig coordination details (venue, call time, downbeat, address, attire, set-list updates, morning-of reminders, and changes to any of the above). Message frequency varies — typically 0–10 messages per gig and 1–20 per month. Message and data rates may apply. Reply HELP for help, STOP to opt out. See gigwright.com/privacy and gigwright.com/terms for full terms.";
