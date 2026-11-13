# WHAT-WHERE — Workspace Identity (Layer 0)

**Project Name:** WHAT-WHERE
**Purpose:** A Notion-like collaborative workspace, knowledge base, and relational database application built with Next.js App Router, Supabase, BlockNote + Yjs, Resend 6-digit OTP invite-only authentication, and selective client-side AES-256-GCM Zero-Knowledge Vault encryption.
**Repository:** https://github.com/ZENN-NZ/WHAT-WHERE
**Methodology:** Interpretable Context Methodology (ICM) — 6 staged phases mapped directly from `ARCHITECTURE.md`.

## Core Invariants
1. **Strict Invite-Only Access:** No OTP, signup, or row access unless normalized email is in `public.allowed_users` (`status != 'revoked'`) or matches `SEED_ADMIN_EMAIL`.
2. **Defense-in-Depth RLS:** Every `public` and `storage` table enforces RLS via `public.is_active_user()` / `public.is_admin_user()`. `SUPABASE_SERVICE_ROLE_KEY` is strictly server-only.
3. **Passwordless 6-Digit OTP via Resend:** Email OTP only (`signInWithOtp` / `verifyOtp`), routed via Resend SMTP + branded Resend SDK invites.
4. **Selective Zero-Knowledge Vault:** Pages with `is_vault_encrypted = true` are encrypted/decrypted exclusively in-browser via Web Crypto API (`PBKDF2` + `AES-256-GCM`); plaintext never traverses the network or persists in PostgreSQL.

## Directory Layout
- `WORKSPACE.md` — Layer 0 workspace identity
- `ROUTING.md` — Layer 1 workflow routing and stage map
- `_config/` — Layer 3 persistent policies, specs, and schema presets
- `01_foundation_auth/` .. `06_security_production/` — Layer 2 `CONTEXT.md` contracts & Layer 4 `output/` artifacts
- `src/`, `supabase/`, `vercel.json` — Next.js + Supabase production application root
- `scripts/` — Deterministic verification and build scripts
