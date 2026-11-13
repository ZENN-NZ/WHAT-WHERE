# Stage 01: Foundation, Database Migrations & Invite-Only Auth Gate

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 0 (Identity) | `../WORKSPACE.md` | Project identity and invariants |
| Layer 1 (Routing) | `../ROUTING.md` | Stage routing map |
| Layer 3 (Reference) | `../ARCHITECTURE.md` | Canonical schema, auth flow, and directory blueprint |
| Layer 3 (Reference) | `../_config/security_policy.md` | Invite-only gate, anti-enumeration, RLS, and secret rules |
| Layer 3 (Reference) | `../_config/architecture_spec.md` | Tech stack and structural conventions |

## Process
1. Scaffold Next.js 15+ App Router project with TypeScript strict mode, Tailwind CSS v4, and UI primitives (`src/components/ui/*`).
2. Create all 4 Supabase SQL migrations (`0001_init_auth_and_allowlist.sql` .. `0004_storage_and_audit_logs.sql`) and `supabase/config.toml`.
3. Implement Supabase clients (`src/lib/supabase/client.ts`, `server.ts`, `admin.ts`), `src/middleware.ts`, and Resend email client + React Email templates (`src/lib/resend/client.ts`).
4. Implement `src/actions/auth.actions.ts` (seed admin bootstrap, Postgres token-bucket rate limiter, anti-enumeration OTP request, OTP verify, sign out) and `/login` + `/auth/callback`.
5. Implement `src/actions/admin.actions.ts` and `/settings/members` Admin UI for inviting users via Resend and revoking users + killing sessions globally.

## Outputs
- `output/stage_report.md`: Implemented file inventory, TypeScript/build check results, and Verification Gate 1 checklist.
- Application files at repo root (`package.json`, `supabase/migrations/*`, `src/lib/*`, `src/actions/{auth,admin}.actions.ts`, `src/app/(auth)/*`, `src/app/(workspace)/settings/members/page.tsx`, `src/middleware.ts`).
- Review Gate: `tsc --noEmit` passes; uninvited email OTP attempt never invokes `signInWithOtp` and returns anti-enumeration response; `allowed_users` & RLS predicates match `ARCHITECTURE.md`.
