import Link from "next/link";
import { upsertMusician, deleteMusician } from "@/lib/actions/musicians";

type M = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  initials: string | null;
  roles: string[];
  isLeader: boolean;
  calendarProvider: string;
  paymentMethod: string | null;
  notifyBySms: boolean;
  notifyByEmail: boolean;
  notes: string | null;
} | null;

export function MusicianForm({ musician }: { musician: M }) {
  const isEdit = musician != null;
  const upsert = upsertMusician.bind(null, musician?.id ?? null);
  const del = musician ? deleteMusician.bind(null, musician.id) : null;

  return (
    <>
      <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[24px] font-normal tracking-tight">
          {isEdit ? "Edit " : "New "}
          <em className="font-light text-accent">
            {isEdit ? musician!.name : "musician"}
          </em>
        </h4>
        <Link href="/roster" className="text-[12px] text-ink-soft hover:text-ink">
          ← Back to roster
        </Link>
      </div>

      <form action={upsert} className="grid max-w-[680px] grid-cols-2 gap-x-5 gap-y-4">
        <Field label="Name" required span>
          <input
            name="name"
            required
            defaultValue={musician?.name ?? ""}
            className="input"
          />
        </Field>

        <Field label="Initials (override)">
          <input
            name="initials"
            maxLength={3}
            defaultValue={musician?.initials ?? ""}
            placeholder="Auto"
            className="input"
          />
        </Field>

        <Field label="Roles (comma-separated)">
          <input
            name="roles"
            defaultValue={musician?.roles.join(", ") ?? ""}
            placeholder="Drums, Percussion"
            className="input"
          />
        </Field>

        <Field label="Email">
          <input
            name="email"
            type="email"
            defaultValue={musician?.email ?? ""}
            className="input"
          />
        </Field>

        <Field label="Phone">
          <input
            name="phone"
            type="tel"
            defaultValue={musician?.phone ?? ""}
            className="input"
          />
        </Field>

        <Field label="Calendar provider">
          <select
            name="calendarProvider"
            defaultValue={musician?.calendarProvider ?? "NONE"}
            className="input"
          >
            <option value="NONE">None</option>
            <option value="ICLOUD">iCloud</option>
            <option value="GOOGLE">Google</option>
            <option value="OUTLOOK">Outlook</option>
          </select>
        </Field>

        <Field label="Preferred payment">
          <select
            name="paymentMethod"
            defaultValue={musician?.paymentMethod ?? ""}
            className="input"
          >
            <option value="">—</option>
            <option value="VENMO">Venmo</option>
            <option value="PAYPAL">PayPal</option>
            <option value="ZELLE">Zelle</option>
            <option value="CASHAPP">Cash App</option>
            <option value="CASH">Cash</option>
            <option value="CHECK">Check</option>
            <option value="DIRECT_DEPOSIT">Direct deposit</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>

        <Field span label="Notes">
          <textarea
            name="notes"
            defaultValue={musician?.notes ?? ""}
            rows={3}
            className="input"
          />
        </Field>

        <div className="col-span-2 flex flex-wrap gap-5 border-t border-line pt-4 text-[13px]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isLeader"
              defaultChecked={musician?.isLeader ?? false}
            />
            <span>Leader (you)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="notifyBySms"
              defaultChecked={musician?.notifyBySms ?? true}
            />
            <span>Notify by SMS</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="notifyByEmail"
              defaultChecked={musician?.notifyByEmail ?? true}
            />
            <span>Notify by email</span>
          </label>
        </div>

        <div className="col-span-2 flex items-center gap-2 pt-5">
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-paper hover:bg-[#611B11]"
          >
            {isEdit ? "Save" : "Add to roster"}
          </button>
          <Link
            href="/roster"
            className="rounded-md border border-line-strong bg-transparent px-3 py-2 text-[13px] font-medium text-ink hover:bg-paper-warm"
          >
            Cancel
          </Link>
          {del && (
            <form action={del} className="ml-auto">
              <button
                type="submit"
                className="rounded-md border border-line-strong bg-transparent px-3 py-2 text-[13px] font-medium text-accent hover:bg-accent-soft"
              >
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
