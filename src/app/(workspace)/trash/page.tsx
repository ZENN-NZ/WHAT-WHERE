import { Trash2 } from "lucide-react";
import { listArchivedDocumentsAction } from "@/actions/document.actions";
import { TrashManager } from "@/components/navigation/TrashManager";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const archived = await listArchivedDocumentsAction();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trash</h1>
          <p className="text-sm text-muted-foreground">
            Restore soft-deleted pages or permanently purge them from
            PostgreSQL.
          </p>
        </div>
      </div>

      <TrashManager initialItems={archived} />
    </div>
  );
}
