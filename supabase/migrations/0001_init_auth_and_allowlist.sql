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

-- 4. Security Definer Helper Predicates (Used by all RLS policies)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users au
    WHERE au.email = lower(auth.jwt() ->> 'email')
      AND au.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users au
    WHERE au.email = lower(auth.jwt() ->> 'email')
      AND au.status = 'active'
      AND au.role = 'admin'
  );
$$;

-- 5. Supabase Auth "Before User Created" Hook
-- Blocks any direct API signup attempt if the email is not in public.allowed_users
CREATE OR REPLACE FUNCTION public.hook_restrict_signup_to_invited(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  incoming_email TEXT;
  user_status public.invite_status;
BEGIN
  incoming_email := lower(btrim(event->'user'->>'email'));
  SELECT status INTO user_status FROM public.allowed_users WHERE email = incoming_email;

  IF user_status IS NULL OR user_status = 'revoked' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Access restricted: This email has not been invited to this workspace.'
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hook_restrict_signup_to_invited TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_restrict_signup_to_invited FROM authenticated, anon, public;

-- 6. Trigger to auto-activate allowed_users and create profile upon first OTP verification
CREATE OR REPLACE FUNCTION public.handle_user_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.allowed_users
    SET status = 'active',
        accepted_at = COALESCE(accepted_at, now())
    WHERE email = lower(NEW.email)
      AND status = 'invited';

    INSERT INTO public.profiles (id, email, display_name)
    VALUES (NEW.id, lower(NEW.email), split_part(NEW.email, '@', 1))
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

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
