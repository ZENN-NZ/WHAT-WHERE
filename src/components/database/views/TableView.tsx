"use client";

import * as React from "react";
import { flexRender } from "@tanstack/react-table";
import {
  getCoreRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import { Plus, Settings2 } from "lucide-react";
import { CellEditor } from "@/components/database/CellEditor";
import type { RollupTargetDataset } from "@/lib/database/engine";
import type {
  DatabaseCellValue,
  DatabaseProperty,
  DatabaseRelationLink,
  DocumentRecord,
  Profile,
} from "@/types/database";

interface TableViewProps {
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
  onAddProperty: () => void;
  onEditProperty: (prop: DatabaseProperty) => void;
}

export function TableView({
  rows,
  properties,
  cellMap,
  relations,
  targetDatasets,
  members,
  onCellUpdate,
  onToggleRelation,
  onAddRow,
  onAddProperty,
  onEditProperty,
}: TableViewProps) {
  const columns = React.useMemo<LegacyColumnDef<DocumentRecord>[]>(() => {
    return properties.map((prop) => ({
      id: prop.id,
      header: () => (
        <button
          type="button"
          onClick={() => onEditProperty(prop)}
          className="flex w-full items-center justify-between gap-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">{prop.name}</span>
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase">
            {prop.type}
          </span>
        </button>
      ),
      cell: ({ row }) => (
        <CellEditor
          row={row.original}
          property={prop}
          cellMap={cellMap}
          relations={relations}
          targetDatasets={targetDatasets}
          allProperties={properties}
          members={members}
          onCellUpdate={onCellUpdate}
          onToggleRelation={onToggleRelation}
        />
      ),
    }));
  }, [
    properties,
    cellMap,
    relations,
    targetDatasets,
    members,
    onCellUpdate,
    onToggleRelation,
    onEditProperty,
  ]);

  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-left">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border bg-secondary/40">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="min-w-[160px] border-r border-border px-3 py-2 last:border-r-0"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
              <th className="w-10 px-2 py-2 text-center">
                <button
                  type="button"
                  onClick={onAddProperty}
                  title="Add property"
                  className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
                >
                  <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </th>
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-border">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-secondary/20">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="border-r border-border px-3 py-2 align-middle last:border-r-0"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
              <td className="w-10" />
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={properties.length + 1}
                className="px-4 py-8 text-center text-xs text-muted-foreground"
              >
                No rows match the current filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <button
        type="button"
        onClick={onAddRow}
        className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        New Item
      </button>
    </div>
  );
}
