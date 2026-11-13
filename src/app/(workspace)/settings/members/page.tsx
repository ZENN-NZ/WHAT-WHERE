import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAllowedUsersAction } from "@/actions/admin.actions";
import { MembersManager } from "@/components/settings/MembersManager";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MembersSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect("/login");
  }

  const { data: isAdmin } = await supabase.rpc("is_admin_user");

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-base font-semibold">Admin Access Required</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Only workspace admins can manage the invite allowlist and revoke
            member sessions.
          </p>
        </div>
      </div>
    );
  }

  const members = await listAllowedUsersAction();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Members & Invite Allowlist
          </h1>
          <p className="text-sm text-muted-foreground">
            Invite-only OTP gate enforced at PostgreSQL RLS and Supabase Auth
            Hook layers.
          </p>
        </div>
      </div>

      <MembersManager
        initialMembers={members}
        currentUserEmail={user.email}
      />
    </div>
  );
}
