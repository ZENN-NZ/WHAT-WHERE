"use client";

import * as React from "react";
import { KeyRound, Lock, ShieldCheck, Loader2 } from "lucide-react";
import {
  decryptVaultPayload,
  unwrapDek,
  type VaultDocumentPayload,
} from "@/lib/crypto/vault";
import { useVault } from "@/components/editor/VaultProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VaultLockGuardProps {
  documentId: string;
  encryptedPayload: string | null;
  encryptionIv: string | null;
  wrappedDek: string | null;
  children: (unlocked: {
    payload: VaultDocumentPayload;
    dek: CryptoKey;
  }) => React.ReactNode;
}

export function VaultLockGuard({
  documentId,
  encryptedPayload,
  encryptionIv,
  wrappedDek,
  children,
}: VaultLockGuardProps) {
  const { isConfigured, isUnlocked, kek, setupVaultPassphrase, unlockVault } =
    useVault();

  const [passphrase, setPassphrase] = React.useState("");
  const [confirmPassphrase, setConfirmPassphrase] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [decrypted, setDecrypted] = React.useState<{
    payload: VaultDocumentPayload;
    dek: CryptoKey;
  } | null>(null);

  React.useEffect(() => {
    if (!isUnlocked || !kek) {
      setDecrypted(null);
      return;
    }

    let cancelled = false;

    async function decrypt() {
      if (!encryptedPayload || !encryptionIv || !wrappedDek || !kek) {
        return;
      }
      try {
        const dek = await unwrapDek(wrappedDek, kek);
        const payload = await decryptVaultPayload(
          encryptedPayload,
          encryptionIv,
          dek
        );
        if (!cancelled) {
          setDecrypted({ payload, dek });
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError(
            "Unable to decrypt this Vault page with the current passphrase."
          );
        }
      }
    }

    void decrypt();
    return () => {
      cancelled = true;
    };
  }, [isUnlocked, kek, encryptedPayload, encryptionIv, wrappedDek]);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase.length < 10) {
      setError("Vault passphrase must be at least 10 characters.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      await setupVaultPassphrase(passphrase);
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initialize Vault."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ok = await unlockVault(passphrase, documentId);
      if (!ok) {
        setError("Incorrect Vault passphrase.");
      } else {
        setPassphrase("");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isConfigured) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">
              Configure Zero-Knowledge Vault
            </h2>
            <p className="text-xs text-muted-foreground">
              PBKDF2 (600,000 iterations) + AES-256-GCM in your browser.
            </p>
          </div>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Your Vault passphrase never leaves your device. Lost passphrases
          cannot be recovered by admins or the server.
        </p>

        {error && (
          <div className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSetup} className="space-y-3">
          <Input
            type="password"
            required
            minLength={10}
            placeholder="Master Vault passphrase (min 10 chars)"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <Input
            type="password"
            required
            minLength={10}
            placeholder="Confirm passphrase"
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Set Master Vault Passphrase"
            )}
          </Button>
        </form>
      </div>
    );
  }

  if (!isUnlocked || !decrypted) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Vault Page Locked</h2>
            <p className="text-xs text-muted-foreground">
              Enter your Master Vault passphrase to decrypt client-side.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-3">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="password"
              required
              autoFocus
              placeholder="Enter Vault passphrase..."
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Unlock Vault"
            )}
          </Button>
        </form>
      </div>
    );
  }

  return <>{children(decrypted)}</>;
}
