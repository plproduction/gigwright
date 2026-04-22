import { auth, signOut } from "@/auth";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser();

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <>
      <h4 className="mb-5 border-b border-line pb-3 font-serif text-[20px] font-normal tracking-tight">
        Settings
      </h4>

      <div className="mb-7 rounded-[10px] border border-line bg-paper p-5">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
          Your account
        </div>
        <div className="font-serif text-[18px]">{user.name ?? user.email}</div>
        <div className="mt-1 text-[12px] text-ink-soft">{user.email}</div>
        <div className="mt-1 text-[11px] text-ink-mute">
          Plan:{" "}
          <span className="font-semibold text-ink">
            {user.plan === "ADMIN" ? "Admin" : user.plan === "PRO" ? "Pro" : "Free"}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/settings/billing"
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-[#611B11]"
          >
            Billing
          </a>
          <a
            href="/settings/integrations"
            className="rounded-md border border-line-strong bg-transparent px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-paper-warm"
          >
            Integrations
          </a>
          <form action={doSignOut}>
            <button
              type="submit"
              className="rounded-md border border-line-strong bg-transparent px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-paper-warm"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <h5 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
        Coming soon
      </h5>
      <ul className="space-y-3 text-[13px] leading-[1.5] text-ink-soft">
        <ComingItem title="Calendar sync">
          Connect your own iCloud (CalDAV) or Google calendar so your gigs
          appear there alongside everything else.
        </ComingItem>
        <ComingItem title="Notification rules">
          Control when Gigwright sends SMS and email to the band — on first
          booking, on every edit, morning-of, all toggleable.
        </ComingItem>
        <ComingItem title="Gig sheet template">
          Customize the one-page PDF that gets texted or emailed on gig day.
        </ComingItem>
        <ComingItem title="Fan calendar feed">
          Public iCal URL for fans to subscribe to your public shows.
        </ComingItem>
      </ul>
    </>
  );
}

function ComingItem({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-md border border-line bg-surface p-3.5">
      <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <div>
        <div className="font-serif text-[15px] text-ink">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </li>
  );
}
