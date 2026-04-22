"use client";

import { useState, useTransition } from "react";
import { savePayout } from "@/lib/actions/gigs";

// One unified line-item worksheet modeled on the Iridium Payout spreadsheet.
// Contractors and freeform expenses live in the same ordered table. Each row
// has a label, an amount, and an optional "date paid". Total Vendor Cost rolls
// up at the bottom, Payment from Client is entered beneath, and Your Total =
// client payment − vendor cost is shown (parens for negative).

type PersonnelIn = {
  id: string;
  musicianId: string;
  musicianName: string;
  isLeader: boolean;
  roleLabel?: string | null;
  paymentMethod?: string | null;
  payCents: number;
  paidAt: Date | null;
};

type ExpenseIn = {
  id: string;
  label: string;
  amountCents: number;
  paidAt: Date | null;
  position: number;
};

type Row = {
  kind: "personnel" | "expense";
  id?: string;           // existing DB id if imported
  musicianId?: string;   // set for personnel
  isLeader?: boolean;
  label: string;
  amountField: string;   // free-text money input
  paidDate: string;      // YYYY-MM-DD or ""
  hint?: string;         // role / payment method display
};

export function PayoutWorksheet({
  gigId,
  gigTitle,
  initialClientPayCents,
  personnel,
  expenses,
}: {
  gigId: string;
  gigTitle?: string;
  initialClientPayCents: number | null;
  initialClientDepositCents?: number | null;
  personnel: PersonnelIn[];
  expenses: ExpenseIn[];
}) {
  const initialRows: Row[] = [
    ...personnel
      .filter((p) => !p.isLeader) // leader isn't a vendor
      .map((p) => ({
        kind: "personnel" as const,
        id: p.id,
        musicianId: p.musicianId,
        isLeader: p.isLeader,
        label: p.musicianName + (p.roleLabel ? ` — ${p.roleLabel}` : ""),
        amountField: centsToField(p.payCents),
        paidDate: dateToField(p.paidAt),
        hint: p.paymentMethod ? paymentLabel(p.paymentMethod) : undefined,
      })),
    ...expenses.map((e) => ({
      kind: "expense" as const,
      id: e.id,
      label: e.label,
      amountField: centsToField(e.amountCents),
      paidDate: dateToField(e.paidAt),
    })),
  ];

  // Always show at least one empty row to invite input.
  const [rows, setRows] = useState<Row[]>(
    initialRows.length > 0
      ? initialRows
      : [{ kind: "expense", label: "", amountField: "", paidDate: "" }],
  );
  const [clientPay, setClientPay] = useState(centsToField(initialClientPayCents));
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const vendorTotalCents = rows.reduce(
    (s, r) => s + fieldToCents(r.amountField),
    0,
  );
  const clientPayCents = fieldToCents(clientPay);
  const netCents = (clientPayCents ?? 0) - vendorTotalCents;

  function addRow() {
    setRows((r) => [
      ...r,
      { kind: "expense", label: "", amountField: "", paidDate: "" },
    ]);
  }

  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function save() {
    startTransition(async () => {
      const personnelPayload = rows
        .filter((r) => r.kind === "personnel")
        .map((r) => ({
          id: r.id!,
          payCents: fieldToCents(r.amountField),
          paidAt: fieldToDate(r.paidDate),
        }));

      const deletedPersonnelIds = personnel
        .filter((p) => !p.isLeader)
        .filter((p) => !rows.some((r) => r.kind === "personnel" && r.id === p.id))
        .map((p) => p.id);

      const expensePayload = rows
        .filter((r) => r.kind === "expense")
        .map((r, i) => ({
          id: r.id,
          label: r.label.trim() || "Line item",
          amountCents: fieldToCents(r.amountField),
          paidAt: fieldToDate(r.paidDate),
          position: i,
        }));

      await savePayout(gigId, {
        clientPayCents,
        clientDepositCents: null,
        personnel: personnelPayload,
        deletedPersonnelIds,
        expenses: expensePayload,
      });
      setSavedAt(new Date());
    });
  }

  return (
    <section
      id="payout"
      className="overflow-hidden rounded-[10px] border border-line bg-surface shadow-sm"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-line bg-paper-warm px-6 py-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
            Contractor
          </div>
          <h3 className="mt-0.5 font-serif text-[22px] font-normal leading-tight tracking-tight">
            {gigTitle ?? "Payout worksheet"}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-[11px] text-ink-mute">
              Saved{" "}
              {savedAt.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
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
      </header>

      {/* Line items table */}
      <div>
        {/* Column headings */}
        <div className="grid grid-cols-[1fr_140px_140px_36px] items-center gap-3 border-b border-line bg-paper/60 px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
          <div>Line item</div>
          <div className="text-right">Total cost</div>
          <div>Date paid</div>
          <div></div>
        </div>

        {rows.length === 0 && (
          <div className="px-6 py-10 text-center text-[13px] text-ink-mute">
            No line items yet. Add your first vendor or expense below.
          </div>
        )}

        {rows.map((row, idx) => (
          <div
            key={row.id ?? `new-${idx}`}
            className="group grid grid-cols-[1fr_140px_140px_36px] items-center gap-3 border-b border-line px-6 py-2.5 hover:bg-paper/40"
          >
            {/* Label */}
            <div>
              {row.kind === "personnel" ? (
                <div className="flex items-center gap-2">
                  <span className="font-serif text-[15px] text-ink">
                    {row.label}
                  </span>
                  {row.hint && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mute">
                      · {row.hint}
                    </span>
                  )}
                </div>
              ) : (
                <input
                  value={row.label}
                  onChange={(e) => updateRow(idx, { label: e.target.value })}
                  placeholder="e.g. Hotel, Flights, Facebook ads…"
                  className="w-full bg-transparent font-serif text-[15px] text-ink placeholder-ink-mute focus:outline-none"
                />
              )}
            </div>

            {/* Amount */}
            <MoneyInput
              value={row.amountField}
              onChange={(v) => updateRow(idx, { amountField: v })}
            />

            {/* Date paid */}
            <input
              type="date"
              value={row.paidDate}
              onChange={(e) => updateRow(idx, { paidDate: e.target.value })}
              className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12px] text-ink-soft outline-none focus:border-accent"
            />

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeRow(idx)}
              aria-label="Remove line"
              title="Remove"
              className="flex h-7 w-7 items-center justify-center rounded text-[16px] text-ink-mute opacity-0 transition-opacity hover:bg-accent-soft hover:text-accent group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}

        {/* + Add line */}
        <div className="border-b border-line px-6 py-3">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            <span className="text-[14px]">＋</span>
            <span>Add line item</span>
          </button>
        </div>

        {/* Totals */}
        <div className="px-6 py-4">
          {/* Total Vendor Cost — highlighted */}
          <div className="grid grid-cols-[1fr_140px_140px_36px] items-center gap-3 border-y border-accent/20 bg-[#FFF9D9] px-0 py-2.5">
            <div className="pl-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink">
              Total vendor cost
            </div>
            <div className="text-right font-serif text-[16px] font-medium tabular-nums text-ink">
              {fmt(vendorTotalCents)}
            </div>
            <div />
            <div />
          </div>

          {/* Payment from client */}
          <div className="grid grid-cols-[1fr_140px_140px_36px] items-center gap-3 border-b border-line py-2.5">
            <div className="text-[13px] text-ink">Payment from client</div>
            <MoneyInput value={clientPay} onChange={setClientPay} />
            <div />
            <div />
          </div>

          {/* Your total */}
          <div className="grid grid-cols-[1fr_140px_140px_36px] items-center gap-3 border-t-2 border-ink pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Your total
            </div>
            <div
              className={`text-right font-serif text-[24px] font-light tabular-nums ${
                netCents < 0 ? "text-accent" : "text-accent"
              }`}
            >
              {fmtAccounting(netCents)}
            </div>
            <div />
            <div />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── subcomponents ────────────────────────────────────────────

function MoneyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-mute">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-md border border-line bg-paper py-1.5 pl-5 pr-2 text-right font-serif text-[14px] tabular-nums text-ink outline-none focus:border-accent"
      />
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

function fieldToDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToField(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt(cents: number): string {
  const abs = Math.abs(cents) / 100;
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${s}`;
}

// Accounting-style formatting: negatives in parens, like the spreadsheet
function fmtAccounting(cents: number): string {
  const base = fmt(cents);
  return cents < 0 ? `(${base})` : base;
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
