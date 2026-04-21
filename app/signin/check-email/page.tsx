export default function CheckEmailPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col items-center justify-center px-8 text-center">
      <section className="w-full max-w-[520px] rounded-[10px] border border-line bg-surface p-12">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">
          Check your inbox
        </div>
        <h1 className="font-serif text-[30px] font-normal leading-[1.1] tracking-tight">
          A sign-in link <em className="font-light text-accent">is on its way.</em>
        </h1>
        <p className="mt-4 text-[14px] leading-[1.55] text-ink-soft">
          Click the link in the email to finish signing in. You can close this tab.
        </p>
      </section>
    </div>
  );
}
