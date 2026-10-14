CREATE TABLE IF NOT EXISTS guild_state (
  id integer PRIMARY KEY CHECK(id=1),
  revision integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS guild_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  display_name text NOT NULL,
  token_data text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  membership_checked_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS guild_sessions_expiry ON guild_sessions(expires_at);
CREATE TABLE IF NOT EXISTS guild_oauth_states (
  id text PRIMARY KEY,
  return_to text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS guild_images (
  id uuid PRIMARY KEY,
  digest text UNIQUE NOT NULL,
  content_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
