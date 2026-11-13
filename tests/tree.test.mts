import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentTree,
  computeFractionalPosition,
  getAncestorChain,
  wouldCreateCycle,
} from "../src/lib/tree.ts";
import type { DocumentTreeItem } from "../src/types/database.ts";

function makeItem(
  id: string,
  parentId: string | null,
  position: number,
  title = id
): DocumentTreeItem {
  return {
    id,
    parent_id: parentId,
    title,
    icon: null,
    position,
    is_database: false,
    is_vault_encrypted: false,
    encrypted_payload: null,
    encryption_iv: null,
    wrapped_dek: null,
    updated_at: "2026-11-14T00:00:00Z",
  };
}

test("buildDocumentTree builds 4-level deep hierarchy sorted by position", () => {
  const items: DocumentTreeItem[] = [
    makeItem("root-b", null, 2000),
    makeItem("root-a", null, 1000),
    makeItem("lvl2", "root-a", 1000),
    makeItem("lvl3", "lvl2", 1000),
    makeItem("lvl4", "lvl3", 1000),
  ];

  const tree = buildDocumentTree(items);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].id, "root-a");
  assert.equal(tree[0].depth, 0);
  assert.equal(tree[0].children[0].id, "lvl2");
  assert.equal(tree[0].children[0].depth, 1);
  assert.equal(tree[0].children[0].children[0].id, "lvl3");
  assert.equal(tree[0].children[0].children[0].depth, 2);
  assert.equal(tree[0].children[0].children[0].children[0].id, "lvl4");
  assert.equal(tree[0].children[0].children[0].children[0].depth, 3);
});

test("wouldCreateCycle prevents moving a node into itself or its descendants", () => {
  const items = [
    makeItem("a", null, 1000),
    makeItem("b", "a", 1000),
    makeItem("c", "b", 1000),
    makeItem("d", null, 2000),
  ];

  assert.equal(wouldCreateCycle(items, "a", "a"), true);
  assert.equal(wouldCreateCycle(items, "a", "c"), true);
  assert.equal(wouldCreateCycle(items, "a", "d"), false);
  assert.equal(wouldCreateCycle(items, "c", null), false);
});

test("getAncestorChain returns ordered breadcrumb chain", () => {
  const items = [
    makeItem("a", null, 1000, "Root"),
    makeItem("b", "a", 1000, "Folder"),
    makeItem("c", "b", 1000, "Leaf"),
  ];

  const chain = getAncestorChain(items, "c");
  assert.deepEqual(
    chain.map((x) => x.title),
    ["Root", "Folder", "Leaf"]
  );
});

test("computeFractionalPosition computes midpoint and boundary positions", () => {
  assert.equal(computeFractionalPosition(null, null), 1000);
  assert.equal(computeFractionalPosition(null, 1000), 500);
  assert.equal(computeFractionalPosition(1000, null), 2000);
  assert.equal(computeFractionalPosition(1000, 2000), 1500);
});
