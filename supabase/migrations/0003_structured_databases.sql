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
