import { redirect } from "next/navigation";
import { getOrCreateDefaultDocumentIdAction } from "@/actions/document.actions";

export const dynamic = "force-dynamic";

export default async function WorkspaceHomePage() {
  const defaultDocId = await getOrCreateDefaultDocumentIdAction();
  redirect(`/${defaultDocId}`);
}
