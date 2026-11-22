"use client";

type Option = { value: string; label: string };

// A select that commits on choice. Picking the name IS the decision —
// making you then reach for an adjacent "Add" button is a second
// action for the same intent, and on a page where you're adding eight
// players to four call lists that adds up.
//
// Submits the enclosing form via requestSubmit() so the server action
// and progressive enhancement both behave exactly as they would with a
// real submit button.
export function AutoSubmitSelect({
  name,
  options,
  placeholder,
  className,
}: {
  name: string;
  options: Option[];
  placeholder: string;
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue=""
      className={className}
      onChange={(e) => {
        if (!e.target.value) return;
        e.currentTarget.form?.requestSubmit();
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// A money field that commits when you leave it. Deliberately NOT on
// every keystroke — "350" passes through "3" and "35" on the way, and
// each of those would be a save. `change` fires on blur and on Enter,
// which is exactly when you've finished typing a number.
//
// Blank is meaningful here: it clears the override so the role's own
// default rate applies again.
export function AutoSubmitMoney({
  name,
  defaultValue,
  placeholder,
  className,
  ariaLabel,
}: {
  name: string;
  defaultValue: string;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <input
      name={name}
      inputMode="decimal"
      defaultValue={defaultValue}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => {
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

// Same idea for the small numeric fields: commit on change rather than
// making you find a button. Blur-and-Enter both land because `change`
// fires on either.
export function AutoSubmitNumber({
  name,
  defaultValue,
  className,
  ariaLabel,
}: {
  name: string;
  defaultValue: number | string;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <input
      name={name}
      type="number"
      min={1}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => {
        if (e.target.value === "") return;
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
