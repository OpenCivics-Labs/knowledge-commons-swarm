-- Profile photos for participant signups.
-- Adds an optional photo_url column to applications, a public storage bucket
-- the signup form can upload to with the anon key, and exposes the URL through
-- the public list_approved_members() RPC so the carousel can render avatars.

ALTER TABLE applications ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Public bucket: photos are meant to be displayed on the public homepage.
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Anyone can upload to this bucket (the public form does so with the anon key).
-- The signup flow uses random object names, so collisions are not a concern.
DROP POLICY IF EXISTS "Public upload profile photos" ON storage.objects;
CREATE POLICY "Public upload profile photos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "Public read profile photos" ON storage.objects;
CREATE POLICY "Public read profile photos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'profile-photos');

-- Extend the approved-members RPC to also return the photo URL.
-- Drop first because the return type is changing (PG won't allow CREATE OR REPLACE).
DROP FUNCTION IF EXISTS public.list_approved_members();
CREATE OR REPLACE FUNCTION public.list_approved_members()
RETURNS TABLE (name TEXT, photo_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name, photo_url
  FROM applications
  WHERE status = 'approved'
  ORDER BY created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_approved_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_approved_members() TO anon, authenticated;
