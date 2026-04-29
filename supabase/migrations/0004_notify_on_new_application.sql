-- DB trigger: when a new application is inserted, fire the notify-application
-- edge function (sends Resend confirmation to applicant + Resend digest to
-- team@opencivics.co). The trigger uses pg_net.
--
-- The edge function URL and service_role key are stored in Supabase Vault so
-- the secrets aren't visible in the trigger's source code. Set them post-deploy:
--   SELECT vault.create_secret('<full-edge-url>', 'edge_url');
--   SELECT vault.create_secret('<service-role-key>', 'service_role_key');

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_application_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_url TEXT;
  service_key TEXT;
BEGIN
  SELECT decrypted_secret INTO edge_url    FROM vault.decrypted_secrets WHERE name = 'edge_url';
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF edge_url IS NULL OR service_key IS NULL THEN
    RAISE NOTICE 'notify trigger: edge_url or service_role_key not in vault; skipping';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_notify_after_insert ON applications;
CREATE TRIGGER applications_notify_after_insert
  AFTER INSERT ON applications
  FOR EACH ROW
  EXECUTE FUNCTION notify_application_inserted();
