// Single source of truth for payment-method options + per-bandleader
// availability. Every dropdown in the app (MusicianForm,
// MarkAllPaidButton chip strip, /my-profile picker, etc.) should call
// `availableMethods(user.enabledPaymentMethods)` so the bandleader's
// "I don't accept this method" choice is honored consistently.

export type PaymentMethod =
  | "VENMO"
  | "PAYPAL"
  | "ZELLE"
  | "CASHAPP"
  | "CASH"
  | "CHECK"
  | "DIRECT_DEPOSIT"
  | "OTHER";

export const ALL_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "VENMO", label: "Venmo" },
  { value: "PAYPAL", label: "PayPal" },
  { value: "ZELLE", label: "Zelle" },
  { value: "CASHAPP", label: "Cash App" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "DIRECT_DEPOSIT", label: "Direct deposit" },
  { value: "OTHER", label: "Other" },
];

// Network-wide default: every method except Zelle. Bandleaders override
// this on Settings → Payment methods. The default is "everything except
// ZELLE" rather than "everything" because the original ask was to
// disable Zelle globally — this preserves that as the out-of-the-box
// behavior while letting individual bandleaders opt back in.
const DEFAULT_ENABLED: PaymentMethod[] = [
  "VENMO",
  "PAYPAL",
  "CASHAPP",
  "CASH",
  "CHECK",
  "DIRECT_DEPOSIT",
  "OTHER",
];

// Resolve the effective enabled set for a bandleader. Empty array (the
// schema default) means "use DEFAULT_ENABLED." Non-empty is treated as
// an explicit opt-in list.
export function effectiveEnabledMethods(
  enabledFromUser: string[] | null | undefined,
): PaymentMethod[] {
  if (!enabledFromUser || enabledFromUser.length === 0) return DEFAULT_ENABLED;
  return enabledFromUser.filter((m): m is PaymentMethod =>
    ALL_METHODS.some((x) => x.value === m),
  );
}

// What to render in a payment-method picker: every method, with a
// disabled flag + an explanatory label suffix for the ones this
// bandleader doesn't accept. Existing data still shows the right label
// (a musician set up before Zelle was disabled doesn't suddenly read as
// "Other" — it still says "Zelle"), but the picker won't let anyone
// switch TO a disabled method.
export function pickerOptions(
  enabledFromUser: string[] | null | undefined,
): {
  value: PaymentMethod;
  label: string;
  disabled: boolean;
}[] {
  const enabled = new Set(effectiveEnabledMethods(enabledFromUser));
  return ALL_METHODS.map((m) => ({
    value: m.value,
    label: enabled.has(m.value)
      ? m.label
      : `${m.label} — bandleader does not accept ${m.label}`,
    disabled: !enabled.has(m.value),
  }));
}
