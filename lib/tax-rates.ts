// Federal reimbursement rates used when quick-adding tax-aware expense
// rows to a payout worksheet. These are intentionally lightweight — the
// saved `amountCents` is the source of truth; these constants just power
// the "quick add" helper math.

// IRS standard business mileage rate. 2026 = 70¢/mile (source: IRS).
// If the IRS posts a new rate, update here.
export const IRS_MILEAGE_RATE_USD = 0.7;

// CONUS standard per-diem (the lowest rate; most non-high-cost US cities)
// under GSA. Meals & incidentals portion for 2026 = $68/day, lodging = $110.
// The combined M&IE + lodging is usually not what you want for a working
// musician — you want the M&IE allowance so you can claim the federal M&IE
// without tracking individual meals. We default to $68 and let the user
// override.
export const GSA_PER_DIEM_USD = 68;

// Convert miles to cents at the IRS rate.
export function milesToCents(miles: number): number {
  return Math.round(miles * IRS_MILEAGE_RATE_USD * 100);
}

// Convert days to cents at the GSA per-diem.
export function daysToCents(days: number): number {
  return Math.round(days * GSA_PER_DIEM_USD * 100);
}
