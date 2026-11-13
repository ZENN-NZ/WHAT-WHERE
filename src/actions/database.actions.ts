"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { computeFractionalPosition } from "@/lib/tree";
import type {
  DatabaseCellValue,
  DatabaseProperty,
  DatabaseRelationLink,
  DatabaseView,
  DocumentRecord,
  FilterRule,
  Profile,
  PropertyConfig,
  PropertyType,
  SortRule,
  ViewType,
} from "@/types/database";
import type { RollupTargetDataset } from "@/lib/database/engine";

const uuidSchema = z.string().uuid();

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");
  return { supabase, user };
}

export interface DatabasePayload {
  database: DocumentRecord;
  properties: DatabaseProperty[];
  views: DatabaseView[];
  rows: DocumentRecord[];
  cells: DatabaseCellValue[];
  relations: DatabaseRelationLink[];
  members: Pick<Profile, "id" | "email" | "display_name" | "avatar_url">[];
  allDatabases: Array<{ id: string; title: string; icon: string | null }>;
  targetDatasets: Record<string, RollupTargetDataset>;
}

export async function getDatabasePayloadAction(
  databaseDocumentId: string
): Promise<DatabasePayload | null> {
  if (!uuidSchema.safeParse(databaseDocumentId).success) return null;
  const { supabase } = await requireUser();

  const { data: database } = await supabase
    .from("documents")
    .select("*")
    .eq("id", databaseDocumentId)
    .maybeSingle();

  if (!database || !database.is_database) return null;

  const [
    { data: properties },
    { data: views },
    { data: rows },
    { data: members },
    { data: allDatabases },
  ] = await Promise.all([
    supabase
      .from("database_properties")
      .select("*")
      .eq("database_document_id", databaseDocumentId)
      .order("position", { ascending: true }),
    supabase
      .from("database_views")
      .select("*")
      .eq("database_document_id", databaseDocumentId)
      .order("position", { ascending: true }),
    supabase
      .from("documents")
      .select("*")
      .eq("parent_id", databaseDocumentId)
      .eq("is_archived", false)
      .order("position", { ascending: true }),
    supabase.from("profiles").select("id, email, display_name, avatar_url"),
    supabase
      .from("documents")
      .select("id, title, icon")
      .eq("is_database", true)
      .eq("is_archived", false)
      .order("title", { ascending: true }),
  ]);

  const rowIds = (rows || []).map((r) => r.id);
  const [{ data: cells }, { data: relations }] = rowIds.length
    ? await Promise.all([
        supabase
          .from("database_cell_values")
          .select("*")
          .in("row_document_id", rowIds),
        supabase
          .from("database_relations")
          .select("*")
          .in("source_row_id", rowIds),
      ])
    : [{ data: [] }, { data: [] }];

  // Load target databases referenced by Relation or Rollup properties
  const typedProps = (properties || []) as DatabaseProperty[];
  const targetDbIds = Array.from(
    new Set(
      typedProps
        .map((p) => p.config?.target_database_id)
        .filter((id): id is string => Boolean(id && uuidSchema.safeParse(id).success))
    )
  );

  const targetDatasets: Record<string, RollupTargetDataset> = {};
  for (const targetDbId of targetDbIds) {
    const [{ data: tProps }, { data: tRows }] = await Promise.all([
      supabase
        .from("database_properties")
        .select("*")
        .eq("database_document_id", targetDbId)
        .order("position", { ascending: true }),
      supabase
        .from("documents")
        .select("id, title")
        .eq("parent_id", targetDbId)
        .eq("is_archived", false)
        .order("position", { ascending: true }),
    ]);
    const tRowIds = (tRows || []).map((r) => r.id);
    const { data: tCells } = tRowIds.length
      ? await supabase
          .from("database_cell_values")
          .select("*")
          .in("row_document_id", tRowIds)
      : { data: [] };

    targetDatasets[targetDbId] = {
      properties: (tProps || []) as DatabaseProperty[],
      rows: (tRows || []) as Array<{ id: string; title: string }>,
      cells: (tCells || []) as DatabaseCellValue[],
    };
  }

  return {
    database: database as DocumentRecord,
    properties: typedProps,
    views: (views || []) as DatabaseView[],
    rows: (rows || []) as DocumentRecord[],
    cells: (cells || []) as DatabaseCellValue[],
    relations: (relations || []) as DatabaseRelationLink[],
    members: (members || []) as Pick<
      Profile,
      "id" | "email" | "display_name" | "avatar_url"
    >[],
    allDatabases: (allDatabases || []) as Array<{
      id: string;
      title: string;
      icon: string | null;
    }>,
    targetDatasets,
  };
}

export async function createDatabasePropertyAction(input: {
  databaseDocumentId: string;
  name: string;
  type: PropertyType;
  config?: PropertyConfig;
}): Promise<DatabaseProperty> {
  const { supabase } = await requireUser();
  const { data: last } = await supabase
    .from("database_properties")
    .select("position")
    .eq("database_document_id", input.databaseDocumentId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const defaultConfig: PropertyConfig =
    input.config ??
    (input.type === "select" || input.type === "multi_select"
      ? {
          options: [
            { id: "opt_1", label: "Option 1", color: "blue" },
            { id: "opt_2", label: "Option 2", color: "green" },
          ],
        }
      : input.type === "status"
      ? {
          options: [
            { id: "todo", label: "To Do", color: "gray" },
            { id: "in_progress", label: "In Progress", color: "blue" },
            { id: "done", label: "Done", color: "green" },
          ],
        }
      : {});

  const { data, error } = await supabase
    .from("database_properties")
    .insert({
      database_document_id: input.databaseDocumentId,
      name: input.name.trim() || "Property",
      type: input.type,
      config: defaultConfig,
      position: computeFractionalPosition(last?.position ?? null, null),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create property: ${error?.message}`);
  }

  revalidatePath(`/${input.databaseDocumentId}`);
  return data as DatabaseProperty;
}

export async function updateDatabasePropertyAction(input: {
  propertyId: string;
  databaseDocumentId: string;
  name?: string;
  type?: PropertyType;
  config?: PropertyConfig;
}): Promise<DatabaseProperty> {
  const { supabase } = await requireUser();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || "Property";
  if (input.type !== undefined) patch.type = input.type;
  if (input.config !== undefined) patch.config = input.config;

  const { data, error } = await supabase
    .from("database_properties")
    .update(patch)
    .eq("id", input.propertyId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update property: ${error?.message}`);
  }

  revalidatePath(`/${input.databaseDocumentId}`);
  return data as DatabaseProperty;
}

export async function deleteDatabasePropertyAction(
  propertyId: string,
  databaseDocumentId: string
): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("database_properties")
    .delete()
    .eq("id", propertyId);
  if (error) {
    throw new Error(`Failed to delete property: ${error.message}`);
  }
  revalidatePath(`/${databaseDocumentId}`);
}

export async function createDatabaseViewAction(input: {
  databaseDocumentId: string;
  name: string;
  type: ViewType;
  groupByPropertyId?: string | null;
  calendarDatePropertyId?: string | null;
}): Promise<DatabaseView> {
  const { supabase } = await requireUser();
  const { data: last } = await supabase
    .from("database_views")
    .select("position")
    .eq("database_document_id", input.databaseDocumentId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("database_views")
    .insert({
      database_document_id: input.databaseDocumentId,
      name: input.name.trim() || input.type,
      type: input.type,
      group_by_property_id: input.groupByPropertyId ?? null,
      calendar_date_property_id: input.calendarDatePropertyId ?? null,
      position: computeFractionalPosition(last?.position ?? null, null),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create view: ${error?.message}`);
  }

  revalidatePath(`/${input.databaseDocumentId}`);
  return data as DatabaseView;
}

export async function updateDatabaseViewAction(input: {
  viewId: string;
  databaseDocumentId: string;
  patch: {
    name?: string;
    type?: ViewType;
    filters?: FilterRule[];
    sorts?: SortRule[];
    group_by_property_id?: string | null;
    calendar_date_property_id?: string | null;
    visible_properties?: string[];
  };
}): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("database_views")
    .update(input.patch)
    .eq("id", input.viewId);

  if (error) {
    throw new Error(`Failed to update database view: ${error.message}`);
  }
  revalidatePath(`/${input.databaseDocumentId}`);
}

export async function deleteDatabaseViewAction(
  viewId: string,
  databaseDocumentId: string
): Promise<void> {
  const { supabase } = await requireUser();
  await supabase.from("database_views").delete().eq("id", viewId);
  revalidatePath(`/${databaseDocumentId}`);
}

export async function createDatabaseRowAction(input: {
  databaseDocumentId: string;
  title?: string;
  initialCells?: Array<{
    propertyId: string;
    value_text?: string | null;
    value_date_start?: string | null;
    value_json?: unknown | null;
  }>;
}): Promise<{ row: DocumentRecord; cells: DatabaseCellValue[] }> {
  const { supabase, user } = await requireUser();

  const { data: last } = await supabase
    .from("documents")
    .select("position")
    .eq("parent_id", input.databaseDocumentId)
    .eq("is_archived", false)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: row, error } = await supabase
    .from("documents")
    .insert({
      parent_id: input.databaseDocumentId,
      title: input.title?.trim() || "Untitled Item",
      icon: "📄",
      position: computeFractionalPosition(last?.position ?? null, null),
      is_database: false,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (error || !row) {
    throw new Error(`Failed to create database row: ${error?.message}`);
  }

  let createdCells: DatabaseCellValue[] = [];
  if (input.initialCells && input.initialCells.length > 0) {
    const { data: cellRows } = await supabase
      .from("database_cell_values")
      .upsert(
        input.initialCells.map((c) => ({
          row_document_id: row.id,
          property_id: c.propertyId,
          value_text: c.value_text ?? null,
          value_date_start: c.value_date_start ?? null,
          value_json: c.value_json ?? null,
          updated_at: new Date().toISOString(),
        }))
      )
      .select("*");
    createdCells = (cellRows || []) as DatabaseCellValue[];
  }

  revalidatePath("/", "layout");
  revalidatePath(`/${input.databaseDocumentId}`);
  return { row: row as DocumentRecord, cells: createdCells };
}

export async function upsertDatabaseCellAction(input: {
  databaseDocumentId: string;
  rowDocumentId: string;
  propertyId: string;
  propertyType: PropertyType;
  patch: {
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_date_start?: string | null;
    value_date_end?: string | null;
    value_json?: unknown | null;
  };
}): Promise<DatabaseCellValue> {
  const { supabase, user } = await requireUser();

  if (input.propertyType === "title") {
    const nextTitle = input.patch.value_text?.trim() || "Untitled";
    await supabase
      .from("documents")
      .update({
        title: nextTitle,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.rowDocumentId);
  }

  const { data, error } = await supabase
    .from("database_cell_values")
    .upsert(
      {
        row_document_id: input.rowDocumentId,
        property_id: input.propertyId,
        value_text: input.patch.value_text ?? null,
        value_number: input.patch.value_number ?? null,
        value_boolean: input.patch.value_boolean ?? null,
        value_date_start: input.patch.value_date_start ?? null,
        value_date_end: input.patch.value_date_end ?? null,
        value_json: input.patch.value_json ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "row_document_id,property_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update cell value: ${error?.message}`);
  }

  revalidatePath(`/${input.databaseDocumentId}`);
  return data as DatabaseCellValue;
}

export async function toggleDatabaseRelationAction(input: {
  databaseDocumentId: string;
  sourceRowId: string;
  propertyId: string;
  targetRowId: string;
  linked: boolean;
}): Promise<void> {
  const { supabase } = await requireUser();

  if (input.linked) {
    const { error } = await supabase.from("database_relations").upsert(
      {
        source_row_id: input.sourceRowId,
        property_id: input.propertyId,
        target_row_id: input.targetRowId,
      },
      { onConflict: "source_row_id,property_id,target_row_id" }
    );
    if (error) throw new Error(`Failed to link relation: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("database_relations")
      .delete()
      .eq("source_row_id", input.sourceRowId)
      .eq("property_id", input.propertyId)
      .eq("target_row_id", input.targetRowId);
    if (error) throw new Error(`Failed to unlink relation: ${error.message}`);
  }

  revalidatePath(`/${input.databaseDocumentId}`);
}
