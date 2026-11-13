import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditEventType =
  | "OTP_REQUESTED"
  | "OTP_VERIFIED"
  | "UNAUTHORIZED_OTP_ATTEMPT"
  | "RATE_LIMIT_EXCEEDED"
  | "USER_INVITED"
  | "USER_REVOKED"
  | "VAULT_CONFIGURED"
  | "VAULT_LOCKED"
  | "VAULT_UNLOCKED"
  | "VAULT_UNLOCK_FAILED";

export async function getRequestIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0]?.trim() || "unknown";
    }
    return h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

export async function logSecurityAudit(params: {
  actorId?: string | null;
  actorEmail?: string | null;
  eventType: AuditEventType;
  targetResource?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const ip = params.ipAddress ?? (await getRequestIp());

    await admin.from("security_audit_logs").insert({
      actor_id: params.actorId ?? null,
      actor_email: params.actorEmail ?? null,
      event_type: params.eventType,
      target_resource: params.targetResource ?? null,
      ip_address: ip,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    // Never fail an auth flow solely because audit logging encountered a transient error
    console.error("[audit] Failed to write security_audit_logs:", err);
  }
}
