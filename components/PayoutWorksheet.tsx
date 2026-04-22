"use client";

import { useState, useTransition } from "react";
import { savePayout } from "@/lib/actions/gigs";

type Personnel = {
  id: string;
  musicianName: string;
  isLeader: boolean;
  roleLabel?: string | null;
  paymentMethod?: string | null;
  payCents: number;
};

type Expense = {
  id?: string;
  label: string;
  amountCents: number;
  position: number;
};

export function PayoutWorksheet({
  gigId,
  initialClientPayCents,
  initialClientDepositCents,
  personnel,
  expenses,
}: {
  gigId: string;
  initialClientPayCents: number | null;
  initialClientDepositCents: number | null;
  personnel: Personnel[];
  expenses: Expense[];
}) {
  const [clientPay, setClientPay] = useState(
    centsToField(initialClientPayCents),
  );
  const [clientDeposit, setClientDeposit] = useState(
    centsToField(initialClientDepositCents),
  );
  const [peopleRows, setPeopleRows] = useState(() =>
    personnel.map((p) => ({ ...p, payField: centsToField(p.payCents) })),
  );
  const [expenseRows, setExpenseRows] = useState<
    Array<Expense & { amountField: string }>
  >(() =>
    expenses.map((e, i) => ({
      ...e,
      position: e.position ?? i,
      amountField: centsToField(e.amountCents),
    })),
  );
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const clientPayCents = fieldToCents(clientPay);
  const clientDepositCents = fieldToCents(clientDeposit);
  const personnelTotal = peopleRows.reduce(
    (s, p) => s + fieldToCents(p.payField),
    0,
  );
  const expenseTotal = expenseRows.reduce(
    (s, e) => s + fieldToCents(e.amountField),
    0,
  );
  const vendorTotal = personnelTotal + expenseTotal;
  const net = (clientPayCents ?? 0) - vendorTotal;
  const outstanding =
    (clientPayCents ?? 0) - (clientDepositCents ?? 0);

  function addExpense() {
    setExpenseRows((rows) => [
      ...rows,
      {
        label: "",
        amountCents: 0,
        amountField: "",
        position: rows.length,
      },
    ]);
  }

  function removeExpense(idx: number) {
    setExpenseRows((rows) => rows.filter((_, i) => i !== idx));
  }

  function save() {
    startTransition(async () => {
      await savePayout(gigId, {
        clientPayCents,
        clientDepositCents,
        personnel: peopleRows.map((p) => ({
          id: p.id,
          payCents: fieldToCents(p.payField) ?? 0,
        })),
        expenses: expenseRows
          .filter((e) => e.label.trim() !== "" || fieldToCents(e.amountField))
          .map((e, i) => ({
            id: e.id,
            label: e.label.trim() || "Untitled",
            amountCents: fieldToCents(e.amountField) ?? 0,
            position: i,
          })),
      });
      setSavedAt(new Date());
    });
  }

  return (
    <div className="rounded-[10px] border border-line bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line bg-paper-warm px-6 py-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
            Payout worksheet
          </div>
          <div className="mt-0.5 font-serif text-[16px] text-ink-soft">
            Live totals · every line rolls up to your net
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-[11px] text-ink-mute">
              Saved {savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-[12px] font-semibold text-paper transition-colors hover:bg-[#611B11] disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {/* Income */}
        <Section title="Income" emphasis={net}>
          <WorkRow
            label="Client pays"
            rightField={
              <MoneyInput
                value={clientPay}
                onChange={setClientPay}
                placeholder="0"
              />
            }
            tone="income"
          />
          <WorkRow
            label="Deposit received"
            sub={
              outstanding > 0 && (clientDepositCents ?? 0) > 0
                ? `${fmt(outstanding)} outstanding`
                : undefined
            }
            rightField={
              <MoneyInput
                value={clientDeposit}
                onChange={setClientDeposit}
                placeholder="0"
              />
            }
            tone="income"
            muted
          />
        </Section>

        {/* Personnel */}
        <Section title={`Band · ${peopleRows.length}`} total={personnelTotal}>
          {peopleRows.length === 0 ? (
            <div className="py-3 text-[12px] text-ink-mute">
              No personnel on this gig.
            </div>
          ) : (
            peopleRows.map((p, idx) => (
              <WorkRow
                key={p.id}
                label={p.musicianName}
                sub={[
                  p.isLeader ? "Leader" : null,
                  p.roleLabel,
                  p.paymentMethod && !p.isLeader
                    ? paymentLabel(p.paymentMethod)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                leader={p.isLeader}
                rightField={
                  p.isLeader ? (
                    <span className="font-serif text-[14px] text-ink-mute">—</span>
                  ) : (
                    <MoneyInput
                      value={p.payField}
                      onChange={(v) => {
                        setPeopleRows((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, payField: v } : r,
                          ),
                        );
                      }}
                    />
                  )
                }
                tone="cost"
              />
            ))
          )}
        </Section>

        {/* Expenses */}
        <Section title={`Expenses · ${expenseRows.length}`} total={expenseTotal}>
          {expenseRows.map((e, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_130px_28px] items-center gap-3 border-b border-line px-0 py-2 last:border-b-0"
            >
              <input
                value={e.label}
                onChange={(ev) => {
                  const v = ev.target.value;
                  setExpenseRows((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, label: v } : r)),
                  );
                }}
                placeholder="e.g. Flights · Hotel · Ad spend"
                className="bg-transparent font-serif text-[15px] text-ink placeholder-ink-mute focus:outline-none"
              />
              <MoneyInput
                value={e.amountField}
                onChange={(v) => {
                  setExpenseRows((rows) =>
                    rows.map((r, i) =>
                      i === idx ? { ...r, amountField: v } : r,
                    ),
                  );
                }}
                align="right"
              />
              <button
                type="button"
                onClick={() => removeExpense(idx)}
                className="rounded text-[13px] text-ink-mute hover:text-accent"
                aria-label="Remove expense"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addExpense}
            className="mt-2 rounded-md border border-dashed border-line-strong bg-paper px-3 py-2 text-[12px] font-medium text-ink-soft hover:border-accent hover:text-accent"
          >
            + Add expense
          </button>
        </Section>

        {/* Totals */}
        <div className="mt-5 border-t-2 border-ink pt-4">
          <TotalRow label="Gross income" value={clientPayCents ?? 0} />
          <TotalRow label="Total vendor cost" value={-vendorTotal} neg />
          <TotalRow label="Your net" value={net} emphasize />
        </div>
      </div>
    </div>
  );
}

// ── subcomponents ────────────────────────────────────────────

function Section({
  title,
  total,
  emphasis,
  children,
}: {
  title: string;
  total?: number;
  emphasis?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-baseline justify-between border-b border-line pb-1.5">
        <h5 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
          {title}
        </h5>
        {total != null && (
          <span className="font-serif text-[13px] tabular-nums text-ink-soft">
            {fmt(total)}
          </span>
        )}
        {emphasis != null && total == null && (
          <span className="text-[11px] text-ink-mute">
            Net rolls up below
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function WorkRow({
  label,
  sub,
  rightField,
  leader,
  tone,
  muted,
}: {
  label: string;
  sub?: string | false;
  rightField: React.ReactNode;
  leader?: boolean;
  tone?: "income" | "cost";
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_130px] items-center gap-3 border-b border-line py-2 last:border-b-0">
      <div className={muted ? "opacity-80" : ""}>
        <div
          className={`font-serif text-[15px] ${leader ? "text-accent" : "text-ink"}`}
        >
          {label}
        </div>
        {sub && (
          <div className="mt-0.5 text-[11px] text-ink-mute">{sub}</div>
        )}
      </div>
      <div className={tone === "income" ? "text-accent" : ""}>{rightField}</div>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  placeholder,
  align = "right",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  align?: "left" | "right";
}) {
  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[13px] text-ink-mute ${
          align === "right" ? "left-2.5" : "left-2.5"
        }`}
      >
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "0"}
        className={`w-full rounded-md border border-line bg-paper py-1.5 pl-5 pr-2 font-serif text-[14px] tabular-nums text-ink outline-none focus:border-accent ${
          align === "right" ? "text-right" : "text-left"
        }`}
      />
    </div>
  );
}

function TotalRow({
  label,
  value,
  emphasize,
  neg,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  neg?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-1.5 ${
        emphasize ? "border-t border-line mt-1 pt-3" : ""
      }`}
    >
      <span
        className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
          emphasize ? "text-accent" : "text-ink-mute"
        }`}
      >
        {label}
      </span>
      <span
        className={`font-serif tabular-nums ${
          emphasize
            ? "text-[28px] font-light tracking-tight text-accent"
            : neg
              ? "text-[14px] text-ink-soft"
              : "text-[14px] text-ink"
        }`}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────

function fieldToCents(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[$,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centsToField(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "";
  const dollars = cents / 100;
  if (dollars % 1 === 0) return dollars.toString();
  return dollars.toFixed(2);
}

function fmt(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return neg ? `−$${formatted}` : `$${formatted}`;
}

function paymentLabel(m: string): string {
  const map: Record<string, string> = {
    VENMO: "Venmo",
    PAYPAL: "PayPal",
    ZELLE: "Zelle",
    CASHAPP: "Cash App",
    CASH: "Cash",
    CHECK: "Check",
    DIRECT_DEPOSIT: "Direct deposit",
    OTHER: "Other",
  };
  return map[m] ?? m;
}
