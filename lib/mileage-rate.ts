// IRS standard mileage deduction for 1099 contractors (musicians). Used
// across the musician tax-summary page, the per-row mileage input, and
// the year-end CSV export so all three render the same number.
//
// We use the term "GSA rate" in marketing copy for memorability but it's
// technically the IRS standard mileage rate. Source of truth: update
// once per IRS announcement (typically December for the following year).
export const STANDARD_MILEAGE_RATE_USD = 0.67;
