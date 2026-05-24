import { auth, signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  ALL_METHODS,
  effectiveEnabledMethods,
  pickerOptions,
} from "@/lib/payment-methods";
import {
  updateEnabledPaymentMethods,
  saveLeaderPayment,
} from "@/lib/actions/user-settings";

export default async function SettingsPage() {
  const user = await requireUser();

  // Pull the full User row (requireUser returns a slimmed view) so we
  // have the current enabledPaymentMethods array to seed the checkbox
  // state below. Also fetch the bandleader's OWN leader Musician row so
  // the "Your payment info" section below can show their current
  // preferred method + handle (or render empty if they don't have a
  // leader row yet — the save action upserts it on first save).
  const [fullUser, leader] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { enabledPaymentMethods: true },
    }),
    db.musician.findFirst({
      where: { ownerId: user.id, isLeader: true },
      select: { paymentMethod: true, payoutAddress: true },
    }),
  ]);
  const enabled = new Set(
    effectiveEnabledMethods(fullUser?.enabledPaymentMethods),
  );
  const methodOptions = pickerOptions(fullUser?.enabledPaymentMethods);

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

      {/* Your own payment info — preferred method + handle/address.
          Lives on the bandleader's leader Musician row so it shows up on
          every gig sheet and in the band-facing email. Different from
          "Payment methods you accept" below: this is YOUR payout info;
          that section configures which methods you'll PAY others with. */}
      <div className="mb-7 rounded-[10px] border border-line bg-paper p-5">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
          Your payment info
        </div>
        <p className="mb-4 text-[12px] leading-[1.5] text-ink-soft">
          How clients pay you (and how another bandleader would pay you if
          you sub on their gig). Shows up on your gig sheets and on your
          own roster card.
        </p>
        <form action={saveLeaderPayment} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Preferred payment method
            </span>
            <select
              name="paymentMethod"
              defaultValue={leader?.paymentMethod ?? ""}
              className="input"
            >
              <option value="">—</option>
              {methodOptions.map((m) => (
                <option key={m.value} value={m.value} disabled={m.disabled}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Payment address / handle
            </span>
            <input
              name="payoutAddress"
              defaultValue={leader?.payoutAddress ?? ""}
              placeholder="Venmo: @handle · PayPal: paypal.me/you · Cash App: $cashtag"
              className="input"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-ink px-4 py-2 text-[12px] font-medium text-paper hover:bg-black"
            >
              Save your payment info
            </button>
          </div>
        </form>
      </div>

      <div className="mb-7 rounded-[10px] border border-line bg-paper p-5">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
          Payment methods you accept
        </div>
        <p className="mb-4 text-[12px] leading-[1.5] text-ink-soft">
          Pick the methods you actually pay your band with. Anything you
          uncheck here gets greyed out in every dropdown — both yours and
          your musicians&apos; when they set their own payment preferences.
          Existing data on musicians isn&apos;t changed; they just can&apos;t
          switch TO a method you don&apos;t accept.
        </p>
        <form action={updateEnabledPaymentMethods}>
          <div className="grid grid-cols-2 gap-y-2 sm:grid-cols-4">
            {ALL_METHODS.map((m) => (
              <label
                key={m.value}
                className="flex items-center gap-2 text-[13px]"
              >
                <input
                  type="checkbox"
                  name="method"
                  value={m.value}
                  defaultChecked={enabled.has(m.value)}
                  className="h-4 w-4"
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3 text-[11px] text-ink-mute">
            <button
              type="submit"
              className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-black"
            >
              Save payment methods
            </button>
            <span className="italic">
              Default (no boxes touched): everything except Zelle.
            </span>
          </div>
        </form>
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
          Control when GigWright sends SMS and email to the band — on first
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
