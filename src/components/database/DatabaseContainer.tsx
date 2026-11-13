"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Kanban,
  LayoutGrid,
  Plus,
  Settings2,
  Table as TableIcon,
} from "lucide-react";
import {
  createDatabaseRowAction,
  createDatabaseViewAction,
  toggleDatabaseRelationAction,
  updateDatabaseViewAction,
  upsertDatabaseCellAction,
  type DatabasePayload,
} from "@/actions/database.actions";
import { updateDocumentMetaAction } from "@/actions/document.actions";
import {
  filterAndSortRows,
  getCellKey,
  type RollupTargetDataset,
} from "@/lib/database/engine";
import { FilterSortBar } from "@/components/database/FilterSortBar";
import { PropertyConfigDialog } from "@/components/database/PropertyHeaderMenu";
import { TableView } from "@/components/database/views/TableView";
import { KanbanView } from "@/components/database/views/KanbanView";
import { CalendarView } from "@/components/database/views/CalendarView";
import { GalleryView } from "@/components/database/views/GalleryView";
import { useWorkspace } from "@/components/navigation/WorkspaceContext";
import type {
  DatabaseCellValue,
  DatabaseProperty,
  DatabaseRelationLink,
  DatabaseView,
  DocumentRecord,
  FilterRule,
  SortRule,
  ViewType,
} from "@/types/database";
import { Button } from "@/components/ui/button";

const VIEW_ICONS: Record<ViewType, React.ReactNode> = {
  table: <TableIcon className="h-3.5 w-3.5" />,
  kanban: <Kanban className="h-3.5 w-3.5" />,
  calendar: <Calendar className="h-3.5 w-3.5" />,
  gallery: <LayoutGrid className="h-3.5 w-3.5" />,
};

export function DatabaseContainer({
  payload,
}: {
  payload: DatabasePayload;
}) {
  const router = useRouter();
  const { setItems } = useWorkspace();

  const [title, setTitle] = React.useState(payload.database.title);
  const [views, setViews] = React.useState<DatabaseView[]>(payload.views);
  const [activeViewId, setActiveViewId] = React.useState<string>(
    payload.views[0]?.id || ""
  );
  const [rows, setRows] = React.useState<DocumentRecord[]>(payload.rows);
  const [cells, setCells] = React.useState<DatabaseCellValue[]>(payload.cells);
  const [relations, setRelations] = React.useState<DatabaseRelationLink[]>(
    payload.relations
  );

  const [propDialogOpen, setPropDialogOpen] = React.useState(false);
  const [editingProperty, setEditingProperty] =
    React.useState<DatabaseProperty | null>(null);

  React.useEffect(() => {
    setViews(payload.views);
    setRows(payload.rows);
    setCells(payload.cells);
    setRelations(payload.relations);
    if (!payload.views.some((v) => v.id === activeViewId)) {
      setActiveViewId(payload.views[0]?.id || "");
    }
  }, [payload, activeViewId]);

  const activeView = views.find((v) => v.id === activeViewId) || views[0];

  const cellMap = React.useMemo(
    () =>
      new Map(
        cells.map((c) => [getCellKey(c.row_document_id, c.property_id), c])
      ),
    [cells]
  );

  const targetDatasetsMap = React.useMemo(() => {
    const map = new Map<string, RollupTargetDataset>();
    for (const [k, v] of Object.entries(payload.targetDatasets)) {
      map.set(k, v);
    }
    return map;
  }, [payload.targetDatasets]);

  const processedRows = React.useMemo(() => {
    return filterAndSortRows({
      rows,
      properties: payload.properties,
      cells,
      relations,
      targetDatasetsByDbId: targetDatasetsMap,
      filters: activeView?.filters || [],
      sorts: activeView?.sorts || [],
    });
  }, [
    rows,
    payload.properties,
    cells,
    relations,
    targetDatasetsMap,
    activeView,
  ]);

  const groupByProperty = React.useMemo(() => {
    if (activeView?.group_by_property_id) {
      const explicit = payload.properties.find(
        (p) => p.id === activeView.group_by_property_id
      );
      if (explicit) return explicit;
    }
    return payload.properties.find(
      (p) => p.type === "status" || p.type === "select"
    );
  }, [activeView, payload.properties]);

  const calendarDateProperty = React.useMemo(() => {
    if (activeView?.calendar_date_property_id) {
      const explicit = payload.properties.find(
        (p) => p.id === activeView.calendar_date_property_id
      );
      if (explicit) return explicit;
    }
    return payload.properties.find((p) => p.type === "date");
  }, [activeView, payload.properties]);

  const titleSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  function handleDbTitleChange(next: string) {
    setTitle(next);
    setItems((prev) =>
      prev.map((item) =>
        item.id === payload.database.id
          ? { ...item, title: next || "Untitled Database" }
          : item
      )
    );
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      void updateDocumentMetaAction(payload.database.id, {
        title: next || "Untitled Database",
      });
    }, 500);
  }

  async function handleAddView(type: ViewType) {
    const labelMap: Record<ViewType, string> = {
      table: "Table",
      kanban: "Board",
      calendar: "Calendar",
      gallery: "Gallery",
    };
    const created = await createDatabaseViewAction({
      databaseDocumentId: payload.database.id,
      name: labelMap[type],
      type,
      groupByPropertyId: groupByProperty?.id ?? null,
      calendarDatePropertyId: calendarDateProperty?.id ?? null,
    });
    setViews((prev) => [...prev, created]);
    setActiveViewId(created.id);
  }

  async function handleUpdateFilters(nextFilters: FilterRule[]) {
    if (!activeView) return;
    setViews((prev) =>
      prev.map((v) =>
        v.id === activeView.id ? { ...v, filters: nextFilters } : v
      )
    );
    await updateDatabaseViewAction({
      viewId: activeView.id,
      databaseDocumentId: payload.database.id,
      patch: { filters: nextFilters },
    });
  }

  async function handleUpdateSorts(nextSorts: SortRule[]) {
    if (!activeView) return;
    setViews((prev) =>
      prev.map((v) => (v.id === activeView.id ? { ...v, sorts: nextSorts } : v))
    );
    await updateDatabaseViewAction({
      viewId: activeView.id,
      databaseDocumentId: payload.database.id,
      patch: { sorts: nextSorts },
    });
  }

  async function handleAddRow(
    initialCells?: Array<{
      propertyId: string;
      value_text?: string | null;
      value_date_start?: string | null;
      value_json?: unknown | null;
    }>
  ) {
    const res = await createDatabaseRowAction({
      databaseDocumentId: payload.database.id,
      initialCells,
    });
    setRows((prev) => [...prev, res.row]);
    if (res.cells.length > 0) {
      setCells((prev) => [...prev, ...res.cells]);
    }
  }

  function handleCellUpdate(
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
  ) {
    if (property.type === "title" && patch.value_text !== undefined) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, title: patch.value_text || "Untitled" }
            : r
        )
      );
    }

    const optimistic: DatabaseCellValue = {
      row_document_id: rowId,
      property_id: property.id,
      value_text: patch.value_text ?? null,
      value_number: patch.value_number ?? null,
      value_boolean: patch.value_boolean ?? null,
      value_date_start: patch.value_date_start ?? null,
      value_date_end: patch.value_date_end ?? null,
      value_json: patch.value_json ?? null,
      updated_at: new Date().toISOString(),
    };

    setCells((prev) => {
      const idx = prev.findIndex(
        (c) => c.row_document_id === rowId && c.property_id === property.id
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = optimistic;
        return copy;
      }
      return [...prev, optimistic];
    });

    void upsertDatabaseCellAction({
      databaseDocumentId: payload.database.id,
      rowDocumentId: rowId,
      propertyId: property.id,
      propertyType: property.type,
      patch,
    });
  }

  function handleToggleRelation(
    sourceRowId: string,
    propertyId: string,
    targetRowId: string,
    linked: boolean
  ) {
    setRelations((prev) => {
      if (linked) {
        return [
          ...prev,
          {
            source_row_id: sourceRowId,
            property_id: propertyId,
            target_row_id: targetRowId,
          },
        ];
      }
      return prev.filter(
        (r) =>
          !(
            r.source_row_id === sourceRowId &&
            r.property_id === propertyId &&
            r.target_row_id === targetRowId
          )
      );
    });

    void toggleDatabaseRelationAction({
      databaseDocumentId: payload.database.id,
      sourceRowId,
      propertyId,
      targetRowId,
      linked,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{payload.database.icon || "🗂️"}</span>
        <input
          type="text"
          value={title}
          onChange={(e) => handleDbTitleChange(e.target.value)}
          placeholder="Untitled Database"
          className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none"
        />
      </div>

      {/* View Tabs & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex flex-wrap items-center gap-1">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveViewId(view.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeView?.id === view.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              {VIEW_ICONS[view.type]}
              <span>{view.name}</span>
            </button>
          ))}

          <div className="ml-1 flex items-center gap-1 border-l border-border pl-2">
            {(["table", "kanban", "calendar", "gallery"] as ViewType[]).map(
              (vt) => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => void handleAddView(vt)}
                  title={`Add ${vt} view`}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  <span className="capitalize">{vt}</span>
                </button>
              )
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingProperty(null);
              setPropDialogOpen(true);
            }}
            className="h-8 text-xs"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Add Property
          </Button>
          <Button
            size="sm"
            onClick={() => void handleAddRow()}
            className="h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New Item
          </Button>
        </div>
      </div>

      {activeView && (
        <FilterSortBar
          properties={payload.properties}
          filters={activeView.filters || []}
          sorts={activeView.sorts || []}
          onChangeFilters={(next) => void handleUpdateFilters(next)}
          onChangeSorts={(next) => void handleUpdateSorts(next)}
        />
      )}

      {/* Active View Body */}
      {(!activeView || activeView.type === "table") && (
        <TableView
          rows={processedRows}
          properties={payload.properties}
          cellMap={cellMap}
          relations={relations}
          targetDatasets={payload.targetDatasets}
          members={payload.members}
          onCellUpdate={handleCellUpdate}
          onToggleRelation={handleToggleRelation}
          onAddRow={() => void handleAddRow()}
          onAddProperty={() => {
            setEditingProperty(null);
            setPropDialogOpen(true);
          }}
          onEditProperty={(prop) => {
            setEditingProperty(prop);
            setPropDialogOpen(true);
          }}
        />
      )}

      {activeView?.type === "kanban" && (
        <KanbanView
          rows={processedRows}
          properties={payload.properties}
          groupByProperty={groupByProperty}
          cellMap={cellMap}
          relations={relations}
          targetDatasets={payload.targetDatasets}
          members={payload.members}
          onMoveCard={(rowId, optionId) => {
            if (!groupByProperty) return;
            handleCellUpdate(rowId, groupByProperty, {
              value_json: optionId,
              value_text: optionId,
            });
          }}
          onAddCard={(optionId) => {
            if (!groupByProperty || !optionId) {
              void handleAddRow();
              return;
            }
            void handleAddRow([
              {
                propertyId: groupByProperty.id,
                value_json: optionId,
                value_text: optionId,
              },
            ]);
          }}
          onCellUpdate={handleCellUpdate}
          onToggleRelation={handleToggleRelation}
        />
      )}

      {activeView?.type === "calendar" && (
        <CalendarView
          rows={processedRows}
          dateProperty={calendarDateProperty}
          cellMap={cellMap}
          onAddForDate={(isoDate) => {
            if (!calendarDateProperty) {
              void handleAddRow();
              return;
            }
            void handleAddRow([
              {
                propertyId: calendarDateProperty.id,
                value_date_start: isoDate,
              },
            ]);
          }}
        />
      )}

      {activeView?.type === "gallery" && (
        <GalleryView
          rows={processedRows}
          properties={payload.properties}
          cellMap={cellMap}
          relations={relations}
          targetDatasets={payload.targetDatasets}
          members={payload.members}
          onCellUpdate={handleCellUpdate}
          onToggleRelation={handleToggleRelation}
          onAddRow={() => void handleAddRow()}
        />
      )}

      <PropertyConfigDialog
        open={propDialogOpen}
        onOpenChange={setPropDialogOpen}
        databaseDocumentId={payload.database.id}
        editingProperty={editingProperty}
        allProperties={payload.properties}
        allDatabases={payload.allDatabases}
        targetDatasets={payload.targetDatasets}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
