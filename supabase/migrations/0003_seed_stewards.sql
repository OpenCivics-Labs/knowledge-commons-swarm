-- Pre-seed the three stewards. user_id stays NULL until each steward first
-- signs in; the dashboard checks by email, so this works immediately.

INSERT INTO stewards (email, name) VALUES
  ('benjamin@opencivics.co', 'Benjamin Life'),
  ('spencer@opencivics.co',  'Spencer Cavanaugh'),
  ('patricia@opencivics.co', 'Patricia Parkinson')
ON CONFLICT (email) DO NOTHING;
