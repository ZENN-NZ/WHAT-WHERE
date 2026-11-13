"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  History,
  MessageSquare,
  Wifi,
  WifiOff,
  Loader2,
  Lock,
  Unlock,
  ShieldAlert,
} from "lucide-react";
import { updateDocumentMetaAction } from "@/actions/document.actions";
import { saveDocumentContentAction } from "@/actions/collaboration.actions";
import {
  lockDocumentInVaultAction,
  removeVaultLockAction,
  saveVaultDocumentCiphertextAction,
} from "@/actions/vault.actions";
import {
  encryptVaultPayload,
  generateDocumentDek,
  wrapDek,
} from "@/lib/crypto/vault";
import { CollaborativeEditor } from "@/components/editor/CollaborativeEditor";
import { CommentsSidebar } from "@/components/editor/CommentsSidebar";
import { VersionHistoryDrawer } from "@/components/editor/VersionHistoryDrawer";
import { VaultLockGuard } from "@/components/editor/VaultLockGuard";
import { useVault } from "@/components/editor/VaultProvider";
import { BacklinksPanel } from "@/components/navigation/BacklinksPanel";
import { useWorkspace } from "@/components/navigation/WorkspaceContext";
import type { CollaboratorPresence } from "@/lib/yjs/SupabaseYjsProvider";
import type {
  BacklinkRecord,
  CommentRecord,
  DocumentRecord,
  DocumentVersionRecord,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface DocumentWorkspaceViewProps {
  document: DocumentRecord;
  backlinks: BacklinkRecord[];
  comments: CommentRecord[];
  versions: DocumentVersionRecord[];
}

export function DocumentWorkspaceView({
  document,
  backlinks,
  comments,
  versions,
}: DocumentWorkspaceViewProps) {
  const router = useRouter();
  const { setItems, setUnlockedTitle, unlockedTitles, currentUser } =
    useWorkspace();
  const {
    isConfigured,
    isUnlocked,
    kek,
    setupVaultPassphrase,
    unlockVault,
    lockVaultSession,
  } = useVault();

  const [title, setTitle] = React.useState(
    document.is_vault_encrypted
      ? unlockedTitles[document.id] || "🔒 Encrypted Vault Page"
      : document.title
  );
  const [icon, setIcon] = React.useState(document.icon || "📄");
  const [syncStatus, setSyncStatus] = React.useState<
    "connecting" | "synced" | "offline"
  >("connecting");
  const [collaborators, setCollaborators] = React.useState<
    CollaboratorPresence[]
  >([]);
  const [rightPanel, setRightPanel] = React.useState<
    "none" | "comments" | "versions"
  >("none");
  const [activeBlockId, setActiveBlockId] = React.useState("page");
  const [editorRevision, setEditorRevision] = React.useState(0);
  const [overrideState, setOverrideState] = React.useState<{
    yjsStateBase64: string | null;
    contentJson: unknown | null;
  } | null>(null);

  const [vaultModalOpen, setVaultModalOpen] = React.useState(false);
  const [vaultPassphrase, setVaultPassphrase] = React.useState("");
  const [vaultConfirm, setVaultConfirm] = React.useState("");
  const [vaultBusy, setVaultBusy] = React.useState(false);
  const [vaultError, setVaultError] = React.useState<string | null>(null);

  const snapshotGetterRef = React.useRef<
    (() => { yjsStateBase64: string; contentJson: unknown }) | null
  >(null);

  const titleSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  function handleTitleChange(nextTitle: string) {
    setTitle(nextTitle);
    if (document.is_vault_encrypted) return;

    setItems((prev) =>
      prev.map((item) =>
        item.id === document.id ? { ...item, title: nextTitle || "Untitled" } : item
      )
    );

    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      void updateDocumentMetaAction(document.id, {
        title: nextTitle || "Untitled",
      });
    }, 500);
  }

  async function handleCycleIcon() {
    const icons = ["📄", "📝", "📌", "🧠", "🚀", "🔒", "📚", "💡"];
    const nextIcon = icons[(icons.indexOf(icon) + 1) % icons.length];
    setIcon(nextIcon);
    setItems((prev) =>
      prev.map((item) =>
        item.id === document.id ? { ...item, icon: nextIcon } : item
      )
    );
    await updateDocumentMetaAction(document.id, { icon: nextIcon });
  }

  async function handleRestoreVersion(version: DocumentVersionRecord) {
    if (document.is_vault_encrypted) return;
    await saveDocumentContentAction({
      documentId: document.id,
      yjsStateBase64: version.yjs_snapshot || "",
      contentJson: version.content_json,
    });
    setOverrideState({
      yjsStateBase64: version.yjs_snapshot,
      contentJson: version.content_json,
    });
    setEditorRevision((r) => r + 1);
    router.refresh();
  }

  async function executeLockInVault(activeKek: CryptoKey) {
    const snap = snapshotGetterRef.current?.() ?? {
      yjsStateBase64: document.yjs_state || "",
      contentJson: document.content_json || [],
    };
    const dek = await generateDocumentDek();
    const wrappedDek = await wrapDek(dek, activeKek);
    const { encryptedPayloadBase64, encryptionIvBase64 } =
      await encryptVaultPayload(
        {
          title: title || "Untitled",
          yjsStateBase64: snap.yjsStateBase64,
          contentJson: snap.contentJson,
        },
        dek
      );

    await lockDocumentInVaultAction({
      documentId: document.id,
      encryptedPayload: encryptedPayloadBase64,
      encryptionIv: encryptionIvBase64,
      wrappedDek,
    });

    setUnlockedTitle(document.id, title || "Untitled");
    setItems((prev) =>
      prev.map((item) =>
        item.id === document.id
          ? {
              ...item,
              is_vault_encrypted: true,
              title: "🔒 Encrypted Vault Page",
              encrypted_payload: encryptedPayloadBase64,
              encryption_iv: encryptionIvBase64,
              wrapped_dek: wrappedDek,
            }
          : item
      )
    );
    router.refresh();
  }

  async function handleLockButtonClick() {
    if (isUnlocked && kek) {
      setVaultBusy(true);
      try {
        await executeLockInVault(kek);
      } finally {
        setVaultBusy(false);
      }
      return;
    }
    setVaultError(null);
    setVaultModalOpen(true);
  }

  async function handleVaultModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setVaultError(null);
    setVaultBusy(true);
    try {
      if (!isConfigured) {
        if (vaultPassphrase.length < 10) {
          setVaultError("Passphrase must be at least 10 characters.");
          return;
        }
        if (vaultPassphrase !== vaultConfirm) {
          setVaultError("Passphrases do not match.");
          return;
        }
        await setupVaultPassphrase(vaultPassphrase);
      } else {
        const ok = await unlockVault(vaultPassphrase, document.id);
        if (!ok) {
          setVaultError("Incorrect Vault passphrase.");
          return;
        }
      }
      setVaultModalOpen(false);
      setVaultPassphrase("");
      setVaultConfirm("");
    } catch (err) {
      setVaultError(
        err instanceof Error ? err.message : "Vault operation failed."
      );
    } finally {
      setVaultBusy(false);
    }
  }

  const effectiveYjs = overrideState
    ? overrideState.yjsStateBase64
    : document.yjs_state;
  const effectiveJson = overrideState
    ? overrideState.contentJson
    : document.content_json;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 overflow-y-auto">
        {/* Document Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-2">
          <div className="flex items-center gap-2">
            {document.is_vault_encrypted ? (
              <Badge variant="warning" className="gap-1">
                <Lock className="h-3 w-3" />
                Zero-Knowledge Vault
              </Badge>
            ) : (
              <Badge
                variant={syncStatus === "offline" ? "destructive" : "secondary"}
                className="gap-1"
              >
                {syncStatus === "connecting" && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {syncStatus === "synced" && <Wifi className="h-3 w-3" />}
                {syncStatus === "offline" && <WifiOff className="h-3 w-3" />}
                {syncStatus === "connecting"
                  ? "Syncing"
                  : syncStatus === "synced"
                  ? "Realtime Synced"
                  : "Offline (IndexedDB)"}
              </Badge>
            )}

            {collaborators.length > 0 && !document.is_vault_encrypted && (
              <div className="flex items-center -space-x-1.5 pl-1">
                {collaborators.slice(0, 5).map((c) => (
                  <span
                    key={c.id}
                    title={c.name}
                    style={{ backgroundColor: c.color }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold text-white"
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {document.is_vault_encrypted ? (
              isUnlocked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={lockVaultSession}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Lock Vault Session
                </Button>
              )
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={vaultBusy}
                onClick={() => void handleLockButtonClick()}
              >
                {vaultBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                Lock in Vault
              </Button>
            )}

            <Button
              variant={rightPanel === "comments" ? "secondary" : "ghost"}
              size="sm"
              onClick={() =>
                setRightPanel((p) => (p === "comments" ? "none" : "comments"))
              }
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Comments ({comments.filter((c) => !c.resolved).length})
            </Button>
            <Button
              variant={rightPanel === "versions" ? "secondary" : "ghost"}
              size="sm"
              onClick={() =>
                setRightPanel((p) => (p === "versions" ? "none" : "versions"))
              }
            >
              <History className="h-3.5 w-3.5" />
              History
            </Button>
          </div>
        </div>

        {/* Page Title & Editor Canvas */}
        {document.is_vault_encrypted ? (
          <VaultLockGuard
            documentId={document.id}
            encryptedPayload={document.encrypted_payload}
            encryptionIv={document.encryption_iv}
            wrappedDek={document.wrapped_dek}
          >
            {({ payload, dek }) => (
              <UnlockedVaultDocumentCanvas
                documentId={document.id}
                icon={icon}
                initialPayload={payload}
                dek={dek}
                onCycleIcon={() => void handleCycleIcon()}
                onBlockFocusChange={setActiveBlockId}
                onUnlockedTitle={(nextTitle) =>
                  setUnlockedTitle(document.id, nextTitle)
                }
                onRemoveVaultLock={async (latestPayload) => {
                  await removeVaultLockAction({
                    documentId: document.id,
                    title: latestPayload.title,
                    yjsStateBase64: latestPayload.yjsStateBase64,
                    contentJson: latestPayload.contentJson,
                  });
                  router.refresh();
                }}
              />
            )}
          </VaultLockGuard>
        ) : (
          <div className="mx-auto max-w-4xl px-8 py-10">
            <div className="mb-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleCycleIcon()}
                title="Change page icon"
                className="rounded-md p-1 text-4xl hover:bg-accent"
              >
                {icon}
              </button>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Untitled"
                className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            <CollaborativeEditor
              key={`${document.id}:${editorRevision}`}
              documentId={document.id}
              initialYjsStateBase64={effectiveYjs}
              initialContentJson={effectiveJson}
              isVaultEncrypted={false}
              onSyncStatusChange={setSyncStatus}
              onCollaboratorsChange={setCollaborators}
              onEditorSnapshotReady={(getter) => {
                snapshotGetterRef.current = getter;
              }}
              onBlockFocusChange={setActiveBlockId}
            />

            <BacklinksPanel backlinks={backlinks} />
          </div>
        )}
      </div>

      {rightPanel === "comments" && (
        <CommentsSidebar
          documentId={document.id}
          activeBlockId={activeBlockId}
          initialComments={comments}
          currentUserId={currentUser.id}
          onClose={() => setRightPanel("none")}
        />
      )}

      {rightPanel === "versions" && (
        <VersionHistoryDrawer
          documentId={document.id}
          isVaultEncrypted={document.is_vault_encrypted}
          initialVersions={versions}
          getCurrentSnapshot={() => snapshotGetterRef.current?.() ?? null}
          onRestoreVersion={handleRestoreVersion}
          onClose={() => setRightPanel("none")}
        />
      )}

      {/* Modal to unlock/configure Vault before locking a page */}
      <Dialog open={vaultModalOpen} onOpenChange={setVaultModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isConfigured
                ? "Unlock Vault to Encrypt Page"
                : "Initialize Master Vault Passphrase"}
            </DialogTitle>
            <DialogDescription>
              {isConfigured
                ? "Unlock your Vault session, then click Lock in Vault again to encrypt this page in-browser."
                : "Create a Master Vault passphrase (PBKDF2 600k + AES-256-GCM). It never leaves your browser."}
            </DialogDescription>
          </DialogHeader>

          {vaultError && (
            <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {vaultError}
            </div>
          )}

          <form onSubmit={handleVaultModalSubmit} className="space-y-3">
            <Input
              type="password"
              required
              placeholder={
                isConfigured
                  ? "Enter Vault passphrase"
                  : "New passphrase (min 10 chars)"
              }
              value={vaultPassphrase}
              onChange={(e) => setVaultPassphrase(e.target.value)}
            />
            {!isConfigured && (
              <Input
                type="password"
                required
                placeholder="Confirm passphrase"
                value={vaultConfirm}
                onChange={(e) => setVaultConfirm(e.target.value)}
              />
            )}
            <Button type="submit" className="w-full" disabled={vaultBusy}>
              {vaultBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isConfigured ? (
                "Unlock Session"
              ) : (
                "Configure & Unlock"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnlockedVaultDocumentCanvas({
  documentId,
  icon,
  initialPayload,
  dek,
  onCycleIcon,
  onBlockFocusChange,
  onUnlockedTitle,
  onRemoveVaultLock,
}: {
  documentId: string;
  icon: string;
  initialPayload: {
    title: string;
    yjsStateBase64: string;
    contentJson: unknown;
  };
  dek: CryptoKey;
  onCycleIcon: () => void;
  onBlockFocusChange: (blockId: string) => void;
  onUnlockedTitle: (title: string) => void;
  onRemoveVaultLock: (payload: {
    title: string;
    yjsStateBase64: string;
    contentJson: unknown;
  }) => Promise<void>;
}) {
  const [vaultTitle, setVaultTitle] = React.useState(initialPayload.title);
  const [savingCipher, setSavingCipher] = React.useState(false);
  const [removingLock, setRemovingLock] = React.useState(false);
  const latestPayloadRef = React.useRef(initialPayload);
  const titleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  React.useEffect(() => {
    onUnlockedTitle(initialPayload.title);
  }, [initialPayload.title, onUnlockedTitle]);

  async function persistEncrypted(nextPayload: {
    title: string;
    yjsStateBase64: string;
    contentJson: unknown;
  }) {
    setSavingCipher(true);
    try {
      const { encryptedPayloadBase64, encryptionIvBase64 } =
        await encryptVaultPayload(nextPayload, dek);
      await saveVaultDocumentCiphertextAction({
        documentId,
        encryptedPayload: encryptedPayloadBase64,
        encryptionIv: encryptionIvBase64,
      });
    } finally {
      setSavingCipher(false);
    }
  }

  function handleVaultTitleChange(next: string) {
    setVaultTitle(next);
    onUnlockedTitle(next || "Untitled");
    latestPayloadRef.current = {
      ...latestPayloadRef.current,
      title: next || "Untitled",
    };

    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      void persistEncrypted(latestPayloadRef.current);
    }, 600);
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" />
          Decrypted locally in memory (AES-256-GCM). Plaintext never leaves your
          browser. {savingCipher ? "• Encrypting..." : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={removingLock}
          onClick={async () => {
            setRemovingLock(true);
            try {
              await onRemoveVaultLock(latestPayloadRef.current);
            } finally {
              setRemovingLock(false);
            }
          }}
          className="h-7 text-xs"
        >
          <Unlock className="h-3 w-3" />
          {removingLock ? "Decrypting..." : "Remove Vault Lock"}
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onCycleIcon}
          title="Change page icon"
          className="rounded-md p-1 text-4xl hover:bg-accent"
        >
          {icon}
        </button>
        <input
          type="text"
          value={vaultTitle}
          onChange={(e) => handleVaultTitleChange(e.target.value)}
          placeholder="Untitled Vault Page"
          className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      <CollaborativeEditor
        documentId={documentId}
        initialYjsStateBase64={initialPayload.yjsStateBase64}
        initialContentJson={initialPayload.contentJson}
        isVaultEncrypted={true}
        onBlockFocusChange={onBlockFocusChange}
        onVaultPayloadChange={(update) => {
          latestPayloadRef.current = {
            title: latestPayloadRef.current.title,
            yjsStateBase64: update.yjsStateBase64,
            contentJson: update.contentJson,
          };
          void persistEncrypted(latestPayloadRef.current);
        }}
      />
    </div>
  );
}
