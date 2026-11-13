"use client";

import * as React from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, FileText } from "lucide-react";
import { CellEditor } from "@/components/database/CellEditor";
import { getCellKey, type RollupTargetDataset } from "@/lib/database/engine";
import type {
  DatabaseCellValue,
  DatabaseProperty,
  DatabaseRelationLink,
  DocumentRecord,
  Profile,
} from "@/types/database";
import { Badge } from "@/components/ui/badge";

interface KanbanViewProps {
  rows: DocumentRecord[];
  properties: DatabaseProperty[];
  groupByProperty?: DatabaseProperty;
  cellMap: Map<string, DatabaseCellValue>;
  relations: DatabaseRelationLink[];
  targetDatasets: Record<string, RollupTargetDataset>;
  members: Pick<Profile, "id" | "email" | "display_name" | "avatar_url">[];
  onMoveCard: (rowId: string, optionId: string | null) => void;
  onAddCard: (optionId: string | null) => void;
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
}

function KanbanColumn({
  id,
  title,
  count,
  onAdd,
  children,
}: {
  id: string;
  title: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border border-border bg-secondary/40 p-2.5 ${
        isOver ? "ring-2 ring-ring" : ""
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{title}</span>
          <Badge variant="secondary" className="text-[10px]">
            {count}
          </Badge>
        </div>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add item to ${title}`}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function KanbanCard({
  row,
  properties,
  groupByPropertyId,
  cellMap,
  relations,
  targetDatasets,
  members,
  onCellUpdate,
  onToggleRelation,
}: {
  row: DocumentRecord;
  properties: DatabaseProperty[];
  groupByPropertyId: string;
  cellMap: Map<string, DatabaseCellValue>;
  relations: DatabaseRelationLink[];
  targetDatasets: Record<string, RollupTargetDataset>;
  members: Pick<Profile, "id" | "email" | "display_name" | "avatar_url">[];
  onCellUpdate: KanbanViewProps["onCellUpdate"];
  onToggleRelation: KanbanViewProps["onToggleRelation"];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: row.id });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const visibleProps = properties
    .filter((p) => p.type !== "title" && p.id !== groupByPropertyId)
    .slice(0, 3);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-md border border-border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <Link
        href={`/${row.id}`}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 text-sm font-medium hover:underline"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{row.title || "Untitled"}</span>
      </Link>

      {visibleProps.length > 0 && (
        <div
          className="mt-2.5 space-y-1.5 border-t border-border pt-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {visibleProps.map((prop) => (
            <div key={prop.id} className="flex items-center justify-between gap-2 text-xs">
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
      )}
    </div>
  );
}

export function KanbanView({
  rows,
  properties,
  groupByProperty,
  cellMap,
  relations,
  targetDatasets,
  members,
  onMoveCard,
  onAddCard,
  onCellUpdate,
  onToggleRelation,
}: KanbanViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  if (!groupByProperty) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Add a <strong>Status</strong> or <strong>Select</strong> property to
        group cards into Kanban columns.
      </div>
    );
  }

  const options = groupByProperty.config.options || [];
  const columns = [
    { id: "__none__", label: "No Value", optionId: null as string | null },
    ...options.map((o) => ({
      id: o.id,
      label: o.label,
      optionId: o.id as string | null,
    })),
  ];

  function getRowGroupId(rowId: string): string {
    const cell = cellMap.get(getCellKey(rowId, groupByProperty!.id));
    const val =
      typeof cell?.value_json === "string"
        ? cell.value_json
        : cell?.value_text;
    if (val && options.some((o) => o.id === val)) return val;
    return "__none__";
  }

  function handleDragEnd(event: DragEndEvent) {
    const rowId = String(event.active.id);
    const colId = event.over ? String(event.over.id) : null;
    if (!colId) return;
    const currentCol = getRowGroupId(rowId);
    if (currentCol === colId) return;
    onMoveCard(rowId, colId === "__none__" ? null : colId);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colRows = rows.filter((r) => getRowGroupId(r.id) === col.id);
          return (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.label}
              count={colRows.length}
              onAdd={() => onAddCard(col.optionId)}
            >
              {colRows.map((row) => (
                <KanbanCard
                  key={row.id}
                  row={row}
                  properties={properties}
                  groupByPropertyId={groupByProperty.id}
                  cellMap={cellMap}
                  relations={relations}
                  targetDatasets={targetDatasets}
                  members={members}
                  onCellUpdate={onCellUpdate}
                  onToggleRelation={onToggleRelation}
                />
              ))}
            </KanbanColumn>
          );
        })}
      </div>
    </DndContext>
  );
}
