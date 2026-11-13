"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createDatabasePropertyAction,
  deleteDatabasePropertyAction,
  updateDatabasePropertyAction,
} from "@/actions/database.actions";
import type {
  DatabaseProperty,
  PropertyConfig,
  PropertyType,
  RollupAggregation,
  SelectOption,
} from "@/types/database";
import type { RollupTargetDataset } from "@/lib/database/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PROPERTY_TYPES: Array<{ value: PropertyType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi-Select" },
  { value: "status", label: "Status" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "person", label: "Person" },
  { value: "relation", label: "Relation" },
  { value: "rollup", label: "Rollup" },
];

const ROLLUP_AGGREGATIONS: Array<{ value: RollupAggregation; label: string }> =
  [
    { value: "count", label: "Count all" },
    { value: "count_values", label: "Count values" },
    { value: "sum", label: "Sum" },
    { value: "average", label: "Average" },
    { value: "min", label: "Min" },
    { value: "max", label: "Max" },
    { value: "percent_checked", label: "Percent checked / done" },
    { value: "percent_unchecked", label: "Percent unchecked" },
    { value: "show_original", label: "Show original values" },
  ];

interface PropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseDocumentId: string;
  editingProperty?: DatabaseProperty | null;
  allProperties: DatabaseProperty[];
  allDatabases: Array<{ id: string; title: string; icon: string | null }>;
  targetDatasets: Record<string, RollupTargetDataset>;
  onSaved: () => void;
}

export function PropertyConfigDialog({
  open,
  onOpenChange,
  databaseDocumentId,
  editingProperty,
  allProperties,
  allDatabases,
  targetDatasets,
  onSaved,
}: PropertyDialogProps) {
  const [name, setName] = React.useState(editingProperty?.name || "");
  const [type, setType] = React.useState<PropertyType>(
    editingProperty?.type || "text"
  );
  const [optionsText, setOptionsText] = React.useState(
    (editingProperty?.config.options || []).map((o) => o.label).join(", ")
  );
  const [targetDbId, setTargetDbId] = React.useState(
    editingProperty?.config.target_database_id || ""
  );
  const [relationPropId, setRelationPropId] = React.useState(
    editingProperty?.config.relation_property_id || ""
  );
  const [targetPropId, setTargetPropId] = React.useState(
    editingProperty?.config.target_property_id || ""
  );
  const [aggregation, setAggregation] = React.useState<RollupAggregation>(
    editingProperty?.config.aggregation || "count"
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(editingProperty?.name || "");
    setType(editingProperty?.type || "text");
    setOptionsText(
      (editingProperty?.config.options || []).map((o) => o.label).join(", ")
    );
    setTargetDbId(editingProperty?.config.target_database_id || "");
    setRelationPropId(editingProperty?.config.relation_property_id || "");
    setTargetPropId(editingProperty?.config.target_property_id || "");
    setAggregation(editingProperty?.config.aggregation || "count");
  }, [editingProperty, open]);

  const relationProperties = allProperties.filter((p) => p.type === "relation");
  const selectedRelationProp = relationProperties.find(
    (p) => p.id === relationPropId
  );
  const rollupTargetDbId = selectedRelationProp?.config.target_database_id;
  const rollupTargetProps = rollupTargetDbId
    ? targetDatasets[rollupTargetDbId]?.properties || []
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const config: PropertyConfig = {};

      if (type === "select" || type === "multi_select" || type === "status") {
        const colors = ["gray", "blue", "green", "amber", "purple", "red"];
        const labels = optionsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const existingOpts = editingProperty?.config.options || [];
        const options: SelectOption[] = labels.map((label, idx) => {
          const matched = existingOpts.find(
            (o) => o.label.toLowerCase() === label.toLowerCase()
          );
          return (
            matched || {
              id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `opt_${idx}`,
              label,
              color: colors[idx % colors.length],
            }
          );
        });
        config.options = options;
      }

      if (type === "relation") {
        config.target_database_id = targetDbId || undefined;
      }

      if (type === "rollup") {
        config.relation_property_id = relationPropId || undefined;
        config.target_database_id = rollupTargetDbId || undefined;
        config.target_property_id = targetPropId || undefined;
        config.aggregation = aggregation;
      }

      if (editingProperty) {
        await updateDatabasePropertyAction({
          propertyId: editingProperty.id,
          databaseDocumentId,
          name,
          type: editingProperty.type === "title" ? "title" : type,
          config,
        });
      } else {
        await createDatabasePropertyAction({
          databaseDocumentId,
          name,
          type,
          config,
        });
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingProperty || editingProperty.type === "title") return;
    setSaving(true);
    try {
      await deleteDatabasePropertyAction(editingProperty.id, databaseDocumentId);
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingProperty ? `Edit "${editingProperty.name}"` : "Add Property"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Property Name
            </label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priority, Project, Progress"
            />
          </div>

          {editingProperty?.type !== "title" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Property Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PropertyType)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(type === "select" || type === "multi_select" || type === "status") && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Options (comma-separated)
              </label>
              <Input
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="To Do, In Progress, Done"
              />
            </div>
          )}

          {type === "relation" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Target Database
              </label>
              <select
                required
                value={targetDbId}
                onChange={(e) => setTargetDbId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a database...</option>
                {allDatabases.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.icon ? `${db.icon} ` : ""}
                    {db.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === "rollup" && (
            <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Relation Property
                </label>
                <select
                  required
                  value={relationPropId}
                  onChange={(e) => setRelationPropId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose relation...</option>
                  {relationProperties.map((rp) => (
                    <option key={rp.id} value={rp.id}>
                      {rp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Target Property
                </label>
                <select
                  value={targetPropId}
                  onChange={(e) => setTargetPropId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select target property...</option>
                  {rollupTargetProps.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name} ({tp.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Aggregation
                </label>
                <select
                  value={aggregation}
                  onChange={(e) =>
                    setAggregation(e.target.value as RollupAggregation)
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ROLLUP_AGGREGATIONS.map((agg) => (
                    <option key={agg.value} value={agg.value}>
                      {agg.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {editingProperty && editingProperty.type !== "title" ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void handleDelete()}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <Button type="submit" disabled={saving}>
              <Plus className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Property"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
