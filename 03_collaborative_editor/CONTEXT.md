# Stage 03: Collaborative BlockNote Editor, Yjs Realtime & Backlinks

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 0 (Identity) | `../WORKSPACE.md` | Project identity |
| Layer 3 (Reference) | `../ARCHITECTURE.md` | Yjs provider, BlockNote editor, Storage uploads, Backlinks, Comments, Versions |
| Layer 4 (Working) | `../02_workspace_navigation/output/stage_report.md` | Document actions and workspace layout |

## Process
1. Build `src/lib/yjs/SupabaseYjsProvider.ts` bridging `Y.Doc` + `y-indexeddb` with Supabase Realtime Broadcast (state vectors & incremental updates) and Presence (live cursor/user awareness).
2. Implement `src/components/editor/CollaborativeEditor.tsx` (loaded via `next/dynamic` `{ ssr: false }`), custom `@page` mention inline content item, slash commands, and Private Storage (`workspace-assets`) upload handler via signed URLs.
3. Wire automatic bi-directional backlink extraction on document save (`document_backlinks`) and render `src/components/navigation/BacklinksPanel.tsx`.
4. Implement block-anchored `src/components/editor/CommentsSidebar.tsx` and point-in-time `src/components/editor/VersionHistoryDrawer.tsx` with snapshot diff/restore.

## Outputs
- `output/stage_report.md`: Implemented file inventory and Verification Gate 3 checklist.
- Application files (`src/lib/yjs/SupabaseYjsProvider.ts`, `src/components/editor/*`, `src/components/navigation/BacklinksPanel.tsx`).
- Review Gate: Dynamic client-only editor builds cleanly without SSR errors; Yjs sync + IndexedDB offline persistence + signed-URL uploads + backlinks + comments + version snapshots all typecheck and wire cleanly.
