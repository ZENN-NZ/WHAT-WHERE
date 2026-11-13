"use client";

import * as React from "react";
import { History, RotateCcw, Save, X } from "lucide-react";
import { createDocumentVersionAction } from "@/actions/collaboration.actions";
import { extractPlainTextFromBlocks } from "@/lib/editor/extract";
import type { DocumentVersionRecord } from "@/types/database";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/utils";

interface VersionHistoryDrawerProps {
  documentId: string;
  isVaultEncrypted: boolean;
  initialVersions: DocumentVersionRecord[];
  getCurrentSnapshot: () => {
    yjsStateBase64: string;
    contentJson: unknown;
  } | null;
  onRestoreVersion: (version: DocumentVersionRecord) => Promise<void>;
  onClose: () => void;
}

export function VersionHistoryDrawer({
  documentId,
  isVaultEncrypted,
  initialVersions,
  getCurrentSnapshot,
  onRestoreVersion,
  onClose,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] =
    React.useState<DocumentVersionRecord[]>(initialVersions);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialVersions[0]?.id ?? null
  );
  const [saving, setSaving] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;
  const selectedPreviewText = React.useMemo(() => {
    if (!selectedVersion) return "";
    if (selectedVersion.encrypted_payload) {
      return "Encrypted snapshot payload (unlock Vault to restore).";
    }
    return (
      extractPlainTextFromBlocks(selectedVersion.content_json) ||
      "(Empty page snapshot)"
    );
  }, [selectedVersion]);

  async function handleSaveSnapshot() {
    if (isVaultEncrypted) return;
    const snap = getCurrentSnapshot();
    if (!snap) return;

    setSaving(true);
    try {
      const created = await createDocumentVersionAction({
        documentId,
        yjsSnapshotBase64: snap.yjsStateBase64,
        contentJson: snap.contentJson,
      });
      setVersions((prev) => [created, ...prev]);
      setSelectedId(created.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore() {
    if (!selectedVersion) return;
    setRestoring(true);
    try {
      await onRestoreVersion(selectedVersion);
      onClose();
    } finally {
      setRestoring(false);
    }
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-secondary/30">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Version History</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b border-border p-3">
        <Button
          size="sm"
          className="w-full"
          disabled={saving || isVaultEncrypted}
          onClick={() => void handleSaveSnapshot()}
        >
          <Save className="h-3.5 w-3.5" />
          {isVaultEncrypted
            ? "Disabled for Vault Pages"
            : saving
            ? "Saving..."
            : "Save Snapshot"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {versions.map((v, idx) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setSelectedId(v.id)}
            className={`w-full rounded-md border p-2.5 text-left text-xs transition-colors ${
              selectedId === v.id
                ? "border-ring bg-accent"
                : "border-border bg-card hover:bg-accent/50"
            }`}
          >
            <p className="font-medium">
              Snapshot #{versions.length - idx}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatRelativeDate(v.created_at)} •{" "}
              {new Date(v.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </button>
        ))}

        {versions.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No snapshots saved yet.
          </p>
        )}
      </div>

      {selectedVersion && (
        <div className="border-t border-border bg-card p-3 space-y-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Snapshot Preview
          </p>
          <div className="max-h-32 overflow-y-auto rounded border border-border bg-secondary/40 p-2 text-xs text-secondary-foreground">
            {selectedPreviewText}
          </div>
          {!selectedVersion.encrypted_payload && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={restoring}
              onClick={() => void handleRestore()}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {restoring ? "Restoring..." : "Restore This Version"}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
