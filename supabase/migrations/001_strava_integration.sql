-- Create athlete_integrations table for OAuth tokens and provider data
CREATE TABLE athlete_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_athlete_id bigint NOT NULL,
  provider_username text,
  provider_firstname text,
  provider_lastname text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scopes text[] DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT provider_must_be_strava CHECK (provider = 'strava'),
  UNIQUE(user_id, provider),
  UNIQUE(provider, provider_athlete_id)
);

-- Create athlete_activities table for synced activity data
CREATE TABLE athlete_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_activity_id bigint NOT NULL,
  name text,
  activity_type text,
  sport_type text,
  start_time timestamptz NOT NULL,
  timezone text,
  distance_m numeric,
  moving_time_seconds integer,
  elapsed_time_seconds integer,
  total_elevation_gain_m numeric,
  average_speed_mps numeric,
  max_speed_mps numeric,
  average_heartrate numeric,
  max_heartrate numeric,
  kudos_count integer,
  raw_data jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT provider_must_be_strava CHECK (provider = 'strava'),
  UNIQUE(provider, provider_activity_id)
);

-- Create indexes for better query performance
CREATE INDEX athlete_activities_user_start_idx ON athlete_activities(user_id, start_time DESC);
CREATE INDEX athlete_integrations_user_provider_idx ON athlete_integrations(user_id, provider);

-- Enable RLS on both tables
ALTER TABLE athlete_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_activities ENABLE ROW LEVEL SECURITY;

-- RLS policies for athlete_integrations
CREATE POLICY "Users can view their own integrations" ON athlete_integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert integrations" ON athlete_integrations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update integrations" ON athlete_integrations
  FOR UPDATE USING (true);

-- RLS policies for athlete_activities
CREATE POLICY "Users can view their own activities" ON athlete_activities
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert activities" ON athlete_activities
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update activities" ON athlete_activities
  FOR UPDATE USING (true);

-- Create trigger function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER athlete_integrations_updated_at BEFORE UPDATE ON athlete_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER athlete_activities_updated_at BEFORE UPDATE ON athlete_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
