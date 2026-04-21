import Link from "next/link";
import { upsertVenue, deleteVenue } from "@/lib/actions/venues";

type V = {
  id: string;
  name: string;
  addressL1: string | null;
  addressL2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  timezone: string;
} | null;

export function VenueForm({ venue }: { venue: V }) {
  const isEdit = venue != null;
  const upsert = upsertVenue.bind(null, venue?.id ?? null);
  const del = venue ? deleteVenue.bind(null, venue.id) : null;

  return (
    <>
      <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[24px] font-normal tracking-tight">
          {isEdit ? "Edit " : "New "}
          <em className="font-light text-accent">
            {isEdit ? venue!.name : "venue"}
          </em>
        </h4>
        <Link href="/venues" className="text-[12px] text-ink-soft hover:text-ink">
          ← Back to venues
        </Link>
      </div>

      <form action={upsert} className="grid max-w-[680px] grid-cols-2 gap-x-5 gap-y-4">
        <Field label="Name" required span>
          <input name="name" required defaultValue={venue?.name ?? ""} className="input" />
        </Field>
        <Field label="Address line 1" span>
          <input name="addressL1" defaultValue={venue?.addressL1 ?? ""} className="input" />
        </Field>
        <Field label="Address line 2" span>
          <input name="addressL2" defaultValue={venue?.addressL2 ?? ""} className="input" />
        </Field>
        <Field label="City">
          <input name="city" defaultValue={venue?.city ?? ""} className="input" />
        </Field>
        <Field label="State">
          <input name="state" defaultValue={venue?.state ?? ""} maxLength={3} className="input" />
        </Field>
        <Field label="Postal code">
          <input name="postalCode" defaultValue={venue?.postalCode ?? ""} className="input" />
        </Field>
        <Field label="Country">
          <input name="country" defaultValue={venue?.country ?? "US"} maxLength={3} className="input" />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={venue?.phone ?? ""} className="input" />
        </Field>
        <Field label="Timezone">
          <select name="timezone" defaultValue={venue?.timezone ?? "America/New_York"} className="input">
            <option value="America/New_York">America/New_York</option>
            <option value="America/Chicago">America/Chicago</option>
            <option value="America/Denver">America/Denver</option>
            <option value="America/Phoenix">America/Phoenix</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="America/Anchorage">America/Anchorage</option>
            <option value="Pacific/Honolulu">Pacific/Honolulu</option>
          </select>
        </Field>
        <Field label="Contact name">
          <input name="contactName" defaultValue={venue?.contactName ?? ""} className="input" />
        </Field>
        <Field label="Contact email">
          <input name="contactEmail" type="email" defaultValue={venue?.contactEmail ?? ""} className="input" />
        </Field>
        <Field label="Notes" span>
          <textarea name="notes" defaultValue={venue?.notes ?? ""} rows={3} className="input" />
        </Field>

        <div className="col-span-2 flex items-center gap-2 pt-5">
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-paper hover:bg-[#611B11]">
            {isEdit ? "Save" : "Add venue"}
          </button>
          <Link href="/venues" className="rounded-md border border-line-strong bg-transparent px-3 py-2 text-[13px] font-medium text-ink hover:bg-paper-warm">
            Cancel
          </Link>
          {del && (
            <form action={del} className="ml-auto">
              <button type="submit" className="rounded-md border border-line-strong bg-transparent px-3 py-2 text-[13px] font-medium text-accent hover:bg-accent-soft">
                Delete
              </button>
            </form>
          )}
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  children,
  required,
  span,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  span?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${span ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {children}
    </label>
  );
}
