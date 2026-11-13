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
