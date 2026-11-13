"use client";

import * as React from "react";
import {
  Fingerprint,
  KeyRound,
  Lock,
  Shield,
  ShieldCheck,
  Smartphone,
  Loader2,
} from "lucide-react";
import { useVault } from "@/components/editor/VaultProvider";
import type { SecurityAuditLog } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";

interface SecuritySettingsViewProps {
  isAdmin: boolean;
  auditLogs: SecurityAuditLog[];
}

export function SecuritySettingsView({
  isAdmin,
  auditLogs,
}: SecuritySettingsViewProps) {
  const {
    isConfigured,
    isUnlocked,
    setupVaultPassphrase,
    unlockVault,
    lockVaultSession,
  } = useVault();

  const [passphrase, setPassphrase] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [eventFilter, setEventFilter] = React.useState("ALL");

  const filteredLogs = React.useMemo(() => {
    if (eventFilter === "ALL") return auditLogs;
    return auditLogs.filter((log) => log.event_type === eventFilter);
  }, [auditLogs, eventFilter]);

  const distinctEvents = React.useMemo(
    () => Array.from(new Set(auditLogs.map((l) => l.event_type))).sort(),
    [auditLogs]
  );

  async function handleVaultAction(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setBusy(true);
    try {
      if (!isConfigured) {
        if (passphrase.length < 10) {
          setFeedback({
            type: "error",
            text: "Passphrase must be at least 10 characters.",
          });
          return;
        }
        if (passphrase !== confirm) {
          setFeedback({
            type: "error",
            text: "Passphrases do not match.",
          });
          return;
        }
        await setupVaultPassphrase(passphrase);
        setFeedback({
          type: "success",
          text: "Master Vault key derived and configured in your profile.",
        });
      } else {
        const ok = await unlockVault(passphrase, "settings/security");
        if (!ok) {
          setFeedback({
            type: "error",
            text: "Incorrect Vault passphrase.",
          });
          return;
        }
        setFeedback({
          type: "success",
          text: "Vault session unlocked in memory (15-min inactivity timeout).",
        });
      }
      setPassphrase("");
      setConfirm("");
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Vault operation failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Zero-Knowledge Vault Section */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Lock className="h-5 w-5 text-amber-600" />
            <div>
              <h2 className="text-base font-semibold">
                Selective Zero-Knowledge Vault
              </h2>
              <p className="text-xs text-muted-foreground">
                PBKDF2 (600,000 iterations, SHA-256) + per-page AES-256-GCM DEK
                wrapping.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={isConfigured ? "success" : "warning"}>
              {isConfigured ? "Configured" : "Not Configured"}
            </Badge>
            {isConfigured && (
              <Badge variant={isUnlocked ? "success" : "secondary"}>
                {isUnlocked ? "Unlocked" : "Locked"}
              </Badge>
            )}
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              feedback.type === "error"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {feedback.text}
          </div>
        )}

        {isUnlocked ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm">
            <span>
              Master Vault Key is active in tab memory. Automatically locks
              after 15 minutes of inactivity.
            </span>
            <Button variant="outline" size="sm" onClick={lockVaultSession}>
              <Lock className="h-3.5 w-3.5" />
              Lock Now
            </Button>
          </div>
        ) : (
          <form onSubmit={handleVaultAction} className="max-w-md space-y-3">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                required
                placeholder={
                  isConfigured
                    ? "Enter Vault passphrase to unlock"
                    : "Create Master Vault passphrase (min 10 chars)"
                }
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="pl-9"
              />
            </div>
            {!isConfigured && (
              <Input
                type="password"
                required
                placeholder="Confirm Master Vault passphrase"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isConfigured ? (
                "Unlock Vault Session"
              ) : (
                "Initialize Master Vault"
              )}
            </Button>
          </form>
        )}
      </section>

      {/* Phase 2 Future Security Uplift Blueprint */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-base font-semibold">
                Phase 2 Security Uplift Slots (MFA & Passkeys)
              </h2>
              <p className="text-xs text-muted-foreground">
                Architected for non-breaking drop-in enforcement on top of
                invite-only OTP.
              </p>
            </div>
          </div>
          <Badge variant="outline">Blueprint Ready</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-secondary/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Smartphone className="h-4 w-4" />
              TOTP Multi-Factor Authentication (`aal2`)
            </div>
            <p className="text-xs text-muted-foreground">
              Ready for `supabase.auth.mfa.enroll(&#123; factorType: &quot;totp&quot; &#125;)`
              and RLS `aal2` enforcement on admin mutations and Vault pages.
            </p>
          </div>

          <div className="rounded-md border border-border bg-secondary/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Fingerprint className="h-4 w-4" />
              WebAuthn Passkeys (`prf` Extension)
            </div>
            <p className="text-xs text-muted-foreground">
              Hardware biometric unlock deriving a deterministic 32-byte HKDF
              secret into Web Crypto for zero-prompt Vault decryption.
            </p>
          </div>
        </div>
      </section>

      {/* Admin-Only Security Audit Logs */}
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Security Audit Logs</h2>
          </div>

          {isAdmin && (
            <select
              aria-label="Filter audit events"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="ALL">All Events ({auditLogs.length})</option>
              {distinctEvents.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          )}
        </div>

        {!isAdmin ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            Audit logs are restricted to workspace administrators via
            PostgreSQL RLS (`public.is_admin_user()`).
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col justify-between gap-2 px-5 py-3 text-xs sm:flex-row sm:items-center"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        log.event_type.includes("UNAUTHORIZED") ||
                        log.event_type.includes("FAILED") ||
                        log.event_type.includes("REVOKED") ||
                        log.event_type.includes("RATE_LIMIT")
                          ? "destructive"
                          : "secondary"
                      }
                      className="font-mono text-[10px]"
                    >
                      {log.event_type}
                    </Badge>
                    <span className="font-medium">
                      {log.actor_email || "anonymous"}
                    </span>
                    {log.target_resource && (
                      <span className="truncate text-muted-foreground">
                        → {log.target_resource}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
                  {log.ip_address && (
                    <span className="font-mono text-[11px]">
                      {log.ip_address}
                    </span>
                  )}
                  <span>{formatRelativeDate(log.created_at)}</span>
                </div>
              </div>
            ))}

            {filteredLogs.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground">
                No security audit events recorded yet.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
