-- Knowledge Commoning Swarm: applications
-- Stores participant signups submitted via the website form.

CREATE TABLE applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Form fields (mirror the modal in index.html)
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  interest TEXT,
  url TEXT,
  subscribe_opencivics BOOLEAN DEFAULT false,

  -- Admin metadata
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT
);

CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_created ON applications(created_at DESC);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Anyone can submit an application (the public form posts here with the anon key).
CREATE POLICY "Public insert" ON applications
  FOR INSERT WITH CHECK (true);

-- Authenticated stewards (verified inside edge functions) read via service role,
-- but this lets a steward dashboard read with their own JWT too.
CREATE POLICY "Authenticated select" ON applications
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated update" ON applications
  FOR UPDATE USING (auth.role() = 'authenticated');
