"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logSecurityAudit } from "@/lib/audit";
import {
  extractPageMentionsFromBlocks,
  extractPlainTextFromBlocks,
} from "@/lib/editor/extract";

const uuidSchema = z.string().uuid();

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");
  return { supabase, user };
}

export async function saveVaultConfigAction(input: {
  vaultSalt: string;
  vaultVerifier: string;
}): Promise<void> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({
      vault_salt: input.vaultSalt,
      vault_verifier: input.vaultVerifier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(`Failed to save Vault configuration: ${error.message}`);
  }

  await logSecurityAudit({
    actorId: user.id,
    actorEmail: user.email,
    eventType: "VAULT_CONFIGURED",
    targetResource: user.id,
  });

  revalidatePath("/", "layout");
}

export async function lockDocumentInVaultAction(input: {
  documentId: string;
  encryptedPayload: string;
  encryptionIv: string;
  wrappedDek: string;
}): Promise<void> {
  if (!uuidSchema.safeParse(input.documentId).success) {
    throw new Error("Invalid document ID.");
  }

  const { supabase, user } = await requireUser();

  // Atomic Vault lock enforcing plaintext NULL invariant
  const { error } = await supabase
    .from("documents")
    .update({
      is_vault_encrypted: true,
      title: "🔒 Encrypted Vault Page",
      encrypted_payload: input.encryptedPayload,
      encryption_iv: input.encryptionIv,
      wrapped_dek: input.wrappedDek,
      yjs_state: null,
      content_json: null,
      plain_text: null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.documentId);

  if (error) {
    throw new Error(`Failed to lock document in Vault: ${error.message}`);
  }

  // Purge unencrypted versions and outgoing backlinks for this document
  await Promise.all([
    supabase
      .from("document_versions")
      .delete()
      .eq("document_id", input.documentId),
    supabase
      .from("document_backlinks")
      .delete()
      .eq("source_document_id", input.documentId),
  ]);

  await logSecurityAudit({
    actorId: user.id,
    actorEmail: user.email,
    eventType: "VAULT_LOCKED",
    targetResource: input.documentId,
  });

  revalidatePath("/", "layout");
  revalidatePath(`/${input.documentId}`);
}

export async function saveVaultDocumentCiphertextAction(input: {
  documentId: string;
  encryptedPayload: string;
  encryptionIv: string;
  wrappedDek?: string;
}): Promise<void> {
  if (!uuidSchema.safeParse(input.documentId).success) {
    throw new Error("Invalid document ID.");
  }

  const { supabase, user } = await requireUser();

  const patch: Record<string, unknown> = {
    is_vault_encrypted: true,
    title: "🔒 Encrypted Vault Page",
    encrypted_payload: input.encryptedPayload,
    encryption_iv: input.encryptionIv,
    yjs_state: null,
    content_json: null,
    plain_text: null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  if (input.wrappedDek) {
    patch.wrapped_dek = input.wrappedDek;
  }

  const { error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", input.documentId);

  if (error) {
    throw new Error(`Failed to save Vault ciphertext: ${error.message}`);
  }
}

export async function removeVaultLockAction(input: {
  documentId: string;
  title: string;
  yjsStateBase64: string;
  contentJson: unknown;
}): Promise<void> {
  if (!uuidSchema.safeParse(input.documentId).success) {
    throw new Error("Invalid document ID.");
  }

  const { supabase, user } = await requireUser();
  const plainText = extractPlainTextFromBlocks(input.contentJson);
  const yjsBytea = input.yjsStateBase64
    ? `\\x${Buffer.from(input.yjsStateBase64, "base64").toString("hex")}`
    : null;

  const { error } = await supabase
    .from("documents")
    .update({
      is_vault_encrypted: false,
      title: input.title.trim() || "Untitled",
      yjs_state: yjsBytea,
      content_json: input.contentJson,
      plain_text: plainText,
      encrypted_payload: null,
      encryption_iv: null,
      wrapped_dek: null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.documentId);

  if (error) {
    throw new Error(`Failed to remove Vault lock: ${error.message}`);
  }

  const mentions = extractPageMentionsFromBlocks(input.contentJson).filter(
    (m) => m.targetDocumentId !== input.documentId
  );
  if (mentions.length > 0) {
    await supabase.from("document_backlinks").upsert(
      mentions.map((m) => ({
        source_document_id: input.documentId,
        target_document_id: m.targetDocumentId,
        block_id: m.blockId,
      })),
      { onConflict: "source_document_id,target_document_id,block_id" }
    );
  }

  await logSecurityAudit({
    actorId: user.id,
    actorEmail: user.email,
    eventType: "VAULT_UNLOCKED",
    targetResource: input.documentId,
    metadata: { action: "vault_lock_removed" },
  });

  revalidatePath("/", "layout");
  revalidatePath(`/${input.documentId}`);
}

export async function logVaultUnlockAuditAction(
  success: boolean,
  documentId?: string
): Promise<void> {
  const { user } = await requireUser();
  await logSecurityAudit({
    actorId: user.id,
    actorEmail: user.email,
    eventType: success ? "VAULT_UNLOCKED" : "VAULT_UNLOCK_FAILED",
    targetResource: documentId ?? "vault_session",
  });
}
