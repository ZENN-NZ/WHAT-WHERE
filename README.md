# WHAT-WHERE

An invite-only Notion-style collaborative workspace, relational database engine, and selective zero-knowledge encrypted Vault built with **Next.js 15 App Router**, **Supabase** (PostgreSQL 16, Auth, Realtime, Storage), **BlockNote + Yjs**, and **Resend**.

Structured using **Interpretable Context Methodology (ICM)** across 6 verification-gated stages (`WORKSPACE.md`, `ROUTING.md`, `_config/`, `01_*`..`06_*`).

## Key Capabilities
- **Invite-Only 6-Digit Email OTP Auth:** Enforced at Server Action pre-flight (`requestOtpAction`), Postgres rate limiter (`public.rate_limits`), anti-enumeration jitter, Supabase Auth `before_user_created` Hook, and centralized `public.is_active_user()` RLS across all tables and storage.
- **Recursive Workspace Tree & Search:** Unlimited nested pages with `@dnd-kit` drag-and-drop fractional ordering, `Cmd+K` PostgreSQL Full-Text Search (`websearch_to_tsquery`), and Soft-Delete `/trash` recovery/purge.
- **Realtime Collaborative Editor:** Client-only BlockNote editor with custom `SupabaseYjsProvider` (Broadcast + Presence + `y-indexeddb` offline reconciliation), `@page` mentions with bi-directional backlinks, block-anchored comment threads, version history snapshots, and Private Storage signed-URL uploads.
- **Selective Zero-Knowledge Vault:** In-browser `PBKDF2` (600,000 iterations, SHA-256) + per-document `AES-256-GCM` DEK wrapping; plaintext columns (`yjs_state`, `content_json`, `plain_text`) remain `NULL` in PostgreSQL.
- **Relational Notion Databases:** 12 property types (`title`, `text`, `number`, `select`, `multi_select`, `status`, `date`, `checkbox`, `url`, `person`, `relation`, `rollup`), 4 views (`Table`, `Kanban`, `Calendar`, `Gallery`), compound filters & multi-column sorts, where every database row is a full Notion page.
- **Security Hardening & Keep-Alive:** Nonce-based CSP, HSTS, security audit log viewer (`/settings/security`), and `/api/cron/keep-alive` Vercel Cron (`0 0 */3 * *`).

## Setup
1. Copy `.env.example` to `.env.local` and fill in Supabase, Resend, `SEED_ADMIN_EMAIL`, and `CRON_SECRET`.
2. Apply SQL migrations in `supabase/migrations/` (`0001` through `0004`) to your Supabase project.
3. Configure Supabase Auth:
   - Custom SMTP via Resend (`smtp.resend.com`, port `465`, user `resend`, password `RESEND_API_KEY`).
   - Magic Link template rendering `{{ .Token }}` (6-digit OTP, 600s expiry).
   - Enable `before_user_created` Auth Hook pointing to `public.hook_restrict_signup_to_invited`.
4. Run locally:
   ```bash
   npm install
   npm run dev
   ```

## Verification
```bash
node scripts/verify.mjs
```
