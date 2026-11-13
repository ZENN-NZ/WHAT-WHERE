import { notFound } from "next/navigation";
import { getDocumentByIdAction } from "@/actions/document.actions";
import {
  getBacklinksAction,
  listCommentsAction,
  listDocumentVersionsAction,
} from "@/actions/collaboration.actions";
import { DocumentWorkspaceView } from "@/components/editor/DocumentWorkspaceView";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const doc = await getDocumentByIdAction(documentId);

  if (!doc) {
    notFound();
  }

  if (doc.is_database) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-3xl">{doc.icon || "🗂️"}</span>
          <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Structured Database initialized. Stage 05 will render Table, Kanban,
          Calendar, and Gallery views here.
        </p>
      </div>
    );
  }

  const [backlinks, comments, versions] = await Promise.all([
    getBacklinksAction(documentId),
    listCommentsAction(documentId),
    listDocumentVersionsAction(documentId),
  ]);

  return (
    <DocumentWorkspaceView
      document={doc}
      backlinks={backlinks}
      comments={comments}
      versions={versions}
    />
  );
}
