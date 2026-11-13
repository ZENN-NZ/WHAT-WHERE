# Stage 05: Structured Notion Databases (Table, Kanban, Calendar, Gallery, Relations & Rollups)

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 0 (Identity) | `../WORKSPACE.md` | Project identity |
| Layer 3 (Reference) | `../ARCHITECTURE.md` | Section 4.3 schema & Phase 5 specs |
| Layer 3 (Reference) | `../_config/data_schema.json` | 12 property types, 4 view types, rollup aggregations |
| Layer 4 (Working) | `../04_zero_knowledge_vault/output/stage_report.md` | Workspace page container & document actions |

## Process
1. Implement `src/actions/database.actions.ts` for creating structured databases, managing properties (`database_properties`), managing views (`database_views`), creating row documents (`parent_id = database_document_id`), updating cell values (`database_cell_values`), managing relational links (`database_relations`), and computing Rollups.
2. Build `src/components/database/DatabaseContainer.tsx` (view tabs, view creation, property & filter/sort state) and `PropertyHeaderMenu.tsx` + `FilterSortBar.tsx`.
3. Implement all 4 views in `src/components/database/views/`:
   - `TableView.tsx` (`@tanstack/react-table` with inline cell editors for all 12 property types including Relation picker & Rollup display)
   - `KanbanView.tsx` (`@dnd-kit` cards grouped by `select`/`status` with drag-between-columns status update)
   - `CalendarView.tsx` (month grid mapped to `date` property with quick row creation)
   - `GalleryView.tsx` (responsive card grid with cover preview and selected properties)

## Outputs
- `output/stage_report.md`: Implemented file inventory, rollup/filter evaluator test results, and Verification Gate 5 checklist.
- Application files (`src/actions/database.actions.ts`, `src/components/database/*`).
- Review Gate: All 12 property types, 4 views, Relation linking, Rollup evaluation, and compound Filter/Sort operate seamlessly and typecheck cleanly.
