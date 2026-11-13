import type {
  DatabaseCellValue,
  DatabaseProperty,
  DatabaseRelationLink,
  DocumentRecord,
  FilterRule,
  RollupAggregation,
  SortRule,
} from "@/types/database";

export interface RollupTargetDataset {
  properties: DatabaseProperty[];
  rows: Pick<DocumentRecord, "id" | "title">[];
  cells: DatabaseCellValue[];
}

export interface RollupResult {
  display: string;
  numericValue: number | null;
}

export function getCellKey(rowId: string, propertyId: string): string {
  return `${rowId}:${propertyId}`;
}

export function evaluateRollup(params: {
  rowId: string;
  property: DatabaseProperty;
  relations: DatabaseRelationLink[];
  targetDataset?: RollupTargetDataset;
}): RollupResult {
  const { rowId, property, relations, targetDataset } = params;
  const relPropId = property.config.relation_property_id;
  const targetPropId = property.config.target_property_id;
  const aggregation: RollupAggregation = property.config.aggregation || "count";

  if (!relPropId) {
    return { display: "—", numericValue: null };
  }

  const linkedTargetIds = relations
    .filter((r) => r.source_row_id === rowId && r.property_id === relPropId)
    .map((r) => r.target_row_id);

  if (aggregation === "count") {
    return {
      display: String(linkedTargetIds.length),
      numericValue: linkedTargetIds.length,
    };
  }

  if (!targetDataset || !targetPropId) {
    return { display: String(linkedTargetIds.length), numericValue: linkedTargetIds.length };
  }

  const targetProp = targetDataset.properties.find((p) => p.id === targetPropId);
  if (!targetProp) {
    return { display: "—", numericValue: null };
  }

  const targetRowMap = new Map(targetDataset.rows.map((r) => [r.id, r]));
  const targetCellMap = new Map(
    targetDataset.cells.map((c) => [getCellKey(c.row_document_id, c.property_id), c])
  );

  if (aggregation === "percent_checked" || aggregation === "percent_unchecked") {
    if (linkedTargetIds.length === 0) {
      return { display: "0%", numericValue: 0 };
    }
    const checkedCount = linkedTargetIds.filter((tid) => {
      const cell = targetCellMap.get(getCellKey(tid, targetPropId));
      if (targetProp.type === "checkbox") {
        return Boolean(cell?.value_boolean);
      }
      if (targetProp.type === "status") {
        const selectedId =
          typeof cell?.value_json === "string"
            ? cell.value_json
            : cell?.value_text;
        return selectedId === "done" || selectedId?.toLowerCase() === "completed";
      }
      return false;
    }).length;

    const pct =
      aggregation === "percent_checked"
        ? Math.round((checkedCount / linkedTargetIds.length) * 100)
        : Math.round(
            ((linkedTargetIds.length - checkedCount) / linkedTargetIds.length) *
              100
          );
    return { display: `${pct}%`, numericValue: pct };
  }

  const rawValues: Array<string | number | boolean> = [];
  for (const tid of linkedTargetIds) {
    if (targetProp.type === "title") {
      const t = targetRowMap.get(tid)?.title;
      if (t) rawValues.push(t);
      continue;
    }
    const cell = targetCellMap.get(getCellKey(tid, targetPropId));
    if (!cell) continue;
    if (targetProp.type === "number" && cell.value_number !== null) {
      rawValues.push(Number(cell.value_number));
    } else if (targetProp.type === "checkbox" && cell.value_boolean !== null) {
      rawValues.push(cell.value_boolean);
    } else if (cell.value_text) {
      rawValues.push(cell.value_text);
    } else if (cell.value_date_start) {
      rawValues.push(cell.value_date_start.slice(0, 10));
    }
  }

  if (aggregation === "count_values") {
    return { display: String(rawValues.length), numericValue: rawValues.length };
  }

  if (aggregation === "show_original") {
    return {
      display: rawValues.length ? rawValues.join(", ") : "—",
      numericValue: null,
    };
  }

  const nums = rawValues
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((n) => Number.isFinite(n));

  if (nums.length === 0) {
    return { display: "0", numericValue: 0 };
  }

  if (aggregation === "sum") {
    const s = nums.reduce((acc, n) => acc + n, 0);
    return { display: formatNumber(s), numericValue: s };
  }
  if (aggregation === "average") {
    const avg = nums.reduce((acc, n) => acc + n, 0) / nums.length;
    return { display: formatNumber(Number(avg.toFixed(2))), numericValue: avg };
  }
  if (aggregation === "min") {
    const m = Math.min(...nums);
    return { display: formatNumber(m), numericValue: m };
  }
  if (aggregation === "max") {
    const m = Math.max(...nums);
    return { display: formatNumber(m), numericValue: m };
  }

  return { display: "—", numericValue: null };
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function getComparableCellValue(params: {
  row: Pick<DocumentRecord, "id" | "title">;
  property: DatabaseProperty;
  cellMap: Map<string, DatabaseCellValue>;
  relations: DatabaseRelationLink[];
  targetDatasetsByDbId: Map<string, RollupTargetDataset>;
}): string | number | boolean | null {
  const { row, property, cellMap, relations, targetDatasetsByDbId } = params;

  if (property.type === "title") {
    return row.title || "";
  }

  if (property.type === "rollup") {
    const relPropId = property.config.relation_property_id;
    const targetDbId = property.config.target_database_id;
    const targetDataset = targetDbId
      ? targetDatasetsByDbId.get(targetDbId)
      : undefined;
    const res = evaluateRollup({
      rowId: row.id,
      property: {
        ...property,
        config: {
          ...property.config,
          relation_property_id: relPropId,
        },
      },
      relations,
      targetDataset,
    });
    return res.numericValue ?? res.display;
  }

  if (property.type === "relation") {
    const linked = relations.filter(
      (r) => r.source_row_id === row.id && r.property_id === property.id
    );
    return linked.length;
  }

  const cell = cellMap.get(getCellKey(row.id, property.id));
  if (!cell) return null;

  switch (property.type) {
    case "number":
      return cell.value_number !== null ? Number(cell.value_number) : null;
    case "checkbox":
      return Boolean(cell.value_boolean);
    case "date":
      return cell.value_date_start ? cell.value_date_start.slice(0, 10) : null;
    case "select":
    case "status":
    case "person":
      return typeof cell.value_json === "string"
        ? cell.value_json
        : cell.value_text;
    case "multi_select":
      return Array.isArray(cell.value_json)
        ? (cell.value_json as string[]).join(",")
        : cell.value_text;
    default:
      return cell.value_text ?? null;
  }
}

export function matchesFilterRule(
  val: string | number | boolean | null,
  rule: FilterRule
): boolean {
  const isEmpty =
    val === null || val === undefined || val === "" || val === false;

  switch (rule.operator) {
    case "is_empty":
      return isEmpty;
    case "is_not_empty":
      return !isEmpty;
    case "is_checked":
      return val === true;
    case "is_not_checked":
      return val !== true;
    case "equals":
      return (
        String(val ?? "").toLowerCase() ===
        String(rule.value ?? "").toLowerCase()
      );
    case "not_equals":
      return (
        String(val ?? "").toLowerCase() !==
        String(rule.value ?? "").toLowerCase()
      );
    case "contains":
      return String(val ?? "")
        .toLowerCase()
        .includes(String(rule.value ?? "").toLowerCase());
    case "not_contains":
      return !String(val ?? "")
        .toLowerCase()
        .includes(String(rule.value ?? "").toLowerCase());
    case "gt":
      return Number(val ?? 0) > Number(rule.value ?? 0);
    case "lt":
      return Number(val ?? 0) < Number(rule.value ?? 0);
    default:
      return true;
  }
}

export function filterAndSortRows<
  TRow extends Pick<DocumentRecord, "id" | "title" | "position">
>(params: {
  rows: TRow[];
  properties: DatabaseProperty[];
  cells: DatabaseCellValue[];
  relations: DatabaseRelationLink[];
  targetDatasetsByDbId: Map<string, RollupTargetDataset>;
  filters: FilterRule[];
  sorts: SortRule[];
}): TRow[] {
  const {
    rows,
    properties,
    cells,
    relations,
    targetDatasetsByDbId,
    filters,
    sorts,
  } = params;

  const propMap = new Map(properties.map((p) => [p.id, p]));
  const cellMap = new Map(
    cells.map((c) => [getCellKey(c.row_document_id, c.property_id), c])
  );

  const filtered = rows.filter((row) => {
    for (const rule of filters) {
      const prop = propMap.get(rule.propertyId);
      if (!prop) continue;
      const val = getComparableCellValue({
        row,
        property: prop,
        cellMap,
        relations,
        targetDatasetsByDbId,
      });
      if (!matchesFilterRule(val, rule)) return false;
    }
    return true;
  });

  if (sorts.length === 0) {
    return [...filtered].sort((a, b) => a.position - b.position);
  }

  return [...filtered].sort((a, b) => {
    for (const sort of sorts) {
      const prop = propMap.get(sort.propertyId);
      if (!prop) continue;
      const va = getComparableCellValue({
        row: a,
        property: prop,
        cellMap,
        relations,
        targetDatasetsByDbId,
      });
      const vb = getComparableCellValue({
        row: b,
        property: prop,
        cellMap,
        relations,
        targetDatasetsByDbId,
      });

      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va ?? "").localeCompare(String(vb ?? ""));
      }

      if (cmp !== 0) {
        return sort.direction === "asc" ? cmp : -cmp;
      }
    }
    return a.position - b.position;
  });
}
