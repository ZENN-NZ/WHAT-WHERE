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
