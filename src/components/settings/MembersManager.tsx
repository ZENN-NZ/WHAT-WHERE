"use client";

import * as React from "react";
import { UserPlus, ShieldAlert, Loader2, Ban } from "lucide-react";
import {
  inviteUserAction,
  revokeUserAction,
  updateUserRoleAction,
} from "@/actions/admin.actions";
import type { AllowedUser, UserRole } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";

interface MembersManagerProps {
  initialMembers: AllowedUser[];
  currentUserEmail: string;
}

export function MembersManager({
  initialMembers,
  currentUserEmail,
}: MembersManagerProps) {
  const [members, setMembers] = React.useState<AllowedUser[]>(initialMembers);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("member");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [busyEmail, setBusyEmail] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await inviteUserAction(email, role);
      setFeedback({
        type: res.success ? "success" : "error",
        text: res.message,
      });
      if (res.success) {
        const normalized = email.trim().toLowerCase();
        setMembers((prev) => {
          const existingIdx = prev.findIndex((m) => m.email === normalized);
          const optimistic: AllowedUser = {
            id: existingIdx >= 0 ? prev[existingIdx].id : crypto.randomUUID(),
            email: normalized,
            role,
            status: "invited",
            invited_by: null,
            invited_at: new Date().toISOString(),
            accepted_at: null,
            revoked_at: null,
          };
          if (existingIdx >= 0) {
            const copy = [...prev];
            copy[existingIdx] = optimistic;
            return copy;
          }
          return [optimistic, ...prev];
        });
        setEmail("");
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to send invite.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevoke(memberEmail: string) {
    setBusyEmail(memberEmail);
    setFeedback(null);
    try {
      const res = await revokeUserAction(memberEmail);
      setFeedback({
        type: res.success ? "success" : "error",
        text: res.message,
      });
      if (res.success) {
        setMembers((prev) =>
          prev.map((m) =>
            m.email === memberEmail
              ? {
                  ...m,
                  status: "revoked",
                  revoked_at: new Date().toISOString(),
                }
              : m
          )
        );
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to revoke user.",
      });
    } finally {
      setBusyEmail(null);
    }
  }

  async function handleRoleChange(memberEmail: string, nextRole: UserRole) {
    setBusyEmail(memberEmail);
    setFeedback(null);
    try {
      const res = await updateUserRoleAction(memberEmail, nextRole);
      setFeedback({
        type: res.success ? "success" : "error",
        text: res.message,
      });
      if (res.success) {
        setMembers((prev) =>
          prev.map((m) =>
            m.email === memberEmail ? { ...m, role: nextRole } : m
          )
        );
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update role.",
      });
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleInvite}
        className="rounded-lg border border-border bg-card p-5"
      >
        <h2 className="text-sm font-semibold">Invite Workspace Member</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Only emails in this allowlist can request a 6-digit OTP or establish a
          session. Invitations are delivered via Resend.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            required
            placeholder="colleague@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <select
            aria-label="Member role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Send Invite
          </Button>
        </div>

        {feedback && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              feedback.type === "error"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {feedback.text}
          </div>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">
            Allowlist ({members.length})
          </h2>
        </div>

        <div className="divide-y divide-border">
          {members.map((member) => {
            const isSelf =
              member.email.toLowerCase() === currentUserEmail.toLowerCase();
            const isBusy = busyEmail === member.email;

            return (
              <div
                key={member.id}
                className="flex flex-col justify-between gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {member.email}
                    </span>
                    {isSelf && <Badge variant="secondary">You</Badge>}
                    <Badge
                      variant={
                        member.status === "active"
                          ? "success"
                          : member.status === "invited"
                          ? "warning"
                          : "destructive"
                      }
                    >
                      {member.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Invited {formatRelativeDate(member.invited_at)}
                    {member.accepted_at
                      ? ` • Accepted ${formatRelativeDate(member.accepted_at)}`
                      : ""}
                    {member.revoked_at
                      ? ` • Revoked ${formatRelativeDate(member.revoked_at)}`
                      : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Role for ${member.email}`}
                    disabled={isSelf || isBusy || member.status === "revoked"}
                    value={member.role}
                    onChange={(e) =>
                      void handleRoleChange(
                        member.email,
                        e.target.value as UserRole
                      )
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>

                  {member.status !== "revoked" && !isSelf && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void handleRevoke(member.email)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Ban className="h-3.5 w-3.5" />
                      )}
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {members.length === 0 && (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4" />
              No invited members yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
