"use client";

import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { CellEditor } from "@/components/database/CellEditor";
import type { RollupTargetDataset } from "@/lib/database/engine";
import type {
  DatabaseCellValue,
  DatabaseProperty,
  DatabaseRelationLink,
  DocumentRecord,
  Profile,
} from "@/types/database";

interface GalleryViewProps {
  rows: DocumentRecord[];
  properties: DatabaseProperty[];
  cellMap: Map<string, DatabaseCellValue>;
  relations: DatabaseRelationLink[];
  targetDatasets: Record<string, RollupTargetDataset>;
  members: Pick<Profile, "id" | "email" | "display_name" | "avatar_url">[];
  onCellUpdate: (
    rowId: string,
    property: DatabaseProperty,
    patch: {
      value_text?: string | null;
      value_number?: number | null;
      value_boolean?: boolean | null;
      value_date_start?: string | null;
      value_date_end?: string | null;
      value_json?: unknown | null;
    }
  ) => void;
  onToggleRelation: (
    sourceRowId: string,
    propertyId: string,
    targetRowId: string,
    linked: boolean
  ) => void;
  onAddRow: () => void;
}

export function GalleryView({
  rows,
  properties,
  cellMap,
  relations,
  targetDatasets,
  members,
  onCellUpdate,
  onToggleRelation,
  onAddRow,
}: GalleryViewProps) {
  const previewProps = properties.filter((p) => p.type !== "title").slice(0, 4);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-shadow hover:shadow-sm"
        >
          <Link
            href={`/${row.id}`}
            className="flex h-28 items-center justify-center border-b border-border bg-secondary/40 text-3xl"
          >
            {row.icon || <FileText className="h-7 w-7 text-muted-foreground" />}
          </Link>

          <div className="flex flex-1 flex-col p-3.5">
            <Link
              href={`/${row.id}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {row.title || "Untitled"}
            </Link>

            <div className="mt-3 space-y-2">
              {previewProps.map((prop) => (
                <div
                  key={prop.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {prop.name}
                  </span>
                  <div className="min-w-0">
                    <CellEditor
                      row={row}
                      property={prop}
                      cellMap={cellMap}
                      relations={relations}
                      targetDatasets={targetDatasets}
                      allProperties={properties}
                      members={members}
                      onCellUpdate={onCellUpdate}
                      onToggleRelation={onToggleRelation}
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAddRow}
        className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      >
        <Plus className="h-5 w-5" />
        New Card
      </button>
    </div>
  );
}
