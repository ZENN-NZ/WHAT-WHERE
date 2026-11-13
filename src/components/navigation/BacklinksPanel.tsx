import Link from "next/link";
import { ArrowUpRight, FileText, Link2 } from "lucide-react";
import type { BacklinkRecord } from "@/types/database";

export function BacklinksPanel({
  backlinks,
}: {
  backlinks: BacklinkRecord[];
}) {
  return (
    <section className="mt-12 border-t border-border pt-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Backlinks ({backlinks.length})
      </div>

      {backlinks.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No incoming `@page` mentions yet. Mention this page from any other
          page to create a bi-directional link.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {backlinks.map((link) => {
            const src = link.source_document;
            if (!src) return null;
            return (
              <Link
                key={`${link.source_document_id}:${link.block_id}`}
                href={`/${src.id}`}
                className="group flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">
                    {src.icon || <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                  <span className="truncate font-medium">{src.title}</span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
