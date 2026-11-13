# Security Policy (Layer 3 Reference)

Derived from `ARCHITECTURE.md` Sections 1, 4, 5, 6, and 7.

## 1. Invite-Only Authentication & Anti-Enumeration
- `requestOtpAction` MUST normalize email (`email.trim().toLowerCase()`).
- Enforce Postgres-backed token-bucket rate limit in `public.rate_limits`: max 5 OTP requests per email or IP per 15 minutes.
- Idempotently ensure `process.env.SEED_ADMIN_EMAIL` exists in `public.allowed_users` with `role = 'admin'` and `status = 'active'` before evaluating OTP requests.
- If email is missing from `public.allowed_users` or `status === 'revoked'`:
  - Log `UNAUTHORIZED_OTP_ATTEMPT` to `public.security_audit_logs`.
  - Apply `250-450ms` randomized jitter.
  - Return identical generic success payload `{ success: true, message: "If your email is invited, a 6-digit code has been sent." }` without calling `supabase.auth.signInWithOtp`.
- OTP verification uses `supabase.auth.verifyOtp({ email, token, type: 'email' })` (6-digit token, 10-minute expiration).
- Instant revocation: `revokeUserAction` sets `status = 'revoked'`, `revoked_at = now()`, and calls `supabaseAdmin.auth.admin.signOut(userId, 'global')`.

## 2. Row Level Security & Secret Boundaries
- Every table in `public` and `storage.objects` bucket `workspace-assets` MUST enable RLS and gate access with `public.is_active_user()` or `public.is_admin_user()`.
- `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `CRON_SECRET` MUST NEVER appear in client components (`'use client'`) or `NEXT_PUBLIC_*` environment variables.
- `src/lib/supabase/admin.ts` MUST import `'server-only'` (or enforce runtime server check) and only be called inside server actions / API routes.

## 3. Selective Zero-Knowledge Vault Cryptography
- Key Derivation: `PBKDF2` with `SHA-256`, `600,000` iterations, 16-byte random salt (`profiles.vault_salt`) -> non-extractable or in-memory `AES-GCM` 256-bit KEK (`wrapKey`, `unwrapKey`).
- Per-Document DEK: Random 256-bit `AES-GCM` key wrapped with KEK (`documents.wrapped_dek`).
- Payload Encryption: Fresh 96-bit (12-byte) IV (`documents.encryption_iv`) on every save; `AES-256-GCM` ciphertext of `{ title, yjsStateBase64, contentJson }`.
- Plaintext Invariant: When `is_vault_encrypted = true`, `yjs_state`, `content_json`, and `plain_text` MUST be `NULL`, `title` set to `'🔒 Encrypted Vault Page'`, and unencrypted `document_versions` / `document_backlinks` purged.
- KEK cleared from memory on manual lock or after 15 minutes of inactivity.

## 4. HTTP Headers & Cron Protection
- CSP with per-request nonce in `src/middleware.ts`, plus `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` in `vercel.json` and middleware.
- `/api/cron/keep-alive` validates `Authorization: Bearer ${process.env.CRON_SECRET}` with constant-time comparison.
