import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkspaceHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">WHAT-WHERE Workspace</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {user.email}. Stage 02 will wire the workspace sidebar and
        default document redirect.
      </p>
    </div>
  );
}
