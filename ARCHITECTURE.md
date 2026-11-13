```markdown
# SYSTEM EXECUTION MANIFEST: PROJECT HYDROGEN-NOTION
**Target Executor:** Gemini Hydrogen (`gemini-4-hydrogen`)
**Deployment Target:** Vercel (Next.js App Router, Node/Edge Runtime)
**Backend & Persistence:** Supabase (PostgreSQL 16+, Auth, Realtime, Storage)
**Transactional Email & OTP:** Resend (`smtp.resend.com` + Resend Node SDK)

## 1. SYSTEM CONSTRAINTS & INVARIANTS
1. **Strict Invite-Only Access:** No user may request an OTP, create an `auth.users` record, or read/write any row unless their normalized email exists in `public.allowed_users` with `status != 'revoked'` OR matches `process.env.SEED_ADMIN_EMAIL`.
2. **Defense-in-Depth RLS:** Every table in the `public` and `storage` schemas MUST have Row Level Security (RLS) enabled and enforced via a centralized `public.is_active_user()` SQL security predicate. Service-role keys (`SUPABASE_SERVICE_ROLE_KEY`) must NEVER be imported into client components or exposed via `NEXT_PUBLIC_*`.
3. **Passwordless 6-Digit OTP via Resend:** Authentication uses exclusively 6-digit Email OTP codes (`supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` verified via `supabase.auth.verifyOtp({ email, token, type: 'email' })`). Magic links are disabled in favor of explicit 6-digit OTP verification.
4. **Selective Zero-Knowledge Vault:** Pages marked `is_vault_encrypted = true` must be encrypted and decrypted exclusively in the browser using Web Crypto API (`AES-256-GCM`). Plaintext content for Vault pages must never traverse the network or be stored in PostgreSQL.

## 2. TECH STACK & PACKAGE MANIFEST
- **Framework:** Next.js 15+ (App Router, TypeScript 5.x, Strict Mode, React 19)
- **Styling & UI:** Tailwind CSS v4, `shadcn/ui`, Radix UI primitives, `lucide-react`, `cmdk` (Command-K palette), `@dnd-kit/core` + `@dnd-kit/sortable` (sidebar tree & Kanban drag-and-drop)
- **Rich Block Editor:** `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`, `yjs`, `y-indexeddb`, `y-protocols`
- **Database Views:** `@tanstack/react-table` (Table view), `@dnd-kit` (Kanban view), `react-day-picker` / custom grid (Calendar view)
- **Supabase & Auth:** `@supabase/supabase-js`, `@supabase/ssr`
- **Email & Rate Limiting:** `resend`, `@react-email/components` (invite/OTP templates), Postgres-backed token-bucket rate limiter (`public.rate_limits`)
- **Validation:** `zod`, `react-hook-form`

## 3. REPOSITORY DIRECTORY STRUCTURE
```text
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx               # Two-step Email -> 6-digit OTP input UI
│   │   │   └── auth/callback/route.ts       # PKCE session exchange handler
│   │   ├── (workspace)/
│   │   │   ├── layout.tsx                   # Resizable sidebar, Cmd+K modal, Vault unlock provider
│   │   │   ├── page.tsx                     # Root redirect to default page
│   │   │   ├── [documentId]/page.tsx        # Dynamic Document / Database View container
│   │   │   ├── trash/page.tsx               # Soft-deleted items recovery & purge UI
│   │   │   └── settings/
│   │   │       ├── members/page.tsx         # Admin-only Invite/Revoke management UI
│   │   │       └── security/page.tsx        # Vault passphrase setup, audit logs, future MFA slot
│   │   └── api/
│   │       └── cron/keep-alive/route.ts     # Vercel Cron health check to prevent DB pause
│   ├── actions/
│   │   ├── auth.actions.ts                  # Pre-flight invite check, rate-limit, OTP trigger
│   │   ├── admin.actions.ts                 # Invite email via Resend, revoke user & kill sessions
│   │   ├── document.actions.ts              # Tree CRUD, version snapshots, backlink indexing
│   │   └── database.actions.ts              # Structured database properties, rows, views, rollups
│   ├── components/
│   │   ├── editor/
│   │   │   ├── CollaborativeEditor.tsx      # Dynamic client-only BlockNote + Yjs wrapper
│   │   │   ├── VaultLockGuard.tsx           # AES-256-GCM passphrase prompt & WebCrypto boundary
│   │   │   ├── CommentsSidebar.tsx          # Inline block-anchored comment threads
│   │   │   └── VersionHistoryDrawer.tsx     # Point-in-time snapshot diff & restore
│   │   ├── database/
│   │   │   ├── DatabaseContainer.tsx        # View switcher (Table, Kanban, Calendar, Gallery)
│   │   │   ├── PropertyHeaderMenu.tsx       # Type config (Text, Number, Select, Date, Relation, Rollup)
│   │   │   ├── FilterSortBar.tsx            # Multi-column compound filter & sort builder
│   │   │   └── views/                       # TableView.tsx, KanbanView.tsx, CalendarView.tsx, GalleryView.tsx
│   │   └── navigation/
│   │       ├── SidebarTree.tsx              # Recursive collapsible document tree with drag-and-drop
│   │       ├── CommandSearchModal.tsx       # Cmd+K instant FTS + client Vault title search
│   │       └── BacklinksPanel.tsx           # Bi-directional incoming links footer
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                    # Browser client (@supabase/ssr)
│   │   │   ├── server.ts                    # Server component/action client (@supabase/ssr)
│   │   │   └── admin.ts                     # Strictly server-only service_role client for session revocation
│   │   ├── yjs/
│   │   │   └── SupabaseYjsProvider.ts       # Custom Yjs CRDT Broadcast + Presence + IndexedDB provider
│   │   ├── crypto/
│   │   │   └── vault.ts                     # Web Crypto PBKDF2 + AES-256-GCM key wrapping & encryption
│   │   └── resend/
│   │       └── client.ts                    # Resend SDK wrapper & transactional email templates
│   └── middleware.ts                        # Session refresh, CSP nonce injection, route protection
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init_auth_and_allowlist.sql
│   │   ├── 0002_documents_and_collaboration.sql
│   │   ├── 0003_structured_databases.sql
│   │   └── 0004_storage_and_audit_logs.sql
│   └── config.toml
└── vercel.json                              # Cron schedule & hardened security headers

```

## 4. DATABASE SCHEMA, AUTH HOOKS & RLS (`supabase/migrations/`)

### 4.1 Migration `0001_init_auth_and_allowlist.sql` (Invite-Only Gate & Rate Limiting)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.user_role AS ENUM ('admin', 'member', 'viewer');
CREATE TYPE public.invite_status AS ENUM ('invited', 'active', 'revoked');

-- 1. Invite Allowlist Table
CREATE TABLE public.allowed_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL CHECK (email = lower(btrim(email))),
    role public.user_role NOT NULL DEFAULT 'member',
    status public.invite_status NOT NULL DEFAULT 'invited',
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

-- 2. User Profiles (synced on auth verification)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    vault_salt TEXT, -- Base64 16-byte salt for PBKDF2 key derivation
    vault_verifier TEXT, -- Encrypted known token to verify Vault passphrase client-side
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Postgres Rate Limiter Table (blocks OTP brute-forcing)
CREATE TABLE public.rate_limits (
    key TEXT PRIMARY KEY,
    points INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Security Definer HelperPredicates (Used by all RLS policies)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$SELECT EXISTS ( SELECT 1 FROM public.allowed_users au WHERE au.email = lower(auth.jwt() ->> 'email') AND au.status = 'active' );$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$SELECT EXISTS ( SELECT 1 FROM public.allowed_users au WHERE au.email = lower(auth.jwt() ->> 'email') AND au.status = 'active' AND au.role = 'admin' );$$;

-- 5. Supabase Auth "Before User Created" Hook
-- Blocks any direct API signup attempt if the email is not in public.allowed_users
CREATE OR REPLACE FUNCTION public.hook_restrict_signup_to_invited(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ DECLARE incoming_email TEXT; user_status public.invite_status; BEGIN incoming_email := lower(btrim(event->'user'->>'email'));    SELECT status INTO user_status FROM public.allowed_users WHERE email = incoming_email;    IF user_status IS NULL OR user_status = 'revoked' THEN RETURN jsonb_build_object( 'error', jsonb_build_object( 'http_code', 403, 'message', 'Access restricted: This email has not been invited to this workspace.' ) ); END IF;    RETURN '{}'::jsonb; END; $$;

GRANT EXECUTE ON FUNCTION public.hook_restrict_signup_to_invited TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_restrict_signup_to_invited FROM authenticated, anon, public;

-- 6. Trigger to auto-activate allowed_users and create profile upon first OTP verification
CREATE OR REPLACE FUNCTION public.handle_user_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ BEGIN IF NEW.email_confirmed_at IS NOT NULL THEN UPDATE public.allowed_users SET status = 'active', accepted_at = COALESCE(accepted_at, now()) WHERE email = lower(NEW.email) AND status = 'invited';      INSERT INTO public.profiles (id, email, display_name) VALUES (NEW.id, lower(NEW.email), split_part(NEW.email, '@', 1)) ON CONFLICT (id) DO NOTHING; END IF; RETURN NEW; END; $$;

CREATE TRIGGER on_auth_user_created_or_verified
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_user_verified();

-- Enable RLS
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can view allowlist" ON public.allowed_users
  FOR SELECT TO authenticated USING (public.is_active_user());

CREATE POLICY "Only admins can insert/update/delete allowlist" ON public.allowed_users
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Active users can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_active_user());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND public.is_active_user())
  WITH CHECK (id = auth.uid() AND public.is_active_user());

```

### 4.2 Migration `0002_documents_and_collaboration.sql` (Pages, Vault, Backlinks, Comments, Versions)

```sql
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled',
    icon TEXT,
    cover_image_url TEXT,
    position DOUBLE PRECISION NOT NULL DEFAULT 1000,
    is_database BOOLEAN NOT NULL DEFAULT false,
    -- Standard Unencrypted Storage
    yjs_state BYTEA,
    content_json JSONB,
    plain_text TEXT,
    search_vector TSVECTOR GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(plain_text, '')), 'B')
    ) STORED,
    -- Selective Client-Side Vault Encryption
    is_vault_encrypted BOOLEAN NOT NULL DEFAULT false,
    encrypted_payload TEXT, -- Base64 AES-256-GCM ciphertext of { title, yjsState, contentJson }
    encryption_iv TEXT,     -- Base64 12-byte IV
    wrapped_dek TEXT,       -- Base64 AES-KW / AES-GCM wrapped per-document Data Encryption Key
    -- Lifecycle
    is_archived BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Invariant: If Vault Encrypted, plaintext columns MUST be null
    CONSTRAINT vault_plaintext_null_check CHECK (
      (is_vault_encrypted = false) OR
      (is_vault_encrypted = true AND content_json IS NULL AND plain_text IS NULL AND yjs_state IS NULL)
    )
);

CREATE INDEX idx_documents_parent ON public.documents(parent_id, position) WHERE is_archived = false;
CREATE INDEX idx_documents_search ON public.documents USING GIN (search_vector) WHERE is_vault_encrypted = false AND is_archived = false;

-- Bi-directional Backlinks
CREATE TABLE public.document_backlinks (
    source_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    target_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    block_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_document_id, target_document_id, block_id)
);

-- Block-Anchored Comments
CREATE TABLE public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL,
    block_id TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES auth.users(id),
    body TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Version History Snapshots
CREATE TABLE public.document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    yjs_snapshot BYTEA,
    content_json JSONB,
    encrypted_payload TEXT,
    encryption_iv TEXT,
    wrapped_dek TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active workspace members full access to documents" ON public.documents
  FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());

CREATE POLICY "Active workspace members full access to backlinks" ON public.document_backlinks
  FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());

CREATE POLICY "Active workspace members full access to comments" ON public.comments
  FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());

CREATE POLICY "Active workspace members full access to versions" ON public.document_versions
  FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());

```

### 4.3 Migration `0003_structured_databases.sql` (Notion Relational Databases)

```sql
CREATE TYPE public.property_type AS ENUM (
  'title', 'text', 'number', 'select', 'multi_select',
  'status', 'date', 'checkbox', 'url', 'person', 'relation', 'rollup'
);

CREATE TYPE public.view_type AS ENUM ('table', 'kanban', 'calendar', 'gallery');

-- 1. Database Columns / Properties
CREATE TABLE public.database_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    database_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type public.property_type NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Options, colors, target_database_id for relations, aggregation for rollups
    position DOUBLE PRECISION NOT NULL DEFAULT 1000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Database Views (Table, Kanban, Calendar, Gallery)
CREATE TABLE public.database_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    database_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'All Items',
    type public.view_type NOT NULL DEFAULT 'table',
    filters JSONB NOT NULL DEFAULT '[]'::jsonb,       -- [{ propertyId, operator, value }]
    sorts JSONB NOT NULL DEFAULT '[]'::jsonb,         -- [{ propertyId, direction: 'asc' | 'desc' }]
    group_by_property_id UUID REFERENCES public.database_properties(id) ON DELETE SET NULL,
    calendar_date_property_id UUID REFERENCES public.database_properties(id) ON DELETE SET NULL,
    visible_properties JSONB NOT NULL DEFAULT '[]'::jsonb,
    position DOUBLE PRECISION NOT NULL DEFAULT 1000
);

-- 3. Database Row Values (Each row is ITSELF a document with parent_id = database_document_id so it can be opened as a full Notion page)
CREATE TABLE public.database_cell_values (
    row_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.database_properties(id) ON DELETE CASCADE,
    value_text TEXT,
    value_number NUMERIC,
    value_boolean BOOLEAN,
    value_date_start TIMESTAMPTZ,
    value_date_end TIMESTAMPTZ,
    value_json JSONB, -- Select option IDs, person user IDs
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (row_document_id, property_id)
);

-- 4. First-Class Relational Links for Relations & Rollups
CREATE TABLE public.database_relations (
    source_row_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.database_properties(id) ON DELETE CASCADE,
    target_row_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    PRIMARY KEY (source_row_id, property_id, target_row_id)
);

ALTER TABLE public.database_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_cell_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active members access db properties" ON public.database_properties
  FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY "Active members access db views" ON public.database_views
  FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY "Active members access db cells" ON public.database_cell_values
  FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY "Active members access db relations" ON public.database_relations
  FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());

```

### 4.4 Migration `0004_storage_and_audit_logs.sql` (Audit Trail & Private Media Storage)

```sql
CREATE TABLE public.security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    event_type TEXT NOT NULL, -- 'OTP_REQUESTED', 'USER_INVITED', 'USER_REVOKED', 'VAULT_LOCKED', 'VAULT_UNLOCKED'
    target_resource TEXT,
    ip_address TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read audit logs" ON public.security_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin_user());

-- Private Storage Bucket for Page Attachments & Covers (Signed URLs only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-assets',
  'workspace-assets',
  false,
  52428800, -- 50MB
  ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','application/pdf','text/plain','text/markdown']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Active users can upload and read workspace assets" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'workspace-assets' AND public.is_active_user())
  WITH CHECK (bucket_id = 'workspace-assets' AND public.is_active_user());

```

## 5. AUTHENTICATION, RESEND OTP & INVITE-ONLY FLOW

### 5.1 Resend SMTP & SDK Configuration

1. **Supabase Auth Custom SMTP (for 6-Digit OTP Codes):**
Configure Supabase Auth SMTP settings to route all `signInWithOtp` codes through Resend:
* **Host:** `smtp.resend.com`
* **Port:** `465` (TLS)
* **Username:** `resend`
* **Password:** `process.env.RESEND_API_KEY`
* **Magic Link vs OTP Template:** Update the Supabase Auth "Magic Link" email template to render **only** `{{ .Token }}` (the 6-digit OTP code) with a 10-minute expiration window (`MAILER_OTP_EXP = 600`, `MAILER_OTP_LENGTH = 6`).


2. **Seed Admin Bootstrap (`src/actions/auth.actions.ts`):**
Before evaluating an OTP request, the server action idempotently ensures `process.env.SEED_ADMIN_EMAIL` exists in `public.allowed_users` with `role = 'admin'` and `status = 'active'`.
3. **Pre-Flight Invite Verification & Anti-Enumeration (`requestOtpAction`):**
* Normalize input email (`email.trim().toLowerCase()`).
* Enforce Postgres rate limit (`max 5 OTP requests per email or IP per 15 minutes`).
* Query `public.allowed_users` using the server-only admin client.
* **If email is NOT in `allowed_users` or `status === 'revoked'`:** Log an `UNAUTHORIZED_OTP_ATTEMPT` in `public.security_audit_logs`, wait a randomized `250-450ms` jitter to prevent timing-based email enumeration, and return `{ success: true, message: "If your email is invited, a 6-digit code has been sent." }` **without** calling Supabase Auth or consuming Resend credits.
* **If email IS invited/active:** Call `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.


4. **Admin Invite & Instant Revocation (`src/actions/admin.actions.ts`):**
* `inviteUserAction(email, role)`: Verifies `public.is_admin_user()`, inserts into `public.allowed_users`, and dispatches a branded invitation email via the Resend SDK (`resend.emails.send`) linking to `/login`.
* `revokeUserAction(email)`: Verifies `public.is_admin_user()`, sets `status = 'revoked'` and `revoked_at = now()`, and calls `supabaseAdmin.auth.admin.signOut(userId, 'global')` to terminate all active refresh tokens immediately. Because every RLS policy checks `public.is_active_user()`, even an un-expired 5-minute JWT is blocked at the database layer immediately.



## 6. SELECTIVE ZERO-KNOWLEDGE VAULT ENCRYPTION (`src/lib/crypto/vault.ts`)

1. **Key Hierarchy (Web Crypto API — `window.crypto.subtle`):**
* **Master Vault Key (KEK):** Derived in memory from the user's Vault Passphrase + `profiles.vault_salt` (16 random bytes) using `PBKDF2` (`600,000` iterations, `SHA-256`, key usage: `['wrapKey', 'unwrapKey']`). The KEK is cached only in a non-serializable in-memory `CryptoKey` reference for the tab session (and cleared after 15 minutes of inactivity or manual lock).
* **Per-Document Data Encryption Key (DEK):** Every Vault-locked page generates a fresh random 256-bit `AES-GCM` key (`crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])`).
* **Key Wrapping:** The page's DEK is wrapped (`crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv: wrapIv })`) and stored in `documents.wrapped_dek`.


2. **Locking a Page (`toggleVaultLock(documentId)`):**
* Serializes `{ title, yjsStateBase64, contentJson }` into a UTF-8 byte array.
* Generates a fresh 96-bit (12-byte) random `encryption_iv` on **every save**.
* Encrypts payload via `AES-256-GCM` (which includes a 128-bit authentication tag preventing ciphertext tampering).
* Executes an atomic database update setting:
* `is_vault_encrypted = true`
* `title = '🔒 Encrypted Vault Page'`
* `encrypted_payload = base64Ciphertext`
* `encryption_iv = base64Iv`
* `wrapped_dek = base64WrappedDek`
* `yjs_state = NULL, content_json = NULL, plain_text = NULL`


* Purges any unencrypted rows in `public.document_versions` and `public.document_backlinks` for that `document_id`.



## 7. VERCEL & APPLICATION SECURITY HARDENING

1. **Strict HTTP Security Headers (`src/middleware.ts` & `vercel.json`):**
* `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'nonce-{RANDOM}'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`
* `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
* `X-Content-Type-Options`: `nosniff`
* `X-Frame-Options`: `DENY`
* `Referrer-Policy`: `strict-origin-when-cross-origin`
* `Permissions-Policy`: `camera=(), microphone=(), geolocation=(), interest-cohort=()`


2. **Cookie & Session Hardening (`@supabase/ssr`):**
* `HttpOnly`, `Secure`, `SameSite=Lax`, short access token TTL (`3600s`) with automatic PKCE token rotation in `middleware.ts`.


3. **Keep-Alive Cron (`vercel.json`):**
* Schedules `/api/cron/keep-alive` (`0 0 */3 * *`) authenticated via `Authorization: Bearer ${process.env.CRON_SECRET}` to execute a lightweight `SELECT 1` query so Supabase never pauses the instance.



## 8. ENVIRONMENT VARIABLES TEMPLATE (`.env.example`)

```env
# App & Seed Admin
NEXT_PUBLIC_APP_URL="[https://your-notion-clone.vercel.app](https://your-notion-clone.vercel.app)"
SEED_ADMIN_EMAIL="your-personal-email@domain.com"
CRON_SECRET="generate-32-byte-hex-secret"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="[https://your-project-ref.supabase.co](https://your-project-ref.supabase.co)"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-server-only"

# Resend
RESEND_API_KEY="re_your_resend_api_key"
RESEND_FROM_EMAIL="Workspace Security <auth@your-verified-domain.com>"

```

## 9. PHASED EXECUTION PLAN FOR GEMINI HYDROGEN

Execute the build sequentially across these 6 verification-gated phases:

### Phase 1: Foundation, Database Migrations & Invite-Only Auth Gate

1. Scaffold Next.js 15 App Router project with TypeScript, Tailwind v4, and `shadcn/ui`.
2. Write all 4 SQL migrations in `supabase/migrations/`.
3. Implement `src/lib/supabase/{client,server,admin}.ts`, `src/middleware.ts`, and `src/lib/resend/client.ts`.
4. Implement `src/actions/auth.actions.ts` (seed admin check, Postgres rate limiter, pre-flight allowlist check, `signInWithOtp`, `verifyOtp`) and the `/login` two-step OTP UI.
5. Implement `/settings/members` Admin UI and `src/actions/admin.actions.ts` (invite via Resend, instant session revocation).

* **Verification Gate 1:** Attempt OTP login with an uninvited email -> verify Resend is NOT called and DB Auth Hook blocks creation. Login with `SEED_ADMIN_EMAIL` -> verify 6-digit OTP arrives via Resend and session establishes.

### Phase 2: Workspace Shell, Recursive Sidebar Tree & Command-K Search

1. Build collapsible resizable sidebar (`SidebarTree.tsx`) using `@dnd-kit` for arbitrary page nesting and fractional `position` reordering.
2. Implement `Cmd+K` search modal (`CommandSearchModal.tsx`) querying `documents.search_vector` (`websearch_to_tsquery`).
3. Implement Soft-Delete Trash (`/trash`), restoration, and permanent deletion.

* **Verification Gate 2:** Create nested pages 4 levels deep, reorder via drag-and-drop, verify instant `Cmd+K` search results.

### Phase 3: Collaborative BlockNote Editor, Yjs Realtime & Backlinks

1. Build `SupabaseYjsProvider.ts` connecting `Y.Doc` + `y-indexeddb` to Supabase Realtime Broadcast & Presence.
2. Implement `CollaborativeEditor.tsx` (wrapped in `next/dynamic` with `{ ssr: false }`), custom `@page` mention inline content item, slash menu, and Private Storage image/file uploads via signed URLs.
3. Implement automatic bi-directional backlink parser on save (`document_backlinks`), inline block-anchored comments (`CommentsSidebar.tsx`), and point-in-time `VersionHistoryDrawer.tsx`.

* **Verification Gate 3:** Open the same document in two browser windows -> verify real-time cursor presence, instant CRDT text sync, offline editing in Airplane Mode with automatic reconciliation on reconnect, and working backlinks.

### Phase 4: Selective Client-Side Vault Encryption

1. Implement `src/lib/crypto/vault.ts` (PBKDF2 600k iterations + AES-256-GCM DEK wrapping).
2. Build `VaultLockGuard.tsx` and the header "Lock in Vault" toggle.

* **Verification Gate 4:** Lock a page -> inspect `public.documents` in Supabase SQL Editor and verify `content_json`, `plain_text`, and `yjs_state` are `NULL` while `encrypted_payload` contains valid AES-GCM ciphertext that decrypts cleanly in the browser.

### Phase 5: Structured Notion Databases (Table, Kanban, Calendar, Gallery, Relations & Rollups)

1. Build `DatabaseContainer.tsx` and schema management actions (`database.actions.ts`).
2. Implement `TableView.tsx` (`@tanstack/react-table` with inline cell editors for all 12 property types), `KanbanView.tsx` (grouped by `select`/`status`), `CalendarView.tsx` (mapped to `date` properties), and `GalleryView.tsx`.
3. Implement `Relation` picker (linking rows across databases) and `Rollup` evaluator (computing `count`, `sum`, `average`, `percent_checked` across related rows), plus compound `FilterSortBar.tsx`.

* **Verification Gate 5:** Create a "Projects" database and a "Tasks" database, link them via a `Relation` property, add a `Rollup` showing task completion percentage, and switch seamlessly between Table, Kanban, Calendar, and Gallery views.

### Phase 6: Security Hardening, Audit Logs & Production Build Verification

1. Wire `security_audit_logs` into all Auth, Admin, and Vault actions and expose the viewer in `/settings/security`.
2. Add `/api/cron/keep-alive/route.ts` and `vercel.json`.
3. Run `tsc --noEmit`, `next lint`, and `next build` and resolve all type or bundler errors before completion.

## 10. PHASE 2 FUTURE SECURITY UPLIFT BLUEPRINT (MFA & PASSKEYS)

*(Architected for non-breaking drop-in implementation when ready)*

1. **TOTP Multi-Factor Authentication (AAL2 Enforcement):**
* Enroll via `supabase.auth.mfa.enroll({ factorType: 'totp' })` inside `/settings/security` and verify via `mfa.challengeAndVerify()`.
* **Database RLS Upgrade:** Add an optional RLS policy modifier `AND (auth.jwt() ->> 'aal') = 'aal2'` on `public.allowed_users` (Admin mutations) or `is_vault_encrypted = true` rows so accessing sensitive pages requires an active MFA-verified session.


2. **WebAuthn Passkeys with PRF Extension for Zero-Prompt Vault Unlock:**
* Enable WebAuthn Passkey enrollment using the **WebAuthn `prf` (Pseudo-Random Function) extension**.
* Instead of typing a Vault passphrase, evaluating the hardware Passkey (TouchID / FaceID / Windows Hello / YubiKey) outputs a deterministic 32-byte hardware secret directly into Web Crypto (`HKDF` -> `AES-256-GCM` KEK), allowing biometric one-tap unlocking of client-side encrypted Vault pages.



```