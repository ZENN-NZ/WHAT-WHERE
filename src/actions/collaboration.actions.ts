"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  extractPageMentionsFromBlocks,
  extractPlainTextFromBlocks,
} from "@/lib/editor/extract";
import type {
  BacklinkRecord,
  CommentRecord,
  DocumentVersionRecord,
} from "@/types/database";

const uuidSchema = z.string().uuid();

const ALLOWED_ASSET_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");
  return { supabase, user };
}

function base64ToPostgresBytea(base64: string): string {
  return `\\x${Buffer.from(base64, "base64").toString("hex")}`;
}

function normalizeByteaToBase64(raw: unknown): string | null {
  if (typeof raw === "string") {
    if (raw.startsWith("\\x")) {
      return Buffer.from(raw.slice(2), "hex").toString("base64");
    }
    return raw;
  }
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw).toString("base64");
  }
  return null;
}

export async function saveDocumentContentAction(input: {
  documentId: string;
  yjsStateBase64: string;
  contentJson: unknown;
}): Promise<void> {
  if (!uuidSchema.safeParse(input.documentId).success) {
    throw new Error("Invalid document ID.");
  }
  const { supabase, user } = await requireUser();

  const { data: doc } = await supabase
    .from("documents")
    .select("is_vault_encrypted")
    .eq("id", input.documentId)
    .single();

  if (!doc) throw new Error("Document not found.");
  if (doc.is_vault_encrypted) {
    throw new Error(
      "Vault invariant violation: cannot persist plaintext content for a Vault-encrypted page."
    );
  }

  const plainText = extractPlainTextFromBlocks(input.contentJson);
  const mentions = extractPageMentionsFromBlocks(input.contentJson).filter(
    (m) => m.targetDocumentId !== input.documentId
  );

  const { error } = await supabase
    .from("documents")
    .update({
      yjs_state: base64ToPostgresBytea(input.yjsStateBase64),
      content_json: input.contentJson,
      plain_text: plainText,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.documentId);

  if (error) {
    throw new Error(`Failed to save document content: ${error.message}`);
  }

  // Reconcile bi-directional backlinks atomically for this source document
  await supabase
    .from("document_backlinks")
    .delete()
    .eq("source_document_id", input.documentId);

  if (mentions.length > 0) {
    const validTargetIds = mentions
      .map((m) => m.targetDocumentId)
      .filter((id) => uuidSchema.safeParse(id).success);

    if (validTargetIds.length > 0) {
      const { data: existingTargets } = await supabase
        .from("documents")
        .select("id")
        .in("id", validTargetIds);

      const existingSet = new Set((existingTargets || []).map((t) => t.id));
      const rows = mentions
        .filter((m) => existingSet.has(m.targetDocumentId))
        .map((m) => ({
          source_document_id: input.documentId,
          target_document_id: m.targetDocumentId,
          block_id: m.blockId,
        }));

      if (rows.length > 0) {
        await supabase.from("document_backlinks").upsert(rows, {
          onConflict: "source_document_id,target_document_id,block_id",
        });
      }
    }
  }
}

export async function getBacklinksAction(
  documentId: string
): Promise<BacklinkRecord[]> {
  if (!uuidSchema.safeParse(documentId).success) return [];
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("document_backlinks")
    .select(
      "source_document_id, target_document_id, block_id, created_at, source_document:documents!document_backlinks_source_document_id_fkey(id, title, icon, is_vault_encrypted, is_archived)"
    )
    .eq("target_document_id", documentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[backlinks] fetch error:", error.message);
    return [];
  }

  return (data || [])
    .filter((row) => {
      const src = row.source_document as unknown as {
        is_archived?: boolean;
      } | null;
      return src && !src.is_archived;
    })
    .map((row) => {
      const src = row.source_document as unknown as {
        id: string;
        title: string;
        icon: string | null;
        is_vault_encrypted: boolean;
      };
      return {
        source_document_id: row.source_document_id,
        target_document_id: row.target_document_id,
        block_id: row.block_id,
        created_at: row.created_at,
        source_document: {
          id: src.id,
          title: src.is_vault_encrypted ? "🔒 Encrypted Vault Page" : src.title,
          icon: src.icon,
          is_vault_encrypted: src.is_vault_encrypted,
        },
      };
    });
}

export async function listCommentsAction(
  documentId: string
): Promise<CommentRecord[]> {
  if (!uuidSchema.safeParse(documentId).success) return [];
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const authorIds = Array.from(new Set(data.map((c) => c.author_id)));
  const { data: profiles } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, display_name, avatar_url")
        .in("id", authorIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles || []).map((p) => [p.id, p])
  );

  return data.map((c) => ({
    ...(c as CommentRecord),
    author: profileMap.get(c.author_id),
  }));
}

export async function createCommentAction(input: {
  documentId: string;
  blockId: string;
  threadId?: string;
  body: string;
}): Promise<CommentRecord> {
  if (!uuidSchema.safeParse(input.documentId).success) {
    throw new Error("Invalid document ID.");
  }
  const body = input.body.trim();
  if (!body) throw new Error("Comment body cannot be empty.");

  const { supabase, user } = await requireUser();
  const threadId =
    input.threadId && uuidSchema.safeParse(input.threadId).success
      ? input.threadId
      : crypto.randomUUID();

  const { data, error } = await supabase
    .from("comments")
    .insert({
      document_id: input.documentId,
      thread_id: threadId,
      block_id: input.blockId || "page",
      author_id: user.id,
      body,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to add comment: ${error?.message}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  revalidatePath(`/${input.documentId}`);
  return {
    ...(data as CommentRecord),
    author: profile ?? undefined,
  };
}

export async function toggleResolveCommentThreadAction(
  documentId: string,
  threadId: string,
  resolved: boolean
): Promise<void> {
  if (!uuidSchema.safeParse(threadId).success) return;
  const { supabase } = await requireUser();

  await supabase
    .from("comments")
    .update({ resolved, updated_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .eq("thread_id", threadId);

  revalidatePath(`/${documentId}`);
}

export async function deleteCommentAction(
  documentId: string,
  commentId: string
): Promise<void> {
  if (!uuidSchema.safeParse(commentId).success) return;
  const { supabase } = await requireUser();
  await supabase.from("comments").delete().eq("id", commentId);
  revalidatePath(`/${documentId}`);
}

export async function listDocumentVersionsAction(
  documentId: string
): Promise<DocumentVersionRecord[]> {
  if (!uuidSchema.safeParse(documentId).success) return [];
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !data) return [];

  return data.map((v) => ({
    ...(v as DocumentVersionRecord),
    yjs_snapshot: normalizeByteaToBase64(
      (v as Record<string, unknown>).yjs_snapshot
    ),
  }));
}

export async function createDocumentVersionAction(input: {
  documentId: string;
  yjsSnapshotBase64?: string | null;
  contentJson?: unknown | null;
}): Promise<DocumentVersionRecord> {
  if (!uuidSchema.safeParse(input.documentId).success) {
    throw new Error("Invalid document ID.");
  }
  const { supabase, user } = await requireUser();

  const { data: doc } = await supabase
    .from("documents")
    .select("is_vault_encrypted")
    .eq("id", input.documentId)
    .single();

  if (doc?.is_vault_encrypted) {
    throw new Error(
      "Unencrypted version snapshots are disabled for Vault-encrypted pages."
    );
  }

  const { data, error } = await supabase
    .from("document_versions")
    .insert({
      document_id: input.documentId,
      yjs_snapshot: input.yjsSnapshotBase64
        ? base64ToPostgresBytea(input.yjsSnapshotBase64)
        : null,
      content_json: input.contentJson ?? null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create version snapshot: ${error?.message}`);
  }

  revalidatePath(`/${input.documentId}`);
  return {
    ...(data as DocumentVersionRecord),
    yjs_snapshot: input.yjsSnapshotBase64 ?? null,
  };
}

export async function createWorkspaceAssetSignedUploadAction(input: {
  documentId: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<{ path: string; signedUploadUrl: string; token: string }> {
  if (!uuidSchema.safeParse(input.documentId).success) {
    throw new Error("Invalid document ID.");
  }
  if (!ALLOWED_ASSET_MIME_TYPES.has(input.contentType)) {
    throw new Error(`Unsupported file type: ${input.contentType}`);
  }
  if (input.fileSizeBytes > 52_428_800) {
    throw new Error("File exceeds 50MB limit.");
  }

  const { supabase } = await requireUser();
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${input.documentId}/${crypto.randomUUID()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from("workspace-assets")
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`Failed to create signed upload URL: ${error?.message}`);
  }

  return {
    path,
    signedUploadUrl: data.signedUrl,
    token: data.token,
  };
}

export async function getWorkspaceAssetSignedUrlAction(
  storagePath: string
): Promise<string> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.storage
    .from("workspace-assets")
    .createSignedUrl(storagePath, 3600);

  if (error || !data) {
    throw new Error(`Failed to resolve asset URL: ${error?.message}`);
  }

  return data.signedUrl;
}
