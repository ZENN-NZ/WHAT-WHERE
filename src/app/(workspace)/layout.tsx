import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDocumentTreeAction } from "@/actions/document.actions";
import { WorkspaceProvider } from "@/components/navigation/WorkspaceContext";
import { WorkspaceShell } from "@/components/navigation/WorkspaceShell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect("/login");
  }

  const [{ data: profile }, { data: isAdmin }, tree] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("is_admin_user"),
    getDocumentTreeAction(),
  ]);

  const displayName =
    profile?.display_name || user.email.split("@")[0] || "Member";

  return (
    <WorkspaceProvider
      initialItems={tree}
      currentUser={{
        id: user.id,
        email: user.email,
        displayName,
        isAdmin: Boolean(isAdmin),
      }}
    >
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}
