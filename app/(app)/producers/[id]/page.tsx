import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

type Params = { id: string };

// Producer edit / detail page. Shows the producer's card + every gig
// they've booked. Straight server-actions form — same shape as the
// venue edit page.
export default async function ProducerEditPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const producer = await db.producer.findFirst({
    where: { id, ownerId: user.id },
    include: {
      gigs: {
        orderBy: { startAt: "desc" },
        take: 20,
        include: { venue: { select: { name: true } } },
      },
    },
  });
  if (!producer) notFound();

  async function save(formData: FormData) {
    "use server";
    const u = await requireUser();
    const owned = await db.producer.findFirst({
      where: { id, ownerId: u.id },
      select: { id: true },
    });
    if (!owned) throw new Error("Not found");
    await db.producer.update({
      where: { id },
      data: {
        name: String(formData.get("name") ?? "").trim(),
        email: (String(formData.get("email") ?? "").trim() || null) as
          | string
          | null,
        phone: (String(formData.get("phone") ?? "").trim() || null) as
          | string
          | null,
        company: (String(formData.get("company") ?? "").trim() || null) as
          | string
          | null,
        notes: (String(formData.get("notes") ?? "").trim() || null) as
          | string
          | null,
      },
    });
    revalidatePath("/producers");
    revalidatePath(`/producers/${id}`);
  }

  async function remove() {
    "use server";
    const u = await requireUser();
    const owned = await db.producer.findFirst({
      where: { id, ownerId: u.id },
      select: { id: true },
    });
    if (!owned) throw new Error("Not found");
    // Cascade behavior: gigs keep the producerId pointing here; the
    // schema uses ON DELETE SET NULL so the gigs stay intact and lose
    // the producer link on delete.
    await db.producer.delete({ where: { id } });
    revalidatePath("/producers");
    redirect("/producers");
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 border-b border-line pb-3">
        <Link
          href="/producers"
          className="text-[12px] text-ink-mute hover:text-accent"
        >
          ← Producers
        </Link>
        <h4 className="font-serif text-[20px] font-normal tracking-tight">
          {producer.name}
        </h4>
      </div>

      <form action={save} className="mb-10 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <input
              name="name"
              defaultValue={producer.name}
              required
              className={inputStyles}
            />
          </Field>
          <Field label="Company / organization">
            <input
              name="company"
              defaultValue={producer.company ?? ""}
              className={inputStyles}
            />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              defaultValue={producer.email ?? ""}
              className={inputStyles}
            />
          </Field>
          <Field label="Phone">
            <input
              name="phone"
              type="tel"
              defaultValue={producer.phone ?? ""}
              className={inputStyles}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            name="notes"
            defaultValue={producer.notes ?? ""}
            rows={3}
            className={`${inputStyles} min-h-[80px] resize-y font-serif leading-[1.55]`}
          />
        </Field>
        <div className="flex items-center justify-between border-t border-line pt-4">
          <button
            formAction={remove}
            type="submit"
            className="text-[12px] text-ink-mute hover:text-accent"
          >
            Delete producer
          </button>
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-paper hover:bg-black"
          >
            Save
          </button>
        </div>
      </form>

      <section>
        <h5 className="mb-3 font-serif text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
          Gigs booked ({producer.gigs.length})
        </h5>
        {producer.gigs.length === 0 ? (
          <div className="text-[13px] text-ink-mute">
            No gigs linked to this producer yet.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {producer.gigs.map((g) => (
              <Link
                key={g.id}
                href={`/gigs/${g.id}`}
                className="grid grid-cols-[120px_1fr_80px] items-center gap-3 py-3 hover:bg-paper-warm"
              >
                <div className="font-serif tabular-nums text-[13px] text-ink">
                  {g.startAt.toLocaleDateString()}
                </div>
                <div className="text-[13px] text-ink-soft">
                  {g.venue?.name ?? "—"}
                </div>
                <div className="text-right text-[12px] text-accent">
                  Open →
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const inputStyles =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </div>
      {children}
    </label>
  );
}
