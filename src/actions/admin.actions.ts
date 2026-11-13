"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWorkspaceInviteEmail } from "@/lib/resend/client";
import { logSecurityAudit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/utils";
import type { AllowedUser, UserRole } from "@/types/database";

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  role: z.enum(["admin", "member", "viewer"]),
});

async function requireActiveAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    throw new Error("Authentication required.");
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin_user");
  if (error || !isAdmin) {
    throw new Error("Admin privileges required.");
  }

  return user;
}

export async function listAllowedUsersAction(): Promise<AllowedUser[]> {
  await requireActiveAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("allowed_users")
    .select("*")
    .order("invited_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch workspace members: ${error.message}`);
  }
  return (data || []) as AllowedUser[];
}

export async function inviteUserAction(
  rawEmail: string,
  role: UserRole
): Promise<{ success: boolean; message: string }> {
  const actor = await requireActiveAdmin();

  const parsed = inviteSchema.safeParse({
    email: rawEmail.trim(),
    role,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.errors[0]?.message || "Invalid invite payload.",
    };
  }

  const email = normalizeEmail(parsed.data.email);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("allowed_users")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  if (existing && existing.status === "active") {
    return {
      success: false,
      message: `${email} is already an active workspace member.`,
    };
  }

  if (existing) {
    const { error: updateErr } = await admin
      .from("allowed_users")
      .update({
        role: parsed.data.role,
        status: "invited",
        invited_by: actor.id,
        invited_at: new Date().toISOString(),
        revoked_at: null,
      })
      .eq("id", existing.id);

    if (updateErr) {
      return { success: false, message: updateErr.message };
    }
  } else {
    const { error: insertErr } = await admin.from("allowed_users").insert({
      email,
      role: parsed.data.role,
      status: "invited",
      invited_by: actor.id,
    });

    if (insertErr) {
      return { success: false, message: insertErr.message };
    }
  }

  try {
    await sendWorkspaceInviteEmail({
      to: email,
      invitedByEmail: actor.email || "Workspace Admin",
      role: parsed.data.role,
    });
  } catch (err) {
    console.error("[admin] Resend invite email error:", err);
    return {
      success: true,
      message: `${email} added to allowlist, but Resend email delivery failed (check RESEND_API_KEY / verified domain).`,
    };
  }

  await logSecurityAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    eventType: "USER_INVITED",
    targetResource: email,
    metadata: { role: parsed.data.role },
  });

  revalidatePath("/settings/members");
  return {
    success: true,
    message: `Invitation sent to ${email}.`,
  };
}

export async function updateUserRoleAction(
  emailInput: string,
  role: UserRole
): Promise<{ success: boolean; message: string }> {
  const actor = await requireActiveAdmin();
  const email = normalizeEmail(emailInput);

  if (actor.email && normalizeEmail(actor.email) === email && role !== "admin") {
    return {
      success: false,
      message: "You cannot demote your own admin account.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("allowed_users")
    .update({ role })
    .eq("email", email);

  if (error) {
    return { success: false, message: error.message };
  }

  revalidatePath("/settings/members");
  return { success: true, message: `Updated ${email} role to ${role}.` };
}

export async function revokeUserAction(
  emailInput: string
): Promise<{ success: boolean; message: string }> {
  const actor = await requireActiveAdmin();
  const email = normalizeEmail(emailInput);

  if (actor.email && normalizeEmail(actor.email) === email) {
    return {
      success: false,
      message: "You cannot revoke your own active admin session.",
    };
  }

  const admin = createAdminClient();
  const { error: revokeErr } = await admin
    .from("allowed_users")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("email", email);

  if (revokeErr) {
    return { success: false, message: revokeErr.message };
  }

  // Locate auth.users record via profiles and kill all active refresh tokens globally
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profile?.id) {
    const { error: signOutErr } = await admin.auth.admin.signOut(
      profile.id,
      "global"
    );
    if (signOutErr) {
      console.error("[admin] Global signOut error:", signOutErr.message);
    }
  }

  await logSecurityAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    eventType: "USER_REVOKED",
    targetResource: email,
    metadata: { globalSessionKill: Boolean(profile?.id) },
  });

  revalidatePath("/settings/members");
  return {
    success: true,
    message: `Access revoked and all active sessions terminated for ${email}.`,
  };
}
