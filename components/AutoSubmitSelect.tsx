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
