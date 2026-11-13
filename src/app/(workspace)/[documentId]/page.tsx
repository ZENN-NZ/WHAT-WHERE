import { notFound } from "next/navigation";
import { getDocumentByIdAction } from "@/actions/document.actions";

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

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-3xl">{doc.icon || (doc.is_database ? "🗂️" : "📄")}</span>
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {doc.is_database ? "Structured Database" : "Document"} • ID: {doc.id}
      </p>
    </div>
  );
}
