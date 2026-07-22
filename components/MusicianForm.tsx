import Link from "next/link";
import { upsertMusician, deleteMusician } from "@/lib/actions/musicians";
import { AvatarUpload } from "@/components/AvatarUpload";
import { InviteMusicianButton } from "@/components/InviteMusicianButton";
import { RequestW9Button } from "@/components/RequestW9Button";
import { pickerOptions } from "@/lib/payment-methods";

type M = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  initials: string | null;
  avatarUrl: string | null;
  roles: string[];
  isLeader: boolean;
  calendarProvider: string;
  paymentMethod: string | null;
  payoutAddress: string | null;
  notifyBySms: boolean;
  notifyByEmail: boolean;
  notes: string | null;
  w9Received: boolean;
  w9ReceivedAt: Date | null;
  w9RequestedAt: Date | null;
  invitedAt: Date | null;
} | null;

export function MusicianForm({
  musician,
  enabledPaymentMethods,
}: {
  musician: M;
  // Payment methods the bandleader actually offers. Empty array falls
  // back to "all except Zelle" inside pickerOptions().
  enabledPaymentMethods: string[];
}) {
  const isEdit = musician != null;
  const upsert = upsertMusician.bind(null, musician?.id ?? null);
  const del = musician ? deleteMusician.bind(null, musician.id) : null;
  const methodOptions = pickerOptions(enabledPaymentMethods);

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

      {isEdit && (
        <div className="mb-5 grid grid-cols-2 gap-5">
          <div className="rounded-[10px] border border-line bg-paper p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
              Photo
            </div>
            <AvatarUpload
              musicianId={musician!.id}
              musicianName={musician!.name}
              initialUrl={musician!.avatarUrl}
              initials={
                musician!.initials ??
                musician!.name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              }
            />
          </div>
          <div id="invite" className="rounded-[10px] border border-line bg-paper p-4 scroll-mt-20">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
              Login invite
            </div>
            <p className="mb-3 text-[12px] leading-[1.45] text-ink-soft">
              Send them a one-time login so they can see their own gig sheet
              (read-only), upload a photo, pick a calendar to sync, and set
              their own text/email prefs.
            </p>
            <InviteMusicianButton
              musicianId={musician!.id}
              hasEmail={!!musician!.email}
              invitedAt={musician!.invitedAt}
            />
          </div>
        </div>
      )}

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

        <Field
          label="Preferred payment"
          help="Bandleaders pick which methods they accept on Settings → Payment methods. Disabled options are ones you don't currently use."
        >
          <select
            name="paymentMethod"
            defaultValue={musician?.paymentMethod ?? ""}
            className="input"
          >
            <option value="">—</option>
            {methodOptions.map((m) => (
              <option key={m.value} value={m.value} disabled={m.disabled}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field span label="Payment address / handle">
          <input
            name="payoutAddress"
            defaultValue={musician?.payoutAddress ?? ""}
            placeholder="Venmo: @handle · PayPal: paypal.me link · Cash App: $cashtag"
            className="input"
          />
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
          {/* SMS opt-in — default OFF per TCR/CTIA rule (consent for SMS
              may not be a required condition of service). Bandleader can
              flip this on ONLY if the musician has verbally agreed to
              receive operational SMS. The tooltip + helper-line make the
              consent attestation explicit so checking the box means
              something. Musicians can also opt themselves in via
              /my-profile, which is the cleaner consent path. */}
          <label
            className="flex items-start gap-2"
            title="Only check if this musician has verbally agreed to receive gig SMS"
          >
            <input
              type="checkbox"
              name="notifyBySms"
              defaultChecked={musician?.notifyBySms ?? false}
              className="mt-[3px]"
            />
            <span className="leading-snug">
              SMS opt-in
              <span className="ml-1 text-[11px] font-normal text-ink-mute">
                · only check if they verbally agreed
              </span>
            </span>
          </label>
          {/* Email is the mandatory gig-coordination channel — no
              opt-out. Rendered as a static note instead of a checkbox so
              it can't be turned off. Text (above) stays optional. */}
          <span className="flex items-center gap-2 text-ink-mute">
            <span className="text-[15px] leading-none text-accent">✓</span>
            <span>Gig-update emails always on</span>
          </span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="w9Received"
              defaultChecked={musician?.w9Received ?? false}
            />
            <span>
              W-9 on file
              {musician?.w9ReceivedAt && (
                <span className="ml-1.5 text-[11px] text-ink-mute">
                  (
                  {musician.w9ReceivedAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  )
                </span>
              )}
            </span>
          </label>
          {/* Send W-9 request — appears only when this musician needs one
              (not a leader, doesn't have one on file). Lives here on the
              edit page instead of on every roster row so the list view
              stays uncluttered. */}
          {isEdit && musician && !musician.isLeader && !musician.w9Received && (
            <div className="col-span-2 mt-1 flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper-warm/60 px-3 py-2 text-[12px] text-ink-soft">
              <span>Need their W-9?</span>
              <RequestW9Button
                musicianId={musician.id}
                hasEmail={!!musician.email}
                requestedAt={musician.w9RequestedAt}
              />
              {musician.w9RequestedAt && (
                <span className="text-[11px] italic text-ink-mute">
                  Last sent{" "}
                  {musician.w9RequestedAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          )}
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
            // HTML doesn't allow nested <form> elements. Wrapping this in
            // its own <form action={del}> looked right but the browser
            // silently stripped the inner form, so every Delete click was
            // submitting the OUTER (upsert) form — i.e. clicking Delete
            // was actually firing Save. `formAction` on the button itself
            // overrides the outer form's action for this single submit,
            // which is exactly the HTML5 escape hatch for this case.
            <button
              type="submit"
              formAction={del}
              className="ml-auto rounded-md border border-line-strong bg-transparent px-3 py-2 text-[13px] font-medium text-accent hover:bg-accent-soft"
            >
              Delete
            </button>
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
  help,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  span?: boolean;
  help?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${span ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {children}
      {help && (
        <span className="text-[11px] leading-[1.4] text-ink-mute">{help}</span>
      )}
    </label>
  );
}
