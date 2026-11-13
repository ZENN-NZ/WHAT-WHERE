"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, Search, Loader2 } from "lucide-react";
import {
  restoreDocumentAction,
  purgeDocumentAction,
} from "@/actions/document.actions";
import { useWorkspace } from "@/components/navigation/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeDate } from "@/lib/utils";

interface ArchivedItem {
  id: string;
  title: string;
  icon: string | null;
  is_database: boolean;
  is_vault_encrypted: boolean;
  archived_at: string | null;
}

export function TrashManager({
  initialItems,
}: {
  initialItems: ArchivedItem[];
}) {
  const router = useRouter();
  const { setItems: setWorkspaceItems } = useWorkspace();
  const [items, setItems] = React.useState<ArchivedItem[]>(initialItems);
  const [filter, setFilter] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, filter]);

  async function handleRestore(id: string) {
    setBusyId(id);
    try {
      await restoreDocumentAction(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handlePurge(id: string) {
    setBusyId(id);
    try {
      await purgeDocumentAction(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setWorkspaceItems((prev) => prev.filter((item) => item.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter archived pages..."
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="divide-y divide-border">
          {filtered.map((item) => {
            const busy = busyId === item.id;
            return (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.icon ? `${item.icon} ` : ""}
                    {item.is_vault_encrypted
                      ? "🔒 Encrypted Vault Page"
                      : item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.is_database ? "Database" : "Page"}
                    {item.archived_at
                      ? ` • Archived ${formatRelativeDate(item.archived_at)}`
                      : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleRestore(item.id)}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Restore
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handlePurge(item.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Forever
                  </Button>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Trash is empty.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
