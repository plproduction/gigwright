"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  generateContract,
  sendContract,
} from "@/lib/actions/contracts";
import {
  generateInvoice,
  sendInvoice,
  recordInvoicePayment,
} from "@/lib/actions/invoices";

type ContractSummary = {
  status: "DRAFT" | "SENT" | "SIGNED" | "VOID";
  contractNumber: string;
  purchaserName: string;
  purchaserEmail: string | null;
  purchaserPhone: string | null;
  feeCents: number;
  depositCents: number;
  performanceWindow: string;
  program: string;
} | null;

type InvoiceLine = { description: string; qty: string; rate: string };
type InvoiceSummary = {
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "VOID";
  invoiceNumber: string;
  totalCents: number;
  paidCents: number;
} | null;

type Props = {
  gigId: string;
  clientPortalToken: string | null;
  contract: ContractSummary;
  invoice: InvoiceSummary;
  // False when the bandleader has set neither a name nor a business name.
  // Magic-link signup never asks for a name, so this is the common state
  // for a new account — and a contract generated without it prints
  // "Your bandleader" across the masthead. Block generation, don't
  // produce an unsendable document.
  letterheadReady: boolean;

  // Prefill for the program line, derived from the applied lineup (or
  // the band size) on the server. Null when there is nothing to guess
  // from, which just leaves the field empty with its placeholder.
  suggestedProgram?: string | null;
};

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-ink-mute/10 text-ink-mute",
  SENT: "bg-warn/10 text-warn",
  SIGNED: "bg-success/10 text-success",
  PAID: "bg-success/10 text-success",
  PARTIALLY_PAID: "bg-warn/10 text-warn",
  VOID: "bg-ink-mute/10 text-ink-mute line-through",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${STATUS_STYLES[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function GigContractInvoicePanel({
  gigId,
  clientPortalToken,
  contract,
  invoice,
  letterheadReady,
  suggestedProgram,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: "", qty: "1", rate: "" }]);
  const [copied, setCopied] = useState(false);

  const portalUrl =
    clientPortalToken && typeof window !== "undefined"
      ? `${window.location.origin}/c/${clientPortalToken}`
      : null;

  function copyLink() {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const contractLocked = contract && contract.status !== "DRAFT";
  const invoiceLocked = invoice && invoice.status !== "DRAFT";

  if (!letterheadReady) {
    return (
      <div className="rounded-md border border-warn/30 bg-warn/5 p-3">
        {/* "Add your letterhead" sent people looking for a file to
            upload (Patrick, 2026-11-22: "people are not going to know
            exactly what that is... Or is this just a logo?"). It is four
            typed fields and no image at all, so the copy says so. */}
        <div className="text-[12px] font-semibold text-ink">
          Type your name and business details first
        </div>
        <p className="mt-1 text-[11px] leading-[1.5] text-ink-soft">
          Nothing to upload — no logo, no file. Four boxes in{" "}
          <a href="/settings" className="font-medium text-accent underline">
            Settings
          </a>
          : your name, business name, address and phone. They print as the
          heading on every contract and invoice, and this panel turns on for
          every gig once they&rsquo;re saved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Contract ──────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-ink">Performance agreement</span>
          {contract && <StatusBadge status={contract.status} />}
        </div>

        {contractLocked ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-mute">
            <span>
              N&deg; {contract!.contractNumber} &middot; {dollars(contract!.feeCents)} fee
            </span>
            <Link
              href={`/gigs/${gigId}/contract`}
              className="font-medium text-accent underline"
            >
              View / send
            </Link>
          </div>
        ) : (
          <form
            action={(formData) => startTransition(() => generateContract(gigId, formData))}
            className="grid grid-cols-2 gap-2"
          >
            <input
              name="purchaserName"
              defaultValue={contract?.purchaserName ?? ""}
              placeholder="Purchaser name"
              required
              className="input col-span-2"
            />
            <input
              name="purchaserEmail"
              defaultValue={contract?.purchaserEmail ?? ""}
              placeholder="Purchaser email"
              type="email"
              className="input"
            />
            <input
              name="purchaserPhone"
              defaultValue={contract?.purchaserPhone ?? ""}
              placeholder="Purchaser phone"
              className="input"
            />
            {/* What the client is buying, as a configuration. Prefilled
                from the applied lineup when there is one, so it reads
                "Six Piece" rather than six names — and editable, because
                a food-truck wedding isn't any lineup you keep. Never
                names a musician; PERSONNEL & SUBSTITUTION in the
                boilerplate covers swapping one out. */}
            <label className="col-span-2 flex flex-col gap-1">
              <input
                name="program"
                defaultValue={contract?.program ?? suggestedProgram ?? ""}
                placeholder="Six Piece · Saxophone and accompanist · Quartet"
                className="input"
              />
              <span className="text-[10.5px] leading-[1.45] text-ink-mute">
                What the client is buying. Describe the band, don&rsquo;t name
                it — &ldquo;Six Piece&rdquo; leaves you free to sub a player
                without touching a signed agreement.
              </span>
            </label>
            <input
              name="performanceWindow"
              defaultValue={contract?.performanceWindow ?? ""}
              placeholder="Performance window, e.g. 7:00–9:00 PM"
              className="input col-span-2"
            />
            <input
              name="feeDollars"
              defaultValue={contract ? dollars(contract.feeCents) : ""}
              placeholder="Total fee ($)"
              required
              className="input"
            />
            <input
              name="depositDollars"
              defaultValue={contract ? dollars(contract.depositCents) : ""}
              placeholder="Deposit ($)"
              className="input"
            />
            <button
              type="submit"
              disabled={pending}
              className="col-span-2 mt-1 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-paper disabled:opacity-50"
            >
              {contract ? "Save draft" : "Generate contract"}
            </button>
          </form>
        )}

        {contract && contract.status === "DRAFT" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href={`/gigs/${gigId}/contract`}
              className="rounded-md border border-line-strong bg-paper px-3 py-2 text-center text-[12px] font-semibold text-ink hover:border-accent hover:text-accent"
            >
              Preview
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => sendContract(gigId))}
              className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[12px] font-semibold text-accent disabled:opacity-50"
            >
              Send to client
            </button>
          </div>
        )}
      </div>

      {/* ── Invoice ───────────────────────────────────────────── */}
      <div className="border-t border-line pt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-ink">Invoice</span>
          {invoice && <StatusBadge status={invoice.status} />}
        </div>

        {invoiceLocked ? (
          <div className="space-y-2 text-[12px] text-ink-mute">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {invoice!.invoiceNumber} &middot; {dollars(invoice!.totalCents)} total &middot;{" "}
                {dollars(invoice!.paidCents)} paid
              </span>
              <Link
                href={`/gigs/${gigId}/invoice`}
                className="font-medium text-accent underline"
              >
                View / send
              </Link>
            </div>
            {invoice!.paidCents < invoice!.totalCents && (
              <form
                action={(formData) =>
                  startTransition(() =>
                    recordInvoicePayment(gigId, formData.get("amount")),
                  )
                }
                className="flex gap-2"
              >
                <input name="amount" placeholder="Amount paid ($)" className="input flex-1" />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md border border-line-strong px-3 py-1.5 text-[11px] font-medium text-ink"
                >
                  Record payment
                </button>
              </form>
            )}
          </div>
        ) : (
          <form
            action={(formData) => startTransition(() => generateInvoice(gigId, formData))}
            className="space-y-2"
          >
            <div className="space-y-1.5">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_50px_80px] gap-1.5">
                  <input
                    name="lineDescription"
                    value={line.description}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i]!, description: e.target.value };
                      setLines(next);
                    }}
                    placeholder="Description"
                    className="input"
                  />
                  <input
                    name="lineQty"
                    value={line.qty}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i]!, qty: e.target.value };
                      setLines(next);
                    }}
                    className="input text-right"
                  />
                  <input
                    name="lineRate"
                    value={line.rate}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i]!, rate: e.target.value };
                      setLines(next);
                    }}
                    placeholder="Rate $"
                    className="input text-right"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLines([...lines, { description: "", qty: "1", rate: "" }])}
              className="text-[11px] font-medium text-accent underline"
            >
              + Add line
            </button>
            <div className="grid grid-cols-2 gap-2">
              <input name="depositDueDollars" placeholder="Deposit due ($)" className="input" />
              <input name="dueDate" type="date" className="input" />
              <input name="taxDollars" placeholder="Tax ($)" className="input" />
              <input name="discountDollars" placeholder="Discount ($)" className="input" />
            </div>
            <textarea
              name="messageOnInvoice"
              placeholder="Message on invoice (optional)"
              className="input"
              rows={2}
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-paper disabled:opacity-50"
            >
              Generate invoice
            </button>
          </form>
        )}

        {invoice && invoice.status === "DRAFT" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href={`/gigs/${gigId}/invoice`}
              className="rounded-md border border-line-strong bg-paper px-3 py-2 text-center text-[12px] font-semibold text-ink hover:border-accent hover:text-accent"
            >
              Preview
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => sendInvoice(gigId))}
              className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[12px] font-semibold text-accent disabled:opacity-50"
            >
              Send to client
            </button>
          </div>
        )}
      </div>

      {/* ── Client portal link ───────────────────────────────── */}
      {clientPortalToken && (
        <div className="border-t border-line pt-4">
          <div className="text-[9px] font-medium tracking-[0.14em] text-ink-mute uppercase">
            Client portal link
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-paper-warm px-2 py-1 text-[11px] text-ink-soft">
              /c/{clientPortalToken}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 text-[11px] font-medium text-accent underline"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
