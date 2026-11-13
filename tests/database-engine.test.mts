import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRollup,
  filterAndSortRows,
  type RollupTargetDataset,
} from "../src/lib/database/engine.ts";
import type {
  DatabaseCellValue,
  DatabaseProperty,
  DatabaseRelationLink,
} from "../src/types/database.ts";

const tasksDoneProp: DatabaseProperty = {
  id: "prop-task-done",
  database_document_id: "db-tasks",
  name: "Done",
  type: "checkbox",
  config: {},
  position: 1000,
  created_at: "2026-11-14T00:00:00Z",
};

const tasksPointsProp: DatabaseProperty = {
  id: "prop-task-pts",
  database_document_id: "db-tasks",
  name: "Points",
  type: "number",
  config: {},
  position: 2000,
  created_at: "2026-11-14T00:00:00Z",
};

const targetDataset: RollupTargetDataset = {
  properties: [tasksDoneProp, tasksPointsProp],
  rows: [
    { id: "task-1", title: "Setup Auth" },
    { id: "task-2", title: "Build Vault" },
    { id: "task-3", title: "Ship UI" },
  ],
  cells: [
    {
      row_document_id: "task-1",
      property_id: "prop-task-done",
      value_text: null,
      value_number: null,
      value_boolean: true,
      value_date_start: null,
      value_date_end: null,
      value_json: null,
      updated_at: "2026-11-14T00:00:00Z",
    },
    {
      row_document_id: "task-2",
      property_id: "prop-task-done",
      value_text: null,
      value_number: null,
      value_boolean: true,
      value_date_start: null,
      value_date_end: null,
      value_json: null,
      updated_at: "2026-11-14T00:00:00Z",
    },
    {
      row_document_id: "task-3",
      property_id: "prop-task-done",
      value_text: null,
      value_number: null,
      value_boolean: false,
      value_date_start: null,
      value_date_end: null,
      value_json: null,
      updated_at: "2026-11-14T00:00:00Z",
    },
    {
      row_document_id: "task-1",
      property_id: "prop-task-pts",
      value_text: null,
      value_number: 5,
      value_boolean: null,
      value_date_start: null,
      value_date_end: null,
      value_json: null,
      updated_at: "2026-11-14T00:00:00Z",
    },
    {
      row_document_id: "task-2",
      property_id: "prop-task-pts",
      value_text: null,
      value_number: 3,
      value_boolean: null,
      value_date_start: null,
      value_date_end: null,
      value_json: null,
      updated_at: "2026-11-14T00:00:00Z",
    },
  ],
};

const relations: DatabaseRelationLink[] = [
  { source_row_id: "proj-1", property_id: "prop-rel", target_row_id: "task-1" },
  { source_row_id: "proj-1", property_id: "prop-rel", target_row_id: "task-2" },
  { source_row_id: "proj-1", property_id: "prop-rel", target_row_id: "task-3" },
];

test("evaluateRollup calculates percent_checked, sum, and count across related rows", () => {
  const pctProp: DatabaseProperty = {
    id: "prop-rollup-pct",
    database_document_id: "db-projects",
    name: "Completion",
    type: "rollup",
    config: {
      relation_property_id: "prop-rel",
      target_database_id: "db-tasks",
      target_property_id: "prop-task-done",
      aggregation: "percent_checked",
    },
    position: 3000,
    created_at: "2026-11-14T00:00:00Z",
  };

  const pct = evaluateRollup({
    rowId: "proj-1",
    property: pctProp,
    relations,
    targetDataset,
  });
  assert.equal(pct.display, "67%");
  assert.equal(pct.numericValue, 67);

  const sumProp: DatabaseProperty = {
    ...pctProp,
    id: "prop-rollup-sum",
    config: {
      relation_property_id: "prop-rel",
      target_database_id: "db-tasks",
      target_property_id: "prop-task-pts",
      aggregation: "sum",
    },
  };
  const sum = evaluateRollup({
    rowId: "proj-1",
    property: sumProp,
    relations,
    targetDataset,
  });
  assert.equal(sum.display, "8");
  assert.equal(sum.numericValue, 8);
});

test("filterAndSortRows filters by status and sorts descending by number", () => {
  const titleProp: DatabaseProperty = {
    id: "p-title",
    database_document_id: "db-1",
    name: "Name",
    type: "title",
    config: {},
    position: 1000,
    created_at: "2026-11-14T00:00:00Z",
  };
  const scoreProp: DatabaseProperty = {
    id: "p-score",
    database_document_id: "db-1",
    name: "Score",
    type: "number",
    config: {},
    position: 2000,
    created_at: "2026-11-14T00:00:00Z",
  };

  const rows = [
    { id: "r1", title: "Alpha", position: 1000 },
    { id: "r2", title: "Beta", position: 2000 },
    { id: "r3", title: "Alpha Two", position: 3000 },
  ];

  const cells: DatabaseCellValue[] = [
    {
      row_document_id: "r1",
      property_id: "p-score",
      value_text: null,
      value_number: 10,
      value_boolean: null,
      value_date_start: null,
      value_date_end: null,
      value_json: null,
      updated_at: "2026-11-14T00:00:00Z",
    },
    {
      row_document_id: "r3",
      property_id: "p-score",
      value_text: null,
      value_number: 42,
      value_boolean: null,
      value_date_start: null,
      value_date_end: null,
      value_json: null,
      updated_at: "2026-11-14T00:00:00Z",
    },
  ];

  const result = filterAndSortRows({
    rows,
    properties: [titleProp, scoreProp],
    cells,
    relations: [],
    targetDatasetsByDbId: new Map(),
    filters: [
      { id: "f1", propertyId: "p-title", operator: "contains", value: "alpha" },
    ],
    sorts: [{ propertyId: "p-score", direction: "desc" }],
  });

  assert.deepEqual(
    result.map((r) => r.id),
    ["r3", "r1"]
  );
});
