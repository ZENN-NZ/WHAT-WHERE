"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { computeFractionalPosition, wouldCreateCycle } from "@/lib/tree";
import type { DocumentRecord, DocumentTreeItem } from "@/types/database";

const uuidSchema = z.string().uuid();

async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }
  return { supabase, user };
}

export async function getDocumentTreeAction(): Promise<DocumentTreeItem[]> {
  const { supabase } = await requireAuthenticatedUser();
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, parent_id, title, icon, position, is_database, is_vault_encrypted, encrypted_payload, encryption_iv, wrapped_dek, updated_at"
    )
    .eq("is_archived", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load workspace tree: ${error.message}`);
  }
  return (data || []) as DocumentTreeItem[];
}

export async function getDocumentByIdAction(
  documentId: string
): Promise<DocumentRecord | null> {
  if (!uuidSchema.safeParse(documentId).success) {
    return null;
  }
  const { supabase } = await requireAuthenticatedUser();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch document: ${error.message}`);
  }
  if (!data) return null;

  // Convert BYTEA hex/buffer representation safely to base64 string for client transport
  let yjsBase64: string | null = null;
  const rawYjs = (data as Record<string, unknown>).yjs_state;
  if (typeof rawYjs === "string") {
    if (rawYjs.startsWith("\\x")) {
      yjsBase64 = Buffer.from(rawYjs.slice(2), "hex").toString("base64");
    } else {
      yjsBase64 = rawYjs;
    }
  } else if (rawYjs instanceof Uint8Array) {
    yjsBase64 = Buffer.from(rawYjs).toString("base64");
  }

  return {
    ...(data as DocumentRecord),
    yjs_state: yjsBase64,
  };
}

export async function getOrCreateDefaultDocumentIdAction(): Promise<string> {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("is_archived", false)
    .is("parent_id", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("documents")
    .insert({
      title: "Welcome to WHAT-WHERE",
      icon: "🧭",
      position: 1000,
      is_database: false,
      plain_text:
        "Start writing, press / for commands, @ to link pages, or lock sensitive pages in the Zero-Knowledge Vault.",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(
      `Failed to initialize workspace root page: ${error?.message}`
    );
  }

  return created.id;
}

export async function createDocumentAction(input?: {
  parentId?: string | null;
  title?: string;
  icon?: string | null;
  isDatabase?: boolean;
}): Promise<DocumentTreeItem> {
  const { supabase, user } = await requireAuthenticatedUser();
  const parentId = input?.parentId ?? null;
  const isDatabase = Boolean(input?.isDatabase);
  const title =
    input?.title?.trim() || (isDatabase ? "Untitled Database" : "Untitled");
  const icon = input?.icon ?? (isDatabase ? "🗂️" : "📄");

  let siblingQuery = supabase
    .from("documents")
    .select("position")
    .eq("is_archived", false)
    .order("position", { ascending: false })
    .limit(1);

  siblingQuery = parentId
    ? siblingQuery.eq("parent_id", parentId)
    : siblingQuery.is("parent_id", null);

  const { data: lastSibling } = await siblingQuery.maybeSingle();
  const position = computeFractionalPosition(lastSibling?.position ?? null, null);

  const { data: created, error } = await supabase
    .from("documents")
    .insert({
      parent_id: parentId,
      title,
      icon,
      position,
      is_database: isDatabase,
      created_by: user.id,
      updated_by: user.id,
    })
    .select(
      "id, parent_id, title, icon, position, is_database, is_vault_encrypted, encrypted_payload, encryption_iv, wrapped_dek, updated_at"
    )
    .single();

  if (error || !created) {
    throw new Error(`Failed to create document: ${error?.message}`);
  }

  if (isDatabase) {
    const { data: props, error: propErr } = await supabase
      .from("database_properties")
      .insert([
        {
          database_document_id: created.id,
          name: "Name",
          type: "title",
          config: {},
          position: 1000,
        },
        {
          database_document_id: created.id,
          name: "Status",
          type: "status",
          config: {
            options: [
              { id: "todo", label: "To Do", color: "gray" },
              { id: "in_progress", label: "In Progress", color: "blue" },
              { id: "done", label: "Done", color: "green" },
            ],
          },
          position: 2000,
        },
        {
          database_document_id: created.id,
          name: "Due Date",
          type: "date",
          config: {},
          position: 3000,
        },
      ])
      .select("id, type");

    if (propErr) {
      console.error("[database] Default properties init error:", propErr.message);
    } else if (props) {
      const statusProp = props.find((p) => p.type === "status");
      const dateProp = props.find((p) => p.type === "date");
      await supabase.from("database_views").insert({
        database_document_id: created.id,
        name: "All Items",
        type: "table",
        filters: [],
        sorts: [],
        group_by_property_id: statusProp?.id ?? null,
        calendar_date_property_id: dateProp?.id ?? null,
        visible_properties: props.map((p) => p.id),
        position: 1000,
      });
    }
  }

  revalidatePath("/", "layout");
  return created as DocumentTreeItem;
}

export async function updateDocumentMetaAction(
  documentId: string,
  updates: {
    title?: string;
    icon?: string | null;
    coverImageUrl?: string | null;
  }
): Promise<void> {
  if (!uuidSchema.safeParse(documentId).success) return;
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: current } = await supabase
    .from("documents")
    .select("is_vault_encrypted")
    .eq("id", documentId)
    .single();

  if (!current) return;

  const patch: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  // Preserve Vault zero-knowledge invariant: never write plaintext title if encrypted
  if (typeof updates.title === "string" && !current.is_vault_encrypted) {
    patch.title = updates.title.trim() || "Untitled";
  }
  if (updates.icon !== undefined) {
    patch.icon = updates.icon;
  }
  if (updates.coverImageUrl !== undefined) {
    patch.cover_image_url = updates.coverImageUrl;
  }

  const { error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", documentId);

  if (error) {
    throw new Error(`Failed to update document metadata: ${error.message}`);
  }

  revalidatePath("/", "layout");
  revalidatePath(`/${documentId}`);
}

export async function moveDocumentAction(
  documentId: string,
  targetParentId: string | null,
  newPosition: number
): Promise<void> {
  if (!uuidSchema.safeParse(documentId).success) {
    throw new Error("Invalid document ID.");
  }
  if (targetParentId && !uuidSchema.safeParse(targetParentId).success) {
    throw new Error("Invalid target parent ID.");
  }

  const { supabase, user } = await requireAuthenticatedUser();
  const tree = await getDocumentTreeAction();

  if (wouldCreateCycle(tree, documentId, targetParentId)) {
    throw new Error("Cannot move a page inside one of its own descendants.");
  }

  const { error } = await supabase
    .from("documents")
    .update({
      parent_id: targetParentId,
      position: newPosition,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (error) {
    throw new Error(`Failed to move document: ${error.message}`);
  }

  revalidatePath("/", "layout");
}

export interface SearchDocumentResult {
  id: string;
  title: string;
  icon: string | null;
  parent_id: string | null;
  is_database: boolean;
  plain_text_snippet: string | null;
  updated_at: string;
}

export async function searchDocumentsAction(
  rawQuery: string
): Promise<SearchDocumentResult[]> {
  const { supabase } = await requireAuthenticatedUser();
  const query = rawQuery.trim();

  if (!query) {
    const { data } = await supabase
      .from("documents")
      .select("id, title, icon, parent_id, is_database, plain_text, updated_at")
      .eq("is_archived", false)
      .eq("is_vault_encrypted", false)
      .order("updated_at", { ascending: false })
      .limit(12);

    return (data || []).map((doc) => ({
      id: doc.id,
      title: doc.title,
      icon: doc.icon,
      parent_id: doc.parent_id,
      is_database: doc.is_database,
      plain_text_snippet: doc.plain_text
        ? doc.plain_text.slice(0, 120)
        : null,
      updated_at: doc.updated_at,
    }));
  }

  // Primary: PostgreSQL GIN FTS with websearch_to_tsquery
  const { data: ftsData } = await supabase
    .from("documents")
    .select("id, title, icon, parent_id, is_database, plain_text, updated_at")
    .eq("is_archived", false)
    .eq("is_vault_encrypted", false)
    .textSearch("search_vector", query, {
      type: "websearch",
      config: "english",
    })
    .limit(20);

  if (ftsData && ftsData.length > 0) {
    return ftsData.map((doc) => ({
      id: doc.id,
      title: doc.title,
      icon: doc.icon,
      parent_id: doc.parent_id,
      is_database: doc.is_database,
      plain_text_snippet: doc.plain_text
        ? doc.plain_text.slice(0, 140)
        : null,
      updated_at: doc.updated_at,
    }));
  }

  // Fallback partial substring match for short prefixes
  const escaped = query.replace(/[%_]/g, "\\$&");
  const { data: ilikeData } = await supabase
    .from("documents")
    .select("id, title, icon, parent_id, is_database, plain_text, updated_at")
    .eq("is_archived", false)
    .eq("is_vault_encrypted", false)
    .or(`title.ilike.%${escaped}%,plain_text.ilike.%${escaped}%`)
    .order("updated_at", { ascending: false })
    .limit(20);

  return (ilikeData || []).map((doc) => ({
    id: doc.id,
    title: doc.title,
    icon: doc.icon,
    parent_id: doc.parent_id,
    is_database: doc.is_database,
    plain_text_snippet: doc.plain_text ? doc.plain_text.slice(0, 140) : null,
    updated_at: doc.updated_at,
  }));
}

export async function archiveDocumentAction(documentId: string): Promise<void> {
  if (!uuidSchema.safeParse(documentId).success) return;
  const { supabase, user } = await requireAuthenticatedUser();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("documents")
    .update({
      is_archived: true,
      archived_at: now,
      updated_by: user.id,
      updated_at: now,
    })
    .eq("id", documentId);

  if (error) {
    throw new Error(`Failed to move page to trash: ${error.message}`);
  }

  revalidatePath("/", "layout");
  revalidatePath("/trash");
}

export async function listArchivedDocumentsAction(): Promise<
  Array<{
    id: string;
    title: string;
    icon: string | null;
    is_database: boolean;
    is_vault_encrypted: boolean;
    archived_at: string | null;
  }>
> {
  const { supabase } = await requireAuthenticatedUser();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, icon, is_database, is_vault_encrypted, archived_at")
    .eq("is_archived", true)
    .order("archived_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list archived pages: ${error.message}`);
  }
  return data || [];
}

export async function restoreDocumentAction(documentId: string): Promise<void> {
  if (!uuidSchema.safeParse(documentId).success) return;
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: doc } = await supabase
    .from("documents")
    .select("parent_id")
    .eq("id", documentId)
    .maybeSingle();

  let nextParentId = doc?.parent_id ?? null;
  if (nextParentId) {
    const { data: parent } = await supabase
      .from("documents")
      .select("is_archived")
      .eq("id", nextParentId)
      .maybeSingle();
    if (!parent || parent.is_archived) {
      nextParentId = null;
    }
  }

  const { error } = await supabase
    .from("documents")
    .update({
      parent_id: nextParentId,
      is_archived: false,
      archived_at: null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (error) {
    throw new Error(`Failed to restore page: ${error.message}`);
  }

  revalidatePath("/", "layout");
  revalidatePath("/trash");
}

export async function purgeDocumentAction(documentId: string): Promise<void> {
  if (!uuidSchema.safeParse(documentId).success) return;
  const { supabase } = await requireAuthenticatedUser();

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (error) {
    throw new Error(`Failed to permanently delete page: ${error.message}`);
  }

  revalidatePath("/", "layout");
  revalidatePath("/trash");
}
