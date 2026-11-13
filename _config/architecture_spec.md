# Architecture Specification (Layer 3 Reference)

Derived from `ARCHITECTURE.md` Sections 2, 3, 9, and 10.

## Tech Stack
- **Framework:** Next.js 15+ (App Router, TypeScript 5.x Strict Mode, React 19)
- **Styling:** Tailwind CSS v4, `shadcn/ui`-style Radix primitives, `lucide-react`, `cmdk`, `@dnd-kit/core`, `@dnd-kit/sortable`
- **Editor & CRDT:** `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`, `yjs`, `y-indexeddb`, `y-protocols`
- **Databases:** `@tanstack/react-table`, `date-fns` / custom calendar grid
- **Backend:** `@supabase/supabase-js`, `@supabase/ssr`
- **Email & Validation:** `resend`, `@react-email/components`, `zod`, `react-hook-form`, `@hookform/resolvers`

## Key Architectural Patterns
1. **Route Groups:**
   - `(auth)` -> `/login`, `/auth/callback`
   - `(workspace)` -> `/` (redirect), `/[documentId]`, `/trash`, `/settings/members`, `/settings/security`
   - `api/cron/keep-alive` -> Vercel Cron keep-alive endpoint
2. **Fractional Tree Positioning:**
   - `documents.position` is `DOUBLE PRECISION` (default `1000`). Reordering computes midpoint between siblings (or rebalances if gap < `1e-6`).
3. **Each Database Row is a Document:**
   - Rows in a database are `public.documents` with `parent_id = database_document_id`, allowing every row to open as a full rich-text Notion page with comments, backlinks, and version history.
4. **Future Phase 2 Uplift Hooks:**
   - `/settings/security` includes an explicit TOTP MFA (`aal2`) & WebAuthn Passkey (`prf` extension) readiness section without breaking current OTP + passphrase flows.
