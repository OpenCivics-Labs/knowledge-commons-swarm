-- Stewards (admins who review applications) and their votes.
-- 2-of-3 voting model: 2 yes -> approved, 2 no -> rejected.
--
-- Stewards are looked up by email (not user_id) so we can pre-seed the table
-- before any of them have logged in. The first time a steward signs in via
-- magic link, their auth.users.email matches the seeded row.

CREATE TABLE stewards (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID,                              -- backfilled on first login (optional)
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE application_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  voter_email TEXT NOT NULL REFERENCES stewards(email),
  vote TEXT NOT NULL CHECK (vote IN ('yes', 'no')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (application_id, voter_email)
);

CREATE INDEX idx_votes_application ON application_votes(application_id);

ALTER TABLE stewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read stewards" ON stewards
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service manage stewards" ON stewards
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated read votes" ON application_votes
  FOR SELECT USING (auth.role() = 'authenticated');

-- Inserts happen via the vote-application edge function with the service role,
-- which bypasses RLS — no INSERT policy needed for clients.
