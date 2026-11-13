"use client";

import * as React from "react";
import { ArrowUpDown, Filter, Plus, X } from "lucide-react";
import type { DatabaseProperty, FilterRule, SortRule } from "@/types/database";
import { Button } from "@/components/ui/button";

interface FilterSortBarProps {
  properties: DatabaseProperty[];
  filters: FilterRule[];
  sorts: SortRule[];
  onChangeFilters: (next: FilterRule[]) => void;
  onChangeSorts: (next: SortRule[]) => void;
}

export function FilterSortBar({
  properties,
  filters,
  sorts,
  onChangeFilters,
  onChangeSorts,
}: FilterSortBarProps) {
  const [openFilters, setOpenFilters] = React.useState(false);
  const [openSorts, setOpenSorts] = React.useState(false);

  function addFilter() {
    const firstProp = properties[0];
    if (!firstProp) return;
    onChangeFilters([
      ...filters,
      {
        id: crypto.randomUUID(),
        propertyId: firstProp.id,
        operator: "contains",
        value: "",
      },
    ]);
    setOpenFilters(true);
  }

  function addSort() {
    const firstProp = properties[0];
    if (!firstProp) return;
    onChangeSorts([
      ...sorts,
      { propertyId: firstProp.id, direction: "asc" },
    ]);
    setOpenSorts(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={filters.length > 0 ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setOpenFilters((p) => !p)}
          className="h-7 text-xs"
        >
          <Filter className="h-3.5 w-3.5" />
          Filter {filters.length > 0 ? `(${filters.length})` : ""}
        </Button>

        <Button
          variant={sorts.length > 0 ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setOpenSorts((p) => !p)}
          className="h-7 text-xs"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort {sorts.length > 0 ? `(${sorts.length})` : ""}
        </Button>
      </div>

      {openFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 p-2">
          {filters.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs"
            >
              <select
                value={rule.propertyId}
                onChange={(e) =>
                  onChangeFilters(
                    filters.map((f) =>
                      f.id === rule.id ? { ...f, propertyId: e.target.value } : f
                    )
                  )
                }
                className="bg-transparent outline-none"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={rule.operator}
                onChange={(e) =>
                  onChangeFilters(
                    filters.map((f) =>
                      f.id === rule.id
                        ? {
                            ...f,
                            operator: e.target.value as FilterRule["operator"],
                          }
                        : f
                    )
                  )
                }
                className="bg-transparent text-muted-foreground outline-none"
              >
                <option value="contains">contains</option>
                <option value="not_contains">does not contain</option>
                <option value="equals">equals</option>
                <option value="not_equals">not equals</option>
                <option value="is_empty">is empty</option>
                <option value="is_not_empty">is not empty</option>
                <option value="is_checked">is checked</option>
                <option value="is_not_checked">is unchecked</option>
                <option value="gt">&gt;</option>
                <option value="lt">&lt;</option>
              </select>

              {!["is_empty", "is_not_empty", "is_checked", "is_not_checked"].includes(
                rule.operator
              ) && (
                <input
                  type="text"
                  value={String(rule.value ?? "")}
                  onChange={(e) =>
                    onChangeFilters(
                      filters.map((f) =>
                        f.id === rule.id ? { ...f, value: e.target.value } : f
                      )
                    )
                  }
                  placeholder="Value..."
                  className="w-24 border-b border-border bg-transparent px-1 outline-none"
                />
              )}

              <button
                type="button"
                onClick={() =>
                  onChangeFilters(filters.filter((f) => f.id !== rule.id))
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addFilter}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3" />
            Add Filter
          </Button>
        </div>
      )}

      {openSorts && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 p-2">
          {sorts.map((sort, idx) => (
            <div
              key={`${sort.propertyId}-${idx}`}
              className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs"
            >
              <select
                value={sort.propertyId}
                onChange={(e) =>
                  onChangeSorts(
                    sorts.map((s, i) =>
                      i === idx ? { ...s, propertyId: e.target.value } : s
                    )
                  )
                }
                className="bg-transparent outline-none"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={sort.direction}
                onChange={(e) =>
                  onChangeSorts(
                    sorts.map((s, i) =>
                      i === idx
                        ? { ...s, direction: e.target.value as "asc" | "desc" }
                        : s
                    )
                  )
                }
                className="bg-transparent text-muted-foreground outline-none"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  onChangeSorts(sorts.filter((_, i) => i !== idx))
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addSort}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3" />
            Add Sort
          </Button>
        </div>
      )}
    </div>
  );
}
