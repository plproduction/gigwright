import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-8 py-[18px]">
          <div className="font-serif text-[19px] font-medium tracking-tight">
            Gig<em className="font-light text-accent">wright</em>
          </div>
          <div className="font-serif text-[14px] font-light text-ink-soft">
            A quiet spine for working bandleaders
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col items-center justify-center gap-10 px-8 py-24 text-center">
        <h1 className="font-serif text-[56px] font-light leading-[1.05] tracking-tight">
          One gig record. <br />
          <em className="text-accent">Every</em> calendar, text, and inbox in lockstep.
        </h1>
        <p className="max-w-[520px] text-[15px] leading-[1.55] text-ink-soft">
          Edit a gig once. Call times, personnel, set lists, and pay fan out to your
          musicians&rsquo; calendars, phones, and email — automatically.
        </p>
        <Link
          href="/signin"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-[18px] py-[11px] text-[13px] font-medium text-paper transition-colors hover:bg-[#611B11]"
        >
          <span>Sign in</span>
          <span className="font-serif text-[16px] font-light opacity-85">→</span>
        </Link>
      </main>
    </div>
  );
}
