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
} from "lucide-react";
import { updateDocumentMetaAction } from "@/actions/document.actions";
import { saveDocumentContentAction } from "@/actions/collaboration.actions";
import { CollaborativeEditor } from "@/components/editor/CollaborativeEditor";
import { CommentsSidebar } from "@/components/editor/CommentsSidebar";
import { VersionHistoryDrawer } from "@/components/editor/VersionHistoryDrawer";
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
  const { setItems, unlockedTitles, currentUser } = useWorkspace();

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

            {collaborators.length > 0 && (
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
              readOnly={document.is_vault_encrypted}
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
            isVaultEncrypted={document.is_vault_encrypted}
            onSyncStatusChange={setSyncStatus}
            onCollaboratorsChange={setCollaborators}
            onEditorSnapshotReady={(getter) => {
              snapshotGetterRef.current = getter;
            }}
            onBlockFocusChange={setActiveBlockId}
          />

          {!document.is_vault_encrypted && (
            <BacklinksPanel backlinks={backlinks} />
          )}
        </div>
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
    </div>
  );
}
