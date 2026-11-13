"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Mail, KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { requestOtpAction, verifyOtpAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const urlError = searchParams.get("error");

  const [step, setStep] = React.useState<"email" | "otp">("email");
  const [email, setEmail] = React.useState(initialEmail);
  const [otp, setOtp] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(
    urlError || null
  );
  const [isError, setIsError] = React.useState(Boolean(urlError));

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setStatusMessage(null);
    setIsError(false);

    try {
      const res = await requestOtpAction(email);
      setStatusMessage(res.message);
      setIsError(!res.success);
      if (res.success) {
        setStep("otp");
      }
    } catch {
      setIsError(true);
      setStatusMessage("Unable to process your request. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setStatusMessage(null);
    setIsError(false);

    try {
      const res = await verifyOtpAction(email, otp);
      setStatusMessage(res.message);
      setIsError(!res.success);
      if (res.success) {
        router.push("/");
        router.refresh();
      }
    } catch {
      setIsError(true);
      setStatusMessage("Verification failed. Please check your 6-digit code.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">WHAT-WHERE</h1>
          <p className="text-xs text-muted-foreground">
            Invite-only workspace • 6-digit Email OTP
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          role="alert"
          className={`mb-4 rounded-md border px-3 py-2.5 text-sm ${
            isError
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {statusMessage}
        </div>
      )}

      {step === "email" ? (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-medium text-muted-foreground"
            >
              Workspace Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending code...
              </>
            ) : (
              "Continue with Email OTP"
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="otp"
              className="text-xs font-medium text-muted-foreground"
            >
              6-Digit Code sent to <span className="font-semibold">{email}</span>
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                autoComplete="one-time-code"
                placeholder="123456"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="pl-9 font-mono tracking-[0.35em]"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || otp.length !== 6}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Enter Workspace"
            )}
          </Button>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setStatusMessage(null);
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Change email
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={(e) => void handleRequestOtp(e)}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 p-4">
      <Suspense
        fallback={
          <div className="h-64 w-full max-w-md animate-pulse rounded-xl border border-border bg-card" />
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
