import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SecuritySettingsView } from "@/components/settings/SecuritySettingsView";
import type { SecurityAuditLog } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isAdmin } = await supabase.rpc("is_admin_user");

  let auditLogs: SecurityAuditLog[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("security_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    auditLogs = (data || []) as SecurityAuditLog[];
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Security & Zero-Knowledge Vault
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your browser-only Vault key, review security audit logs, and
            inspect MFA/Passkey readiness.
          </p>
        </div>
      </div>

      <SecuritySettingsView
        isAdmin={Boolean(isAdmin)}
        auditLogs={auditLogs}
      />
    </div>
  );
}
