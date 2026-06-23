"use client";

import { useState, useTransition } from "react";
import { updateMyProfileField } from "@/lib/actions/my-profile-field";

// Status indicator that lives at the corner of an auto-saving field.
// Three states: nothing (unchanged), "saving…" (in flight), "✓" (just
// saved, fades after 1.5s), or "✗ {error}" (red, sticks until next
// edit). Keeps the indicator tiny so the form doesn't feel busy.
function FieldStatus({
  state,
  error,
}: {
  state: "idle" | "saving" | "saved";
  error: string | null;
}) {
  if (error) {
    return (
      <span className="text-[10.5px] font-medium text-accent">✗ {error}</span>
    );
  }
  if (state === "saving") {
    return (
      <span className="text-[10.5px] italic text-ink-mute">saving…</span>
    );
  }
  if (state === "saved") {
    return <span className="text-[10.5px] font-medium text-success">✓</span>;
  }
  return null;
}

// Shared field types we expose to the page. Keeping these literal-typed
// constants narrow lets TypeScript catch a typo'd field name at the
// callsite rather than at runtime in the action.
type TextField = "email" | "phone" | "payoutAddress";
type SelectField = "calendarProvider" | "paymentMethod";
type BoolField = "notifyBySms" | "notifyByEmail" | "w9Received";

// ── Text input wrapper ─────────────────────────────────────────────
// Auto-saves on blur. Tracks the last-saved value so we don't fire a
// redundant action when the user tabs through without editing.
export function AutoSavingTextInput({
  field,
  defaultValue,
  type,
  placeholder,
  className,
}: {
  field: TextField;
  defaultValue: string;
  type?: "text" | "email" | "tel";
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [saved, setSaved] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function persist() {
    if (value === saved) return;
    setError(null);
    setState("saving");
    startTransition(async () => {
      try {
        await updateMyProfileField(field, value);
        setSaved(value);
        setState("saved");
        setTimeout(() => setState("idle"), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "save failed");
        setState("idle");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={persist}
        placeholder={placeholder}
        disabled={pending}
        className={className ?? "input"}
      />
      <div className="min-h-[14px] text-right">
        <FieldStatus state={state} error={error} />
      </div>
    </div>
  );
}

// ── Select wrapper ─────────────────────────────────────────────────
// Selects auto-save on change (vs. blur on text) because the act of
// picking an option from a dropdown is itself an explicit commit.
export function AutoSavingSelect({
  field,
  defaultValue,
  options,
  className,
}: {
  field: SelectField;
  defaultValue: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function persist(next: string) {
    setValue(next);
    setError(null);
    setState("saving");
    startTransition(async () => {
      try {
        await updateMyProfileField(field, next);
        setState("saved");
        setTimeout(() => setState("idle"), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "save failed");
        setState("idle");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        onChange={(e) => persist(e.target.value)}
        disabled={pending}
        className={className ?? "input"}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="min-h-[14px] text-right">
        <FieldStatus state={state} error={error} />
      </div>
    </div>
  );
}

// ── Checkbox wrapper ───────────────────────────────────────────────
// Checkboxes also save on change. Optimistic: the box flips
// immediately, then we attempt the save in the background. If the
// save fails we snap back so the UI never lies about persisted state.
export function AutoSavingCheckbox({
  field,
  defaultChecked,
  label,
  sub,
  className,
}: {
  field: BoolField;
  defaultChecked: boolean;
  label: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !checked;
    setChecked(next); // optimistic
    setError(null);
    setState("saving");
    startTransition(async () => {
      try {
        await updateMyProfileField(field, next);
        setState("saved");
        setTimeout(() => setState("idle"), 1500);
      } catch (err) {
        setChecked(!next); // revert
        setError(err instanceof Error ? err.message : "save failed");
        setState("idle");
      }
    });
  }

  return (
    <div className={className ?? ""}>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={toggle}
          disabled={pending}
          className="mt-[3px]"
        />
        <span className="leading-snug">
          {label}
          {sub && (
            <span className="ml-1 block text-[11px] font-normal text-ink-mute">
              {sub}
            </span>
          )}
        </span>
      </label>
      <div className="ml-6 mt-0.5 min-h-[14px]">
        <FieldStatus state={state} error={error} />
      </div>
    </div>
  );
}
