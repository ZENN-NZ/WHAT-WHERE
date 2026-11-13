"use client";

import * as React from "react";
import {
  createVaultVerifier,
  decryptVaultPayload,
  deriveKek,
  generateSaltBase64,
  unwrapDek,
  verifyVaultPassphrase,
} from "@/lib/crypto/vault";
import {
  logVaultUnlockAuditAction,
  saveVaultConfigAction,
} from "@/actions/vault.actions";
import { useWorkspace } from "@/components/navigation/WorkspaceContext";

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

interface VaultContextValue {
  isConfigured: boolean;
  isUnlocked: boolean;
  kek: CryptoKey | null;
  setupVaultPassphrase: (passphrase: string) => Promise<void>;
  unlockVault: (passphrase: string, documentId?: string) => Promise<boolean>;
  lockVaultSession: () => void;
}

const VaultContext = React.createContext<VaultContextValue | null>(null);

export function VaultProvider({
  initialVaultSalt,
  initialVaultVerifier,
  children,
}: {
  initialVaultSalt: string | null;
  initialVaultVerifier: string | null;
  children: React.ReactNode;
}) {
  const { items, setUnlockedTitle, clearUnlockedTitles } = useWorkspace();

  const [vaultSalt, setVaultSalt] = React.useState<string | null>(
    initialVaultSalt
  );
  const [vaultVerifier, setVaultVerifier] = React.useState<string | null>(
    initialVaultVerifier
  );
  // Non-serializable in-memory CryptoKey reference (never persisted to storage)
  const [kek, setKek] = React.useState<CryptoKey | null>(null);

  const isConfigured = Boolean(vaultSalt && vaultVerifier);
  const isUnlocked = Boolean(kek);

  const lockVaultSession = React.useCallback(() => {
    setKek(null);
    clearUnlockedTitles();
  }, [clearUnlockedTitles]);

  // Auto-lock Vault after 15 minutes of inactivity
  React.useEffect(() => {
    if (!kek) return;

    let timer = setTimeout(lockVaultSession, INACTIVITY_TIMEOUT_MS);
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(lockVaultSession, INACTIVITY_TIMEOUT_MS);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, resetTimer));

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [kek, lockVaultSession]);

  // Decrypt sidebar & Cmd+K Vault titles in-memory whenever unlocked
  React.useEffect(() => {
    if (!kek) return;
    let cancelled = false;

    async function decryptSidebarTitles() {
      const vaultItems = items.filter(
        (i) =>
          i.is_vault_encrypted &&
          i.encrypted_payload &&
          i.encryption_iv &&
          i.wrapped_dek
      );
      for (const item of vaultItems) {
        if (cancelled) break;
        try {
          const dek = await unwrapDek(item.wrapped_dek!, kek!);
          const payload = await decryptVaultPayload(
            item.encrypted_payload!,
            item.encryption_iv!,
            dek
          );
          if (!cancelled && payload.title) {
            setUnlockedTitle(item.id, payload.title);
          }
        } catch {
          // Different KEK or corrupted payload; skip silently
        }
      }
    }

    void decryptSidebarTitles();
    return () => {
      cancelled = true;
    };
  }, [kek, items, setUnlockedTitle]);

  const setupVaultPassphrase = React.useCallback(async (passphrase: string) => {
    const salt = generateSaltBase64(16);
    const derived = await deriveKek(passphrase, salt);
    const verifier = await createVaultVerifier(derived);
    await saveVaultConfigAction({ vaultSalt: salt, vaultVerifier: verifier });
    setVaultSalt(salt);
    setVaultVerifier(verifier);
    setKek(derived);
  }, []);

  const unlockVault = React.useCallback(
    async (passphrase: string, documentId?: string): Promise<boolean> => {
      if (!vaultSalt || !vaultVerifier) return false;
      const verifiedKey = await verifyVaultPassphrase(
        passphrase,
        vaultSalt,
        vaultVerifier
      );
      if (!verifiedKey) {
        void logVaultUnlockAuditAction(false, documentId);
        return false;
      }
      setKek(verifiedKey);
      void logVaultUnlockAuditAction(true, documentId);
      return true;
    },
    [vaultSalt, vaultVerifier]
  );

  return (
    <VaultContext.Provider
      value={{
        isConfigured,
        isUnlocked,
        kek,
        setupVaultPassphrase,
        unlockVault,
        lockVaultSession,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = React.useContext(VaultContext);
  if (!ctx) {
    throw new Error("useVault must be used inside VaultProvider.");
  }
  return ctx;
}
