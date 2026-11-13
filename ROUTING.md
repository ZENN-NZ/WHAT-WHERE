# WHAT-WHERE — Workflow Routing (Layer 1)

This project executes across **6 sequential, verification-gated ICM stages** mirroring Section 9 of `ARCHITECTURE.md`.

| Stage | Folder | Responsibility | Key Outputs (`output/` + Repo) | Status |
| :--- | :--- | :--- | :--- | :--- |
| 01 | `01_foundation_auth` | Next.js 15+ scaffold, 4 Supabase SQL migrations, Supabase/Resend clients, middleware, invite-only 6-digit OTP `/login`, `/settings/members` admin UI | `01_foundation_auth/output/stage_report.md`, `supabase/migrations/*`, `src/lib/*`, `src/actions/{auth,admin}.actions.ts`, `/login`, `/settings/members` | Done |
| 02 | `02_workspace_navigation` | Workspace shell, resizable collapsible `SidebarTree` with `@dnd-kit` nesting & fractional ordering, `Cmd+K` FTS search modal, `/trash` recovery & purge | `02_workspace_navigation/output/stage_report.md`, `src/app/(workspace)/*`, `src/components/navigation/*`, `src/actions/document.actions.ts` | Done |
| 03 | `03_collaborative_editor` | `SupabaseYjsProvider` (Broadcast + Presence + IndexedDB), dynamic client-only `CollaborativeEditor` (BlockNote), `@page` mentions, private Storage uploads, backlinks, comments, version history | `03_collaborative_editor/output/stage_report.md`, `src/lib/yjs/*`, `src/components/editor/*`, `src/components/navigation/BacklinksPanel.tsx` | Done |
| 04 | `04_zero_knowledge_vault` | Web Crypto `PBKDF2` (600k) + `AES-256-GCM` DEK wrapping (`vault.ts`), `VaultLockGuard`, Vault passphrase setup & lock/unlock page toggle | `04_zero_knowledge_vault/output/stage_report.md`, `src/lib/crypto/vault.ts`, `src/components/editor/VaultLockGuard.tsx` | Done |
| 05 | `05_structured_databases` | Relational Notion databases (`database.actions.ts`), `DatabaseContainer`, `TableView`, `KanbanView`, `CalendarView`, `GalleryView`, `Relation` picker, `Rollup` evaluator, `FilterSortBar` | `05_structured_databases/output/stage_report.md`, `src/actions/database.actions.ts`, `src/components/database/*` | Pending |
| 06 | `06_security_production` | Security audit log wiring + `/settings/security` viewer, `/api/cron/keep-alive`, `vercel.json`, TypeScript, ESLint, unit tests, and Next.js production build verification | `06_security_production/output/stage_report.md`, `src/app/(workspace)/settings/security/page.tsx`, `src/app/api/cron/keep-alive/route.ts`, `vercel.json` | Pending |

## Execution Protocol
1. Read `WORKSPACE.md`, `ROUTING.md`, and the target stage's `CONTEXT.md`.
2. Load only the files listed in the stage's `## Inputs` table.
3. Implement deliverables in the repo and write the stage verification artifact to `<stage>/output/stage_report.md`.
4. Commit the stage cleanly to git with verification results before advancing to the next stage.
