import { notFound } from "next/navigation";
import { getDocumentByIdAction } from "@/actions/document.actions";
import {
  getBacklinksAction,
  listCommentsAction,
  listDocumentVersionsAction,
} from "@/actions/collaboration.actions";
import { getDatabasePayloadAction } from "@/actions/database.actions";
import { DocumentWorkspaceView } from "@/components/editor/DocumentWorkspaceView";
import { DatabaseContainer } from "@/components/database/DatabaseContainer";

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
    const dbPayload = await getDatabasePayloadAction(documentId);
    if (!dbPayload) {
      notFound();
    }
    return <DatabaseContainer payload={dbPayload} />;
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
