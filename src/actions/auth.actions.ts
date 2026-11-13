"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp, logSecurityAudit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/utils";

const emailSchema = z.string().email("Please enter a valid email address.");
const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Please enter the 6-digit verification code.");

const GENERIC_OTP_MESSAGE =
  "If your email is invited, a 6-digit code has been sent.";

function randomJitterMs(min = 250, max = 450): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function ensureSeedAdminAllowed(): Promise<void> {
  const rawSeedEmail = process.env.SEED_ADMIN_EMAIL;
  if (!rawSeedEmail) return;

  const seedEmail = normalizeEmail(rawSeedEmail);
  if (!seedEmail) return;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("allowed_users")
    .select("id, status, role")
    .eq("email", seedEmail)
    .maybeSingle();

  if (!existing) {
    await admin.from("allowed_users").insert({
      email: seedEmail,
      role: "admin",
      status: "active",
      accepted_at: new Date().toISOString(),
    });
  } else if (existing.role !== "admin" || existing.status === "invited") {
    await admin
      .from("allowed_users")
      .update({
        role: "admin",
        status: existing.status === "revoked" ? "revoked" : "active",
      })
      .eq("id", existing.id);
  }
}

export interface ActionResponse {
  success: boolean;
  message: string;
}

export async function requestOtpAction(
  rawEmail: string
): Promise<ActionResponse> {
  const parsed = emailSchema.safeParse(rawEmail.trim());
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.errors[0]?.message || "Invalid email address.",
    };
  }

  const email = normalizeEmail(parsed.data);
  const ip = await getRequestIp();

  // Enforce Postgres rate limit (max 5 OTP requests per email or IP per 15 minutes)
  const [emailLimit, ipLimit] = await Promise.all([
    checkRateLimit(`otp:email:${email}`, 5, 900),
    checkRateLimit(`otp:ip:${ip}`, 5, 900),
  ]);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    await logSecurityAudit({
      actorEmail: email,
      eventType: "RATE_LIMIT_EXCEEDED",
      targetResource: "auth.otp.request",
      ipAddress: ip,
    });
    return {
      success: false,
      message: "Too many verification attempts. Please wait 15 minutes.",
    };
  }

  await ensureSeedAdminAllowed();

  const admin = createAdminClient();
  const { data: allowed } = await admin
    .from("allowed_users")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  // Anti-enumeration: never call signInWithOtp for uninvited or revoked emails
  if (!allowed || allowed.status === "revoked") {
    await logSecurityAudit({
      actorEmail: email,
      eventType: "UNAUTHORIZED_OTP_ATTEMPT",
      targetResource: "auth.otp.request",
      ipAddress: ip,
      metadata: { reason: allowed ? "revoked" : "not_in_allowlist" },
    });
    await randomJitterMs(250, 450);
    return {
      success: true,
      message: GENERIC_OTP_MESSAGE,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] signInWithOtp error:", error.message);
    return {
      success: false,
      message: "Unable to send verification code. Please try again shortly.",
    };
  }

  await logSecurityAudit({
    actorEmail: email,
    eventType: "OTP_REQUESTED",
    targetResource: "auth.otp.request",
    ipAddress: ip,
  });

  return {
    success: true,
    message: GENERIC_OTP_MESSAGE,
  };
}

export async function verifyOtpAction(
  rawEmail: string,
  rawToken: string
): Promise<ActionResponse> {
  const emailParsed = emailSchema.safeParse(rawEmail.trim());
  if (!emailParsed.success) {
    return { success: false, message: "Invalid email address." };
  }
  const otpParsed = otpSchema.safeParse(rawToken);
  if (!otpParsed.success) {
    return {
      success: false,
      message: otpParsed.error.errors[0]?.message || "Invalid 6-digit code.",
    };
  }

  const email = normalizeEmail(emailParsed.data);
  const token = otpParsed.data;
  const ip = await getRequestIp();

  const verifyLimit = await checkRateLimit(`otp:verify:${email}`, 10, 900);
  if (!verifyLimit.allowed) {
    await logSecurityAudit({
      actorEmail: email,
      eventType: "RATE_LIMIT_EXCEEDED",
      targetResource: "auth.otp.verify",
      ipAddress: ip,
    });
    return {
      success: false,
      message: "Too many failed verification attempts. Request a new code.",
    };
  }

  const admin = createAdminClient();
  const { data: allowed } = await admin
    .from("allowed_users")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  if (!allowed || allowed.status === "revoked") {
    await logSecurityAudit({
      actorEmail: email,
      eventType: "UNAUTHORIZED_OTP_ATTEMPT",
      targetResource: "auth.otp.verify",
      ipAddress: ip,
    });
    return {
      success: false,
      message: "Invalid or expired verification code.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    return {
      success: false,
      message: "Invalid or expired verification code.",
    };
  }

  // Ensure allowlist status transitions to active & profile exists even if trigger is delayed
  await admin
    .from("allowed_users")
    .update({
      status: "active",
      accepted_at: new Date().toISOString(),
    })
    .eq("email", email)
    .eq("status", "invited");

  await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email,
      display_name: email.split("@")[0] || "Member",
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  await logSecurityAudit({
    actorId: data.user.id,
    actorEmail: email,
    eventType: "OTP_VERIFIED",
    targetResource: "auth.session",
    ipAddress: ip,
  });

  return {
    success: true,
    message: "Verified. Redirecting to workspace...",
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
