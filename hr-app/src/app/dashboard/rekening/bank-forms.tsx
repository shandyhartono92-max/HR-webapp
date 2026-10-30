"use client";

import { useActionState, useState, useTransition } from "react";
import {
  approveBankRequest,
  cancelBankRequest,
  confirmBankOtp,
  rejectBankRequest,
  resendBankOtp,
  submitBankChange,
  type BankFormState,
} from "@/app/actions/bank";
import { Field, FormMessage, inputClass } from "@/app/ui/field";
import { banks, bankCodes } from "@/lib/banks";

const buttonClass =
  "rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60";
const secondaryClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60";

// Dev builds have no email/WhatsApp sender, so the code is shown here instead
function DevOtpNotice({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <p className="rounded-md border border-dashed border-slate-400 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      Mode pengembangan: kode OTP biasanya dikirim ke email Anda. Kode: <span className="font-mono text-sm font-semibold">{code}</span>
    </p>
  );
}

export function BankChangeForm({ defaultHolderName }: { defaultHolderName: string }) {
  const [state, action, pending] = useActionState<BankFormState, FormData>(submitBankChange, undefined);
  const e = state?.errors ?? {};

  return (
    <form key={state?.attempt} action={action} className="space-y-3" autoComplete="off">
      <FormMessage message={state?.message} />
      <Field label="Bank" htmlFor="bankCode" errors={e.bankCode}>
        <select id="bankCode" name="bankCode" defaultValue={state?.values?.bankCode ?? ""} className={inputClass}>
          <option value="">Pilih bank…</option>
          {bankCodes.map((c) => (
            <option key={c} value={c}>
              {banks[c].name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nomor rekening" htmlFor="accountNumber" errors={e.accountNumber}>
        <input id="accountNumber" name="accountNumber" inputMode="numeric" autoComplete="off" required className={`${inputClass} font-mono`} />
      </Field>
      <Field label="Nama pemilik rekening" htmlFor="accountHolderName" hint="Sesuai buku tabungan. Rekening harus atas nama Anda sendiri." errors={e.accountHolderName}>
        <input
          id="accountHolderName"
          name="accountHolderName"
          required
          defaultValue={state?.values?.accountHolderName ?? defaultHolderName}
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Memeriksa rekening…" : "Lanjutkan"}
      </button>
    </form>
  );
}

export function OtpStep({ requestId, devCode }: { requestId: string; devCode?: string }) {
  const [state, action, pending] = useActionState<BankFormState, FormData>(confirmBankOtp.bind(null, requestId), undefined);
  const [resent, setResent] = useState<BankFormState>(undefined);
  const [busy, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <FormMessage message={state?.message ?? resent?.message} />
      <DevOtpNotice code={resent?.devCode ?? devCode} />
      <form key={state?.attempt} action={action} className="flex flex-wrap items-end gap-2" autoComplete="off">
        <Field label="Kode OTP (6 digit)" htmlFor="code" errors={state?.errors?.code}>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className={`${inputClass} w-40 font-mono tracking-[0.3em]`}
          />
        </Field>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Memverifikasi…" : "Konfirmasi"}
        </button>
      </form>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => startTransition(async () => setResent(await resendBankOtp(requestId)))} className={secondaryClass}>
          Kirim ulang kode
        </button>
        <CancelRequestButton requestId={requestId} />
      </div>
    </div>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const [busy, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (confirm("Batalkan permintaan perubahan rekening ini?")) startTransition(async () => void (await cancelBankRequest(requestId)));
      }}
      className={secondaryClass}
    >
      Batalkan permintaan
    </button>
  );
}

export function ReviewForms({ requestId, nameMatches }: { requestId: string; nameMatches: boolean | null }) {
  const [aState, approve, approving] = useActionState(approveBankRequest.bind(null, requestId), undefined);
  const [rState, reject, rejecting] = useActionState(rejectBankRequest.bind(null, requestId), undefined);
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const nextMonth = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={() => setMode("approve")} className={mode === "approve" ? "font-medium text-teal-800 underline" : "text-slate-600"}>
          Setujui
        </button>
        <span className="text-slate-300">|</span>
        <button type="button" onClick={() => setMode("reject")} className={mode === "reject" ? "font-medium text-red-700 underline" : "text-slate-600"}>
          Tolak
        </button>
      </div>
      {mode === "approve" ? (
        <form key={aState?.attempt} action={approve} className="space-y-3">
          <FormMessage message={aState?.message} />
          <Field label="Berlaku mulai penggajian bulan" htmlFor={`month-${requestId}`} errors={aState?.errors?.effectivePayroll}>
            <input id={`month-${requestId}`} name="effectivePayroll" type="month" defaultValue={aState?.values?.effectivePayroll ?? nextMonth} className={`${inputClass} w-48`} />
          </Field>
          {nameMatches === false && (
            <div>
              <label className="flex items-start gap-2 text-sm text-red-800">
                <input type="checkbox" name="confirmMismatch" className="mt-0.5 size-4 accent-red-700" />
                Nama di bank tidak sama dengan nama karyawan. Saya sudah memverifikasi langsung dengan karyawan (bukan lewat chat/email).
              </label>
              {aState?.errors?.confirmMismatch?.map((m) => (
                <p key={m} className="mt-1 text-xs text-red-700">
                  {m}
                </p>
              ))}
            </div>
          )}
          <button type="submit" disabled={approving} className={buttonClass}>
            {approving ? "Menyimpan…" : "Setujui perubahan"}
          </button>
        </form>
      ) : (
        <form key={rState?.attempt} action={reject} className="space-y-3">
          <FormMessage message={rState?.message} />
          <Field label="Alasan penolakan (dikirim ke karyawan)" htmlFor={`reason-${requestId}`} errors={rState?.errors?.rejectionReason}>
            <textarea id={`reason-${requestId}`} name="rejectionReason" rows={2} className={inputClass} />
          </Field>
          <button type="submit" disabled={rejecting} className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60">
            {rejecting ? "Menyimpan…" : "Tolak permintaan"}
          </button>
        </form>
      )}
    </div>
  );
}
