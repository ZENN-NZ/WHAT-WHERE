# Stage 02: Workspace Shell, Recursive Sidebar Tree & Command-K Search

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 0 (Identity) | `../WORKSPACE.md` | Project identity |
| Layer 3 (Reference) | `../ARCHITECTURE.md` | Workspace routes, sidebar, Cmd+K search, and trash specs |
| Layer 3 (Reference) | `../_config/architecture_spec.md` | Fractional positioning & route group conventions |
| Layer 4 (Working) | `../01_foundation_auth/output/stage_report.md` | Stage 01 auth, Supabase clients, and UI primitives |

## Process
1. Implement `src/actions/document.actions.ts` for tree CRUD, fractional `position` reordering/reparenting (preventing circular ancestry), full-text search (`websearch_to_tsquery`), soft-delete (`is_archived = true`), restoration, and permanent deletion.
2. Build `(workspace)/layout.tsx` with resizable collapsible sidebar, topbar breadcrumbs, user menu, and Vault context provider mount.
3. Build `src/components/navigation/SidebarTree.tsx` with `@dnd-kit` drag-and-drop reordering/nesting and unlimited nested page creation.
4. Build `src/components/navigation/CommandSearchModal.tsx` (`Cmd+K` / `Ctrl+K`) querying PostgreSQL FTS + client-side decrypted Vault titles when unlocked.
5. Implement `(workspace)/page.tsx` default redirect, `(workspace)/[documentId]/page.tsx` shell, and `(workspace)/trash/page.tsx` recovery/purge UI.

## Outputs
- `output/stage_report.md`: Implemented file inventory and Verification Gate 2 checklist.
- Application files (`src/actions/document.actions.ts`, `src/app/(workspace)/*`, `src/components/navigation/*`).
- Review Gate: Nested pages 4+ levels deep render, drag-and-drop updates fractional `position` & `parent_id`, `Cmd+K` search returns ranked FTS results, and Trash restores/purges cleanly.
