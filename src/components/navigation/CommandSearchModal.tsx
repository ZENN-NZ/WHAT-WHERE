"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, FileText, Database, Lock, Loader2 } from "lucide-react";
import {
  searchDocumentsAction,
  type SearchDocumentResult,
} from "@/actions/document.actions";
import { useWorkspace } from "@/components/navigation/WorkspaceContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function CommandSearchModal() {
  const router = useRouter();
  const { isSearchOpen, setSearchOpen, items, unlockedTitles } = useWorkspace();

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchDocumentResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Query PostgreSQL Full-Text Search with debounce
  React.useEffect(() => {
    if (!isSearchOpen) return;

    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchDocumentsAction(query);
        if (!cancelled) {
          setResults(res);
        }
      } catch (err) {
        console.error("[search] FTS query error:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 140);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isSearchOpen]);

  // Include client-side decrypted Vault titles when Vault is unlocked
  const unlockedVaultMatches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => item.is_vault_encrypted && unlockedTitles[item.id])
      .filter((item) =>
        q ? unlockedTitles[item.id].toLowerCase().includes(q) : true
      )
      .map((item) => ({
        id: item.id,
        title: unlockedTitles[item.id],
        icon: item.icon,
        is_database: item.is_database,
      }));
  }, [items, unlockedTitles, query]);

  function handleSelect(documentId: string) {
    setSearchOpen(false);
    setQuery("");
    router.push(`/${documentId}`);
  }

  return (
    <Dialog open={isSearchOpen} onOpenChange={setSearchOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search Workspace</DialogTitle>
        <Command shouldFilter={false} className="flex flex-col bg-card">
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, databases, or unlocked Vault titles..."
              className="flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 &&
              unlockedVaultMatches.length === 0 &&
              !isLoading && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No matching pages found.
                </div>
              )}

            {unlockedVaultMatches.length > 0 && (
              <Command.Group
                heading="Unlocked Vault Pages"
                className="px-1 py-1 text-xs font-medium text-muted-foreground"
              >
                {unlockedVaultMatches.map((doc) => (
                  <Command.Item
                    key={`vault-${doc.id}`}
                    value={doc.id}
                    onSelect={() => handleSelect(doc.id)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground aria-selected:bg-accent"
                  >
                    <Lock className="h-3.5 w-3.5 text-amber-600" />
                    <span className="truncate font-medium">{doc.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {results.length > 0 && (
              <Command.Group
                heading={query.trim() ? "Search Results" : "Recent Pages"}
                className="px-1 py-1 text-xs font-medium text-muted-foreground"
              >
                {results.map((doc) => (
                  <Command.Item
                    key={doc.id}
                    value={doc.id}
                    onSelect={() => handleSelect(doc.id)}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground aria-selected:bg-accent"
                  >
                    <span className="mt-0.5 shrink-0">
                      {doc.icon ? (
                        doc.icon
                      ) : doc.is_database ? (
                        <Database className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{doc.title}</p>
                      {doc.plain_text_snippet && (
                        <p className="truncate text-xs text-muted-foreground">
                          {doc.plain_text_snippet}
                        </p>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
