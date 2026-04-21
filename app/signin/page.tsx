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
      <section className="w-full max-w-[640px] rounded-[10px] border border-line bg-surface p-10">
        <div className="mb-6">
          <h1 className="font-serif text-[26px] font-normal leading-[1.1] tracking-tight">
            Welcome back, <em className="font-light text-accent">Patrick.</em>
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            We&rsquo;ll email you a one-time sign-in link.
          </p>
        </div>

        <form action={submit} className="flex gap-2">
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
            className="inline-flex items-center gap-2 rounded-md bg-accent px-[18px] py-[11px] text-[13px] font-medium text-paper transition-colors hover:bg-[#611B11]"
          >
            <span>Send link</span>
            <span className="font-serif text-[16px] font-light opacity-85">→</span>
          </button>
        </form>
      </section>
    </div>
  );
}
