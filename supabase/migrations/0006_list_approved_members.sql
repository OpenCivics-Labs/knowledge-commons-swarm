-- Public read-only access to approved member names for the homepage carousel.
-- Returns only the name (no email / role / interest / url) so PII stays protected.
-- SECURITY DEFINER bypasses the applications RLS policies, but the function body
-- restricts the output to status='approved' rows and the name column only.

CREATE OR REPLACE FUNCTION public.list_approved_members()
RETURNS TABLE (name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name
  FROM applications
  WHERE status = 'approved'
  ORDER BY created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_approved_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_approved_members() TO anon, authenticated;
