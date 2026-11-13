"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Link2 } from "lucide-react";
import {
  evaluateRollup,
  getCellKey,
  type RollupTargetDataset,
} from "@/lib/database/engine";
import type {
  DatabaseCellValue,
  DatabaseProperty,
  DatabaseRelationLink,
  DocumentRecord,
  Profile,
} from "@/types/database";
import { Badge } from "@/components/ui/badge";

interface CellEditorProps {
  row: DocumentRecord;
  property: DatabaseProperty;
  cellMap: Map<string, DatabaseCellValue>;
  relations: DatabaseRelationLink[];
  targetDatasets: Record<string, RollupTargetDataset>;
  allProperties: DatabaseProperty[];
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
  compact?: boolean;
}

const OPTION_COLOR_CLASSES: Record<string, string> = {
  gray: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

export function CellEditor({
  row,
  property,
  cellMap,
  relations,
  targetDatasets,
  allProperties,
  members,
  onCellUpdate,
  onToggleRelation,
  compact = false,
}: CellEditorProps) {
  const cell = cellMap.get(getCellKey(row.id, property.id));
  const [relationOpen, setRelationOpen] = React.useState(false);

  if (property.type === "title") {
    return (
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          defaultValue={row.title}
          onBlur={(e) => {
            const next = e.target.value.trim() || "Untitled";
            if (next !== row.title) {
              onCellUpdate(row.id, property, { value_text: next });
            }
          }}
          className="w-full min-w-[140px] bg-transparent text-sm font-medium outline-none focus:ring-1 focus:ring-ring rounded px-1"
        />
        {!compact && (
          <Link
            href={`/${row.id}`}
            className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Open
          </Link>
        )}
      </div>
    );
  }

  if (property.type === "text") {
    return (
      <input
        type="text"
        defaultValue={cell?.value_text || ""}
        placeholder="—"
        onBlur={(e) => {
          const val = e.target.value;
          if (val !== (cell?.value_text || "")) {
            onCellUpdate(row.id, property, { value_text: val || null });
          }
        }}
        className="w-full bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5"
      />
    );
  }

  if (property.type === "number") {
    return (
      <input
        type="number"
        step="any"
        defaultValue={cell?.value_number ?? ""}
        placeholder="0"
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const num = raw === "" ? null : Number(raw);
          if (num !== (cell?.value_number ?? null)) {
            onCellUpdate(row.id, property, {
              value_number: Number.isFinite(num as number) ? num : null,
            });
          }
        }}
        className="w-full bg-transparent text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5"
      />
    );
  }

  if (property.type === "checkbox") {
    return (
      <input
        type="checkbox"
        aria-label={property.name}
        checked={Boolean(cell?.value_boolean)}
        onChange={(e) =>
          onCellUpdate(row.id, property, { value_boolean: e.target.checked })
        }
        className="h-4 w-4 cursor-pointer accent-primary"
      />
    );
  }

  if (property.type === "url") {
    const urlVal = cell?.value_text || "";
    return (
      <div className="flex items-center gap-1">
        <input
          type="url"
          defaultValue={urlVal}
          placeholder="https://..."
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (val !== urlVal) {
              onCellUpdate(row.id, property, { value_text: val || null });
            }
          }}
          className="w-full bg-transparent text-xs text-blue-600 dark:text-blue-400 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5"
        />
        {urlVal && (
          <a
            href={urlVal}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Open URL"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  if (property.type === "date") {
    const dateVal = cell?.value_date_start
      ? cell.value_date_start.slice(0, 10)
      : "";
    return (
      <input
        type="date"
        value={dateVal}
        onChange={(e) =>
          onCellUpdate(row.id, property, {
            value_date_start: e.target.value
              ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString()
              : null,
          })
        }
        className="bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5"
      />
    );
  }

  if (property.type === "select" || property.type === "status") {
    const options = property.config.options || [];
    const selectedId =
      typeof cell?.value_json === "string"
        ? cell.value_json
        : cell?.value_text || "";
    const selectedOpt = options.find((o) => o.id === selectedId);

    return (
      <select
        aria-label={property.name}
        value={selectedId}
        onChange={(e) =>
          onCellUpdate(row.id, property, {
            value_json: e.target.value || null,
            value_text: e.target.value || null,
          })
        }
        className={`h-7 max-w-full rounded px-2 text-xs font-medium outline-none cursor-pointer ${
          selectedOpt
            ? OPTION_COLOR_CLASSES[selectedOpt.color] ||
              OPTION_COLOR_CLASSES.gray
            : "bg-transparent text-muted-foreground"
        }`}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (property.type === "multi_select") {
    const options = property.config.options || [];
    const selectedIds = Array.isArray(cell?.value_json)
      ? (cell.value_json as string[])
      : [];

    return (
      <div className="flex flex-wrap items-center gap-1">
        {options.map((opt) => {
          const active = selectedIds.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                const next = active
                  ? selectedIds.filter((id) => id !== opt.id)
                  : [...selectedIds, opt.id];
                onCellUpdate(row.id, property, { value_json: next });
              }}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-opacity ${
                active
                  ? OPTION_COLOR_CLASSES[opt.color] ||
                    OPTION_COLOR_CLASSES.blue
                  : "border border-dashed border-border text-muted-foreground opacity-60 hover:opacity-100"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (property.type === "person") {
    const selectedPersonId =
      typeof cell?.value_json === "string" ? cell.value_json : "";
    return (
      <select
        aria-label={property.name}
        value={selectedPersonId}
        onChange={(e) =>
          onCellUpdate(row.id, property, {
            value_json: e.target.value || null,
            value_text: e.target.value || null,
          })
        }
        className="h-7 max-w-full rounded bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name || m.email}
          </option>
        ))}
      </select>
    );
  }

  if (property.type === "relation") {
    const targetDbId = property.config.target_database_id;
    const targetDataset = targetDbId ? targetDatasets[targetDbId] : undefined;
    const linkedIds = relations
      .filter((r) => r.source_row_id === row.id && r.property_id === property.id)
      .map((r) => r.target_row_id);
    const linkedSet = new Set(linkedIds);

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setRelationOpen((p) => !p)}
          className="flex flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
        >
          {linkedIds.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Link2 className="h-3 w-3" />
              Link...
            </span>
          ) : (
            linkedIds.map((tid) => {
              const targetRow = targetDataset?.rows.find((r) => r.id === tid);
              return (
                <Badge key={tid} variant="secondary" className="text-[11px]">
                  {targetRow?.title || "Item"}
                </Badge>
              );
            })
          )}
        </button>

        {relationOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-border bg-popover p-2 shadow-lg">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                Link Related Rows
              </span>
              <button
                type="button"
                onClick={() => setRelationOpen(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Done
              </button>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {(targetDataset?.rows || []).map((targetRow) => {
                const isLinked = linkedSet.has(targetRow.id);
                return (
                  <label
                    key={targetRow.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={(e) =>
                        onToggleRelation(
                          row.id,
                          property.id,
                          targetRow.id,
                          e.target.checked
                        )
                      }
                    />
                    <span className="truncate">{targetRow.title}</span>
                  </label>
                );
              })}
              {(!targetDataset || targetDataset.rows.length === 0) && (
                <p className="py-2 text-[11px] text-muted-foreground">
                  {targetDbId
                    ? "No rows in target database."
                    : "Configure target database in property settings."}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (property.type === "rollup") {
    const relProp = allProperties.find(
      (p) => p.id === property.config.relation_property_id
    );
    const targetDbId =
      relProp?.config.target_database_id || property.config.target_database_id;
    const targetDataset = targetDbId ? targetDatasets[targetDbId] : undefined;

    const result = evaluateRollup({
      rowId: row.id,
      property,
      relations,
      targetDataset,
    });

    return (
      <span className="inline-flex items-center rounded bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-secondary-foreground">
        {result.display}
      </span>
    );
  }

  return null;
}
