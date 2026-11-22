"use client";

import { useActionState } from "react";
import { SignaturePad } from "@/components/contracts/SignaturePad";

type SignFormProps = {
  action: (formData: FormData) => Promise<void>;
  defaultEmail?: string | null;
};

type FormState = { error: string | null };

export function SignForm({ action, defaultEmail }: SignFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      try {
        await action(formData);
        return { error: null };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Couldn't sign — try again." };
      }
    },
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="font-sans text-[9px] tracking-[0.18em] text-contract-soft uppercase">
          Type your full name
        </label>
        <input
          type="text"
          name="signerName"
          required
          className="mt-1 w-full border-b border-contract-ink bg-transparent pb-1 font-contract-serif text-[17px] text-contract-ink outline-none"
          placeholder="Your name"
        />
      </div>
      <div>
        <label className="font-sans text-[9px] tracking-[0.18em] text-contract-soft uppercase">
          Email (optional, for your copy)
        </label>
        <input
          type="email"
          name="signerEmail"
          defaultValue={defaultEmail ?? ""}
          className="mt-1 w-full border-b border-contract-rule bg-transparent pb-1 font-sans text-[13px] text-contract-ink outline-none"
          placeholder="you@example.com"
        />
      </div>
      <SignaturePad fieldName="signatureDataUrl" />
      {state.error && (
        <p className="font-sans text-[12px] text-red-700">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-contract-gold px-5 py-3 font-sans text-[11px] font-semibold tracking-[0.12em] text-white uppercase disabled:opacity-50"
      >
        {pending ? "Signing…" : "Sign & Accept"}
      </button>
    </form>
  );
}
