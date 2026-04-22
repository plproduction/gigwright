import Link from "next/link";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import { AvatarUpload } from "@/components/AvatarUpload";

// Musician's self-serve profile page. Because a single musician email can
// be in multiple bandleaders' rosters (same person, different leaders), we
// aggregate linked Musician rows — edits apply to ALL of them so the
// musician has one source of truth regardless of who booked them.
export default async function MyProfilePage() {
  const user = await requireMusician();

  const mine = await db.musician.findMany({
    where: { userId: user.id },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const primary = mine[0];
  if (!primary) {
    return (
      <div className="py-12 text-center text-[13px] text-ink-mute">
        No roster link yet.
      </div>
    );
  }

  const initials =
    primary.initials ??
    primary.name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  async function savePrefs(formData: FormData) {
    "use server";
    const data = {
      email: nullIfEmpty(formData.get("email")),
      phone: nullIfEmpty(formData.get("phone")),
      calendarProvider: (String(formData.get("calendarProvider") ?? "NONE") as
        | "ICLOUD"
        | "GOOGLE"
        | "OUTLOOK"
        | "NONE"),
      paymentMethod: nullIfEmpty(formData.get("paymentMethod")) as
        | null
        | "VENMO"
        | "PAYPAL"
        | "ZELLE"
        | "CASHAPP"
        | "CASH"
        | "CHECK"
        | "DIRECT_DEPOSIT"
        | "OTHER",
      payoutAddress: nullIfEmpty(formData.get("payoutAddress")),
      notifyBySms: formData.get("notifyBySms") === "on",
      notifyByEmail: formData.get("notifyByEmail") === "on",
      w9Received: formData.get("w9Received") === "on",
    };
    await db.musician.updateMany({
      where: { userId: user.id },
      data,
    });
  }

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          My profile
        </h4>
        <div className="text-[11px] text-ink-mute">
          Rostered by {mine.length} bandleader{mine.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Photo */}
      <div className="mb-6 rounded-[10px] border border-line bg-paper p-5">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
          Photo
        </div>
        <AvatarUpload
          musicianId={primary.id}
          musicianName={primary.name}
          initialUrl={primary.avatarUrl}
          initials={initials}
        />
      </div>

      <form action={savePrefs} className="grid max-w-[680px] grid-cols-2 gap-x-5 gap-y-4">
        <Field label="Name">
          <input disabled value={primary.name} className="input opacity-70" />
        </Field>

        <Field label="Email">
          <input
            name="email"
            type="email"
            defaultValue={primary.email ?? user.email}
            className="input"
          />
        </Field>

        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={primary.phone ?? ""} className="input" />
        </Field>

        <Field label="Calendar provider" help="Where your gigs should appear automatically.">
          <select
            name="calendarProvider"
            defaultValue={primary.calendarProvider}
            className="input"
          >
            <option value="NONE">None — SMS/email only</option>
            <option value="ICLOUD">iCloud (iPhone / Mac)</option>
            <option value="GOOGLE">Google Calendar</option>
            <option value="OUTLOOK">Outlook / Microsoft 365</option>
          </select>
        </Field>

        <Field label="Payment method">
          <select
            name="paymentMethod"
            defaultValue={primary.paymentMethod ?? ""}
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

        <Field span label="Payment address / handle" help="Zelle email/phone · Venmo @handle · PayPal.me link · Cash App $cashtag">
          <input
            name="payoutAddress"
            defaultValue={primary.payoutAddress ?? ""}
            placeholder="patrick@example.com / @patricklamb / $patrick"
            className="input"
          />
        </Field>

        <div className="col-span-2 flex flex-wrap gap-5 border-t border-line pt-4 text-[13px]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="notifyBySms"
              defaultChecked={primary.notifyBySms}
            />
            <span>Text me about changes</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="notifyByEmail"
              defaultChecked={primary.notifyByEmail}
            />
            <span>Email me about changes</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="w9Received"
              defaultChecked={primary.w9Received}
            />
            <span>My W-9 is on file with my bandleader(s)</span>
          </label>
        </div>

        <div className="col-span-2 pt-5">
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-paper hover:bg-[#611B11]"
          >
            Save
          </button>
        </div>
      </form>

      {/* Show who has me in their roster */}
      {mine.length > 1 && (
        <div className="mt-10">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
            You&rsquo;re on {mine.length} rosters
          </div>
          <ul className="space-y-1.5 text-[13px] text-ink-soft">
            {mine.map((m) => (
              <li key={m.id}>
                {m.owner?.name ?? m.owner?.email ?? "Bandleader"}
                {" · "}
                {m.roles.join(", ") || "—"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
  span,
  help,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
  help?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${span ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </span>
      {children}
      {help && <span className="text-[11px] text-ink-soft">{help}</span>}
    </label>
  );
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}
