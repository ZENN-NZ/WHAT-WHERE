"use client";

import * as React from "react";
import * as Y from "yjs";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { filterSuggestionItems, type PartialBlock } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import {
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { createClient } from "@/lib/supabase/client";
import {
  SupabaseYjsProvider,
  base64ToUint8,
  uint8ToBase64,
  type CollaboratorPresence,
} from "@/lib/yjs/SupabaseYjsProvider";
import { workspaceEditorSchema } from "@/components/editor/PageMentionSchema";
import {
  createWorkspaceAssetSignedUploadAction,
  getWorkspaceAssetSignedUrlAction,
  saveDocumentContentAction,
} from "@/actions/collaboration.actions";
import { useWorkspace } from "@/components/navigation/WorkspaceContext";

const CURSOR_PALETTE = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#db2777",
];

function pickColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_PALETTE[hash % CURSOR_PALETTE.length];
}

export interface CollaborativeEditorProps {
  documentId: string;
  initialYjsStateBase64: string | null;
  initialContentJson: unknown | null;
  isVaultEncrypted: boolean;
  onSyncStatusChange?: (status: "connecting" | "synced" | "offline") => void;
  onCollaboratorsChange?: (users: CollaboratorPresence[]) => void;
  onEditorSnapshotReady?: (
    getSnapshot: () => { yjsStateBase64: string; contentJson: unknown }
  ) => void;
  onVaultPayloadChange?: (payload: {
    yjsStateBase64: string;
    contentJson: unknown;
  }) => void;
  onBlockFocusChange?: (blockId: string) => void;
}

export default function CollaborativeEditorClient({
  documentId,
  initialYjsStateBase64,
  initialContentJson,
  isVaultEncrypted,
  onSyncStatusChange,
  onCollaboratorsChange,
  onEditorSnapshotReady,
  onVaultPayloadChange,
  onBlockFocusChange,
}: CollaborativeEditorProps) {
  const { items, unlockedTitles, currentUser } = useWorkspace();
  const supabase = React.useMemo(() => createClient(), []);

  const userColor = React.useMemo(
    () => pickColorForUser(currentUser.id),
    [currentUser.id]
  );

  // Initialize Y.Doc + SupabaseYjsProvider once per documentId
  const { yDoc, provider } = React.useMemo(() => {
    const doc = new Y.Doc();
    if (initialYjsStateBase64) {
      try {
        Y.applyUpdate(doc, base64ToUint8(initialYjsStateBase64), "init");
      } catch (err) {
        console.error("[editor] Failed to apply initial Yjs state:", err);
      }
    }

    const prov = new SupabaseYjsProvider({
      documentId,
      doc,
      supabase,
      user: {
        id: currentUser.id,
        name: currentUser.displayName,
        color: userColor,
      },
      enableRealtimeBroadcast: !isVaultEncrypted,
      onSyncStatusChange,
      onCollaboratorsChange,
    });

    return { yDoc: doc, provider: prov };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, isVaultEncrypted]);

  React.useEffect(() => {
    return () => {
      provider.destroy();
      yDoc.destroy();
    };
  }, [provider, yDoc]);

  const editor = useCreateBlockNote(
    withCollaboration({
      schema: workspaceEditorSchema,
      collaboration: {
        provider: { awareness: provider.awareness },
        fragment: yDoc.getXmlFragment("document-store"),
        user: {
          name: currentUser.displayName,
          color: userColor,
        },
        showCursorLabels: "activity",
      },
      uploadFile: async (file: File) => {
        const { path, signedUploadUrl } =
          await createWorkspaceAssetSignedUploadAction({
            documentId,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            fileSizeBytes: file.size,
          });

        const uploadRes = await fetch(signedUploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload file to private storage.");
        }

        // Store logical storage path with custom scheme resolved via signed URLs
        return `storage://workspace-assets/${path}`;
      },
      resolveFileUrl: async (url: string) => {
        if (url.startsWith("storage://workspace-assets/")) {
          const storagePath = url.replace("storage://workspace-assets/", "");
          return await getWorkspaceAssetSignedUrlAction(storagePath);
        }
        return url;
      },
    }),
    [yDoc, provider]
  );

  // Hydrate initial JSON content only if Yjs fragment is completely empty
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const fragment = yDoc.getXmlFragment("document-store");
    if (
      fragment.length === 0 &&
      Array.isArray(initialContentJson) &&
      initialContentJson.length > 0
    ) {
      editor.replaceBlocks(
        editor.document,
        initialContentJson as PartialBlock<
          typeof workspaceEditorSchema.blockSchema,
          typeof workspaceEditorSchema.inlineContentSchema,
          typeof workspaceEditorSchema.styleSchema
        >[]
      );
    }
  }, [editor, yDoc, initialContentJson]);

  React.useEffect(() => {
    onEditorSnapshotReady?.(() => ({
      yjsStateBase64: uint8ToBase64(Y.encodeStateAsUpdate(yDoc)),
      contentJson: editor.document,
    }));
  }, [editor, yDoc, onEditorSnapshotReady]);

  // Debounced auto-save
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = React.useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      const yjsStateBase64 = uint8ToBase64(Y.encodeStateAsUpdate(yDoc));
      const contentJson = editor.document;

      if (isVaultEncrypted) {
        onVaultPayloadChange?.({ yjsStateBase64, contentJson });
      } else {
        void saveDocumentContentAction({
          documentId,
          yjsStateBase64,
          contentJson,
        }).catch((err) => {
          console.error("[editor] auto-save failed:", err);
        });
      }
    }, 900);
  }, [documentId, editor, isVaultEncrypted, onVaultPayloadChange, yDoc]);

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const getMentionItems = React.useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const mentionables = items
        .filter((item) => item.id !== documentId)
        .map((item) => {
          const title = item.is_vault_encrypted
            ? unlockedTitles[item.id] || "🔒 Encrypted Vault Page"
            : item.title || "Untitled";
          return {
            title,
            subtext: item.is_database ? "Database" : "Page",
            onItemClick: () => {
              editor.insertInlineContent([
                {
                  type: "pageMention",
                  props: {
                    documentId: item.id,
                    title,
                  },
                },
                " ",
              ]);
            },
          };
        });

      return filterSuggestionItems(mentionables, query);
    },
    [items, documentId, unlockedTitles, editor]
  );

  return (
    <div
      className="min-h-[420px] w-full"
      onClick={() => {
        try {
          const cursor = editor.getTextCursorPosition();
          if (cursor?.block?.id) {
            onBlockFocusChange?.(cursor.block.id);
          }
        } catch {
          // Ignore if editor selection isn't ready
        }
      }}
    >
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme="light"
      >
        <SuggestionMenuController
          triggerCharacter="@"
          getItems={getMentionItems}
        />
      </BlockNoteView>
    </div>
  );
}
