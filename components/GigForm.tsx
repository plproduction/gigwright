import Link from "next/link";
import { upsertGig, deleteGig, addPersonnel, removePersonnel, updatePersonnelPay } from "@/lib/actions/gigs";
import { PersonnelPayEdit } from "@/components/PersonnelPayEdit";
import { DeleteGigButton } from "@/components/DeleteGigButton";

type GigFormData = {
  id: string;
  venueId: string | null;
  startAt: Date;
  loadInAt: Date | null;
  soundcheckAt: Date | null;
  soundcheckEndAt: Date | null;
  callTimeAt: Date | null;
  endAt: Date | null;
  secondStartAt: Date | null;
  secondEndAt: Date | null;
  status: string;
  clientPayCents: number | null;
  clientDepositCents: number | null;
  sound: string | null;
  lights: string | null;
  attire: string | null;
  meal: string | null;
  notes: string | null;
  personnel: Array<{
    id: string;
    musicianId: string;
    payCents: number;
    musician: { name: string; isLeader: boolean };
  }>;
} | null;

type Venue = { id: string; name: string; city: string | null; state: string | null };
type Musician = { id: string; name: string; isLeader: boolean };

export function GigForm({
  gig,
  venues,
  musicians,
}: {
  gig: GigFormData;
  venues: Venue[];
  musicians: Musician[];
}) {
  const isEdit = gig != null;
  const upsert = upsertGig.bind(null, gig?.id ?? null);
  const del = gig ? deleteGig.bind(null, gig.id) : null;

  const dateDefault = gig ? toDateInput(gig.startAt) : "";
  const assignedIds = new Set(gig?.personnel.map((p) => p.musicianId) ?? []);
  const availableMusicians = musicians.filter((m) => !assignedIds.has(m.id));

  return (
    <>
      <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[24px] font-normal tracking-tight">
          {isEdit ? "Edit " : "New "}
          <em className="font-light text-accent">gig</em>
        </h4>
        <Link href={isEdit ? `/gigs/${gig!.id}` : "/dashboard"} className="text-[12px] text-ink-soft hover:text-ink">
          ← Cancel
        </Link>
      </div>

      <form action={upsert} className="grid max-w-[760px] grid-cols-3 gap-x-5 gap-y-4">
        {/* Top action bar — Save + Cancel right at the top so the user
            doesn't have to scroll past every field to commit changes.
            Submitting from EITHER the top button or the bottom button
            posts the entire form, since both are <button type="submit">
            inside the same <form action={upsert}> — that's standard HTML
            form behavior, no extra wiring needed. */}
        <div className="col-span-3 flex items-center justify-between border-b border-line pb-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">
            Saves all fields below
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={isEdit ? `/gigs/${gig!.id}` : "/dashboard"}
              className="rounded-md border border-line-strong bg-transparent px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-paper-warm"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-paper hover:bg-[#611B11]"
            >
              {isEdit ? "Save gig" : "Create gig"}
            </button>
          </div>
        </div>

        <Field span3 label="Venue">
          <select name="venueId" defaultValue={gig?.venueId ?? ""} className="input">
            <option value="">— Select —</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.city && ` · ${v.city}${v.state ? ", " + v.state : ""}`}
              </option>
            ))}
          </select>
        </Field>

        {/* Schedule row 1: Date, Downbeat, Finish (Downbeat & Finish paired
            visually so the start-and-end of the gig read as one unit) */}
        <Field label="Date" required>
          <input type="date" name="date" required defaultValue={dateDefault} className="input" />
        </Field>
        <Field label="Downbeat" required>
          <input type="time" name="startTime" required defaultValue={gig ? toTimeInput(gig.startAt) : ""} className="input" />
        </Field>
        <Field label="Finish time" help="when the gig ends — leave blank if open-ended">
          <input type="time" name="endTime" defaultValue={gig ? toTimeInputOpt(gig.endAt) : ""} className="input" />
        </Field>

        {/* Schedule row 1b: optional second show. Many jazz clubs run
            two sets in one night (e.g. Funky Biscuit 6 PM + 9 PM). The
            label cell in col 1 doubles as the "what is this row" hint;
            leaving both time inputs blank = single-show gig, no second
            show data is saved or rendered downstream. */}
        <div className="flex flex-col gap-1.5 self-end pb-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
            Second show
          </span>
          <span className="text-[11px] leading-[1.35] text-ink-mute">
            Optional &mdash; leave blank if just one show
          </span>
        </div>
        <Field label="Downbeat 2">
          <input type="time" name="secondStartTime" defaultValue={gig ? toTimeInputOpt(gig.secondStartAt) : ""} className="input" />
        </Field>
        <Field label="Finish 2">
          <input type="time" name="secondEndTime" defaultValue={gig ? toTimeInputOpt(gig.secondEndAt) : ""} className="input" />
        </Field>

        {/* Schedule row 2: Status, Load in, Sound check */}
        <Field label="Status">
          <select name="status" defaultValue={gig?.status ?? "CONFIRMED"} className="input">
            <option value="INQUIRY">Inquiry</option>
            <option value="HOLD">Hold</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PLAYED">Played</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </Field>
        <Field label="Load in">
          <input type="time" name="loadInTime" defaultValue={gig ? toTimeInputOpt(gig.loadInAt) : ""} className="input" />
        </Field>
        <Field
          label="Sound check"
          help="all lines run, instruments set up, ready to play at this time"
        >
          <input type="time" name="soundcheckTime" defaultValue={gig ? toTimeInputOpt(gig.soundcheckAt) : ""} className="input" />
        </Field>

        {/* Schedule row 3: Sound check complete, Call time, then on to money */}
        <Field
          label="Sound check complete"
          help="when the band is freed up between check and call"
        >
          <input type="time" name="soundcheckEndTime" defaultValue={gig ? toTimeInputOpt(gig.soundcheckEndAt) : ""} className="input" />
        </Field>
        <Field label="Call time">
          <input type="time" name="callTime" defaultValue={gig ? toTimeInputOpt(gig.callTimeAt) : ""} className="input" />
        </Field>

        <Field label="Client pays">
          <input type="text" name="clientPay" placeholder="1200" inputMode="decimal" defaultValue={centsToInput(gig?.clientPayCents)} className="input" />
        </Field>
        <Field label="Deposit received">
          <input type="text" name="clientDeposit" placeholder="600" inputMode="decimal" defaultValue={centsToInput(gig?.clientDepositCents)} className="input" />
        </Field>

        <Field label="Sound">
          <input name="sound" placeholder="House FOH" defaultValue={gig?.sound ?? ""} className="input" />
        </Field>
        <Field label="Lights">
          <input name="lights" placeholder="House" defaultValue={gig?.lights ?? ""} className="input" />
        </Field>
        <Field label="Attire">
          <input name="attire" placeholder="Black on black" defaultValue={gig?.attire ?? ""} className="input" />
        </Field>
        <Field span3 label="Meal">
          <input name="meal" placeholder="After check · green room" defaultValue={gig?.meal ?? ""} className="input" />
        </Field>

        <Field span3 label="Notes">
          <textarea name="notes" defaultValue={gig?.notes ?? ""} rows={4} className="input" />
        </Field>

        <div className="col-span-3 flex items-center gap-2 pt-4">
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-paper hover:bg-[#611B11]">
            {isEdit ? "Save gig" : "Create gig"}
          </button>
          <Link href={isEdit ? `/gigs/${gig!.id}` : "/dashboard"} className="rounded-md border border-line-strong bg-transparent px-3 py-2 text-[13px] font-medium text-ink hover:bg-paper-warm">
            Cancel
          </Link>
        </div>
      </form>

      {gig && (
        <>
          <h5 className="mb-3 mt-10 border-b border-line pb-3 font-serif text-[18px] font-normal tracking-tight">
            Personnel
          </h5>
          <div className="flex max-w-[680px] flex-col gap-2">
            {gig.personnel.length === 0 && (
              <div className="text-[13px] text-ink-mute">No one on this gig yet.</div>
            )}
            {gig.personnel.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-line bg-paper px-4 py-2.5 text-[13px]"
              >
                <div className="font-serif text-[15px]">
                  {p.musician.name}
                  {p.musician.isLeader && (
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                      Leader
                    </span>
                  )}
                </div>
                {p.musician.isLeader ? (
                  <div className="font-serif tabular-nums text-ink-mute">—</div>
                ) : (
                  <PersonnelPayEdit
                    initialCents={p.payCents}
                    action={updatePersonnelPay.bind(null, gig.id, p.id)}
                    musicianName={p.musician.name}
                  />
                )}
                {!p.musician.isLeader && (
                  <form action={removePersonnel.bind(null, gig.id, p.id)}>
                    <button
                      type="submit"
                      className="rounded border border-line-strong bg-transparent px-2 py-1 text-[11px] text-ink-soft hover:bg-surface hover:text-accent"
                    >
                      Remove
                    </button>
                  </form>
                )}
                {p.musician.isLeader && <div />}
              </div>
            ))}

            {availableMusicians.length > 0 && (
              <form
                action={addPersonnel.bind(null, gig.id)}
                className="mt-3 grid grid-cols-[1fr_100px_auto] items-end gap-3 rounded-md border border-dashed border-line-strong bg-surface px-4 py-3"
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                    Add from roster
                  </span>
                  <select name="musicianId" required className="input">
                    <option value="">— Select —</option>
                    {availableMusicians.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                    Pay ($)
                  </span>
                  <input name="pay" type="text" inputMode="decimal" placeholder="350" className="input" />
                </label>
                <button type="submit" className="rounded-md bg-ink px-3 py-2 text-[13px] font-medium text-paper hover:bg-black">
                  + Add
                </button>
              </form>
            )}
          </div>

          {/* Danger zone — delete is destructive and irreversible, so it
              lives in its own clearly-separated section at the bottom
              with a two-step confirm to prevent stray-click disasters. */}
          {del && (
            <div className="mt-12 max-w-[680px] rounded-md border border-line bg-paper-warm p-5">
              <h5 className="mb-1 font-serif text-[16px] font-normal text-ink">
                Delete this gig
              </h5>
              <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-soft">
                Permanently removes this gig, its expense rows, and the
                activity log. Personnel rows on the gig are unlinked.
                This can&rsquo;t be undone.
              </p>
              <DeleteGigButton
                action={del}
                venueLabel={
                  (gig &&
                    (venues.find((v) => v.id === gig.venueId)?.name ||
                      `this ${gig.startAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })} gig`)) ||
                  "this gig"
                }
              />
            </div>
          )}
        </>
      )}
    </>
  );
}

function Field({
  label,
  children,
  required,
  span3,
  help,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  span3?: boolean;
  help?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${span3 ? "col-span-3" : ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {children}
      {help && (
        <span className="text-[11px] leading-[1.35] text-ink">
          {help}
        </span>
      )}
    </label>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toTimeInputOpt(d: Date | null): string {
  return d ? toTimeInput(d) : "";
}

function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}
