"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Search,
  Settings,
  Shield,
  LogOut,
  Database,
  FileText,
  Lock,
  GripVertical,
  CornerDownRight,
} from "lucide-react";
import {
  createDocumentAction,
  moveDocumentAction,
  archiveDocumentAction,
} from "@/actions/document.actions";
import { signOutAction } from "@/actions/auth.actions";
import {
  buildDocumentTree,
  computeFractionalPosition,
  wouldCreateCycle,
  type DocumentTreeNode,
} from "@/lib/tree";
import { useWorkspace } from "@/components/navigation/WorkspaceContext";
import { cn } from "@/lib/utils";

interface SortableTreeRowProps {
  node: DocumentTreeNode;
  activeDocId?: string;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onArchive: (id: string) => void;
  unlockedTitles: Record<string, string>;
  dropAsChildTargetId: string | null;
}

function SortableTreeRow({
  node,
  activeDocId,
  expandedIds,
  toggleExpand,
  onCreateChild,
  onArchive,
  unlockedTitles,
  dropAsChildTargetId,
}: SortableTreeRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isActive = activeDocId === node.id;
  const isNestTarget = dropAsChildTargetId === node.id;
  const displayTitle = node.is_vault_encrypted
    ? unlockedTitles[node.id] || "🔒 Encrypted Vault Page"
    : node.title || "Untitled";

  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ ...style, paddingLeft: `${8 + node.depth * 14}px` }}
        className={cn(
          "group flex h-8 items-center gap-1 rounded-md pr-1.5 text-sm transition-colors",
          isActive
            ? "bg-accent font-medium text-foreground"
            : "text-secondary-foreground hover:bg-accent/60",
          isDragging && "opacity-40",
          isNestTarget && "ring-1 ring-ring bg-ring/10"
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${displayTitle}`}
          className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100"
        >
          <GripVertical className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={() => toggleExpand(node.id)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted",
            !hasChildren && "opacity-30"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <Link
          href={`/${node.id}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-1"
        >
          <span className="shrink-0 text-sm leading-none">
            {node.icon ? (
              node.icon
            ) : node.is_database ? (
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
            ) : node.is_vault_encrypted ? (
              <Lock className="h-3.5 w-3.5 text-amber-600" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
          <span className="truncate">{displayTitle}</span>
        </Link>

        {isNestTarget && (
          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-ring" />
        )}

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Add nested page"
            onClick={(e) => {
              e.preventDefault();
              onCreateChild(node.id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Move to Trash"
            onClick={(e) => {
              e.preventDefault();
              onArchive(node.id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <SortableTreeRow
              key={child.id}
              node={child}
              activeDocId={activeDocId}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onCreateChild={onCreateChild}
              onArchive={onArchive}
              unlockedTitles={unlockedTitles}
              dropAsChildTargetId={dropAsChildTargetId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarTree() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ documentId?: string }>();
  const activeDocId = params?.documentId;

  const { items, setItems, unlockedTitles, setSearchOpen, currentUser } =
    useWorkspace();

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of items) {
      if (item.parent_id) initial.add(item.parent_id);
    }
    return initial;
  });
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropAsChildTargetId, setDropAsChildTargetId] = React.useState<
    string | null
  >(null);

  const treeNodes = React.useMemo(() => buildDocumentTree(items), [items]);

  const flatVisibleIds = React.useMemo(() => {
    const ids: string[] = [];
    function walk(nodes: DocumentTreeNode[]) {
      for (const n of nodes) {
        ids.push(n.id);
        if (n.children.length > 0 && expandedIds.has(n.id)) {
          walk(n.children);
        }
      }
    }
    walk(treeNodes);
    return ids;
  }, [treeNodes, expandedIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateDocument(options?: {
    parentId?: string | null;
    isDatabase?: boolean;
  }) {
    const created = await createDocumentAction({
      parentId: options?.parentId ?? null,
      isDatabase: options?.isDatabase ?? false,
    });
    setItems((prev) => [...prev, created]);
    if (options?.parentId) {
      setExpandedIds((prev) => new Set(prev).add(options.parentId!));
    }
    router.push(`/${created.id}`);
  }

  async function handleArchive(documentId: string) {
    setItems((prev) => prev.filter((item) => item.id !== documentId));
    await archiveDocumentAction(documentId);
    if (activeDocId === documentId) {
      router.push("/");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    if (!overId || overId === activeId) {
      setDropAsChildTargetId(null);
      return;
    }

    // Hold Shift while dragging over a node to nest inside it
    const activator = event.activatorEvent as MouseEvent | KeyboardEvent | null;
    const isNestGesture = Boolean(activator && "shiftKey" in activator && activator.shiftKey);

    if (isNestGesture && !wouldCreateCycle(items, activeId, overId)) {
      setDropAsChildTargetId(overId);
    } else {
      setDropAsChildTargetId(null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const nestTarget = dropAsChildTargetId;

    setDraggingId(null);
    setDropAsChildTargetId(null);

    if (!overId || activeId === overId) return;

    const activeItem = items.find((i) => i.id === activeId);
    const overItem = items.find((i) => i.id === overId);
    if (!activeItem || !overItem) return;

    let targetParentId: string | null = overItem.parent_id;
    let newPosition: number;

    if (nestTarget === overId && !wouldCreateCycle(items, activeId, overId)) {
      targetParentId = overId;
      const childrenOfTarget = items
        .filter((i) => i.parent_id === overId && i.id !== activeId)
        .sort((a, b) => a.position - b.position);
      const lastChild = childrenOfTarget[childrenOfTarget.length - 1];
      newPosition = computeFractionalPosition(lastChild?.position ?? null, null);
      setExpandedIds((prev) => new Set(prev).add(overId));
    } else {
      if (wouldCreateCycle(items, activeId, targetParentId)) return;

      const siblings = items
        .filter((i) => i.parent_id === targetParentId && i.id !== activeId)
        .sort((a, b) => a.position - b.position);

      const overIndex = siblings.findIndex((i) => i.id === overId);
      const activeOriginalIndex = items.findIndex((i) => i.id === activeId);
      const overOriginalIndex = items.findIndex((i) => i.id === overId);
      const movingDown = activeOriginalIndex < overOriginalIndex;

      if (movingDown) {
        const before = siblings[overIndex];
        const after = siblings[overIndex + 1];
        newPosition = computeFractionalPosition(
          before?.position ?? null,
          after?.position ?? null
        );
      } else {
        const before = siblings[overIndex - 1];
        const after = siblings[overIndex];
        newPosition = computeFractionalPosition(
          before?.position ?? null,
          after?.position ?? null
        );
      }
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === activeId
          ? { ...item, parent_id: targetParentId, position: newPosition }
          : item
      )
    );

    try {
      await moveDocumentAction(activeId, targetParentId, newPosition);
    } catch (err) {
      console.error("[sidebar] move failed:", err);
      router.refresh();
    }
  }

  return (
    <div className="flex h-full flex-col justify-between select-none">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Workspace Header */}
        <div className="flex items-center justify-between px-3 py-3">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
              W
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-none">
                WHAT-WHERE
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {currentUser.displayName}
              </p>
            </div>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="space-y-0.5 px-2 pb-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-8 w-full items-center justify-between rounded-md px-2 text-sm text-secondary-foreground hover:bg-accent"
          >
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              Search
            </span>
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => void handleCreateDocument({ isDatabase: false })}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-secondary-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            New Page
          </button>
          <button
            type="button"
            onClick={() => void handleCreateDocument({ isDatabase: true })}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-secondary-foreground hover:bg-accent"
          >
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            New Database
          </button>
        </div>

        {/* Recursive Document Tree */}
        <div className="px-3 pb-1 pt-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Pages
          </span>
          {draggingId && (
            <span className="ml-2 text-[10px] text-muted-foreground">
              Hold Shift to nest
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={(e) => void handleDragEnd(e)}
          >
            <SortableContext
              items={flatVisibleIds}
              strategy={verticalListSortingStrategy}
            >
              {treeNodes.map((node) => (
                <SortableTreeRow
                  key={node.id}
                  node={node}
                  activeDocId={activeDocId}
                  expandedIds={expandedIds}
                  toggleExpand={toggleExpand}
                  onCreateChild={(parentId) =>
                    void handleCreateDocument({ parentId })
                  }
                  onArchive={(id) => void handleArchive(id)}
                  unlockedTitles={unlockedTitles}
                  dropAsChildTargetId={dropAsChildTargetId}
                />
              ))}
            </SortableContext>
          </DndContext>

          {treeNodes.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No pages yet. Create your first page above.
            </p>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="space-y-0.5 border-t border-border p-2">
        <Link
          href="/trash"
          className={cn(
            "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-secondary-foreground hover:bg-accent",
            pathname === "/trash" && "bg-accent font-medium text-foreground"
          )}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          Trash
        </Link>

        {currentUser.isAdmin && (
          <Link
            href="/settings/members"
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-secondary-foreground hover:bg-accent",
              pathname === "/settings/members" &&
                "bg-accent font-medium text-foreground"
            )}
          >
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            Members & Invites
          </Link>
        )}

        <Link
          href="/settings/security"
          className={cn(
            "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-secondary-foreground hover:bg-accent",
            pathname === "/settings/security" &&
              "bg-accent font-medium text-foreground"
          )}
        >
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          Security & Vault
        </Link>

        <form action={signOutAction}>
          <button
            type="submit"
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}
