import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

type SearchParams = Promise<{ callbackUrl?: string }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { callbackUrl } = await searchParams;

  async function submit(formData: FormData) {
    "use server";
    await signIn("resend", {
      email: formData.get("email"),
      redirectTo: callbackUrl || "/dashboard",
    });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col items-center justify-center px-8">
      <a
        href="/"
        className="mb-8 font-serif text-[26px] font-medium tracking-tight"
      >
        Gig<em className="font-light text-accent">Wright</em>
      </a>
      <section className="w-full max-w-[520px] rounded-[10px] border border-line bg-surface p-10">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-[26px] font-normal leading-[1.1] tracking-tight">
            Sign in or sign up
          </h1>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-soft">
            Enter your email — we&rsquo;ll send you a one-time sign-in link.
            <br />
            No password to remember.
          </p>
        </div>

        <form action={submit} className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            className="flex-1 rounded-md border border-line-strong bg-paper px-3.5 py-[11px] text-[14px] outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-[18px] py-[11px] text-[13px] font-semibold text-paper transition-colors hover:bg-[#611B11]"
          >
            <span>Send link</span>
            <span className="font-serif text-[16px] font-light opacity-85">→</span>
          </button>
        </form>

        <p className="mt-5 text-center text-[11.5px] text-ink-mute">
          New here? You&rsquo;ll pick Free or start a 14-day Pro trial after
          you verify your email. No card required to start.
        </p>
      </section>

      <p className="mt-6 text-center text-[11px] text-ink-mute">
        Musicians invited to a bandleader&rsquo;s roster — use the same email
        they invited and you&rsquo;ll land in your gig portal.
      </p>
    </div>
  );
}
