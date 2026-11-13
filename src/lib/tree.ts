import type { DocumentTreeItem } from "@/types/database";

export interface DocumentTreeNode extends DocumentTreeItem {
  children: DocumentTreeNode[];
  depth: number;
}

export function buildDocumentTree(
  items: DocumentTreeItem[]
): DocumentTreeNode[] {
  const byId = new Map<string, DocumentTreeNode>();
  const roots: DocumentTreeNode[] = [];

  const sorted = [...items].sort((a, b) => a.position - b.position);

  for (const item of sorted) {
    byId.set(item.id, { ...item, children: [], depth: 0 });
  }

  for (const item of sorted) {
    const node = byId.get(item.id)!;
    if (item.parent_id && byId.has(item.parent_id)) {
      byId.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function assignDepth(nodes: DocumentTreeNode[], depth: number) {
    for (const node of nodes) {
      node.depth = depth;
      node.children.sort((a, b) => a.position - b.position);
      assignDepth(node.children, depth + 1);
    }
  }

  assignDepth(roots, 0);
  return roots;
}

export function getAncestorChain(
  items: DocumentTreeItem[],
  documentId: string
): DocumentTreeItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const chain: DocumentTreeItem[] = [];
  const visited = new Set<string>();

  let current = byId.get(documentId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return chain;
}

export function wouldCreateCycle(
  items: DocumentTreeItem[],
  movingId: string,
  targetParentId: string | null
): boolean {
  if (!targetParentId) return false;
  if (movingId === targetParentId) return true;

  const byId = new Map(items.map((item) => [item.id, item]));
  const visited = new Set<string>();
  let cursor: string | null = targetParentId;

  while (cursor && !visited.has(cursor)) {
    if (cursor === movingId) return true;
    visited.add(cursor);
    cursor = byId.get(cursor)?.parent_id ?? null;
  }

  return false;
}

export function computeFractionalPosition(
  beforePos: number | null | undefined,
  afterPos: number | null | undefined
): number {
  const hasBefore = typeof beforePos === "number" && Number.isFinite(beforePos);
  const hasAfter = typeof afterPos === "number" && Number.isFinite(afterPos);

  if (!hasBefore && !hasAfter) return 1000;
  if (!hasBefore && hasAfter) return afterPos! / 2;
  if (hasBefore && !hasAfter) return beforePos! + 1000;
  return (beforePos! + afterPos!) / 2;
}
