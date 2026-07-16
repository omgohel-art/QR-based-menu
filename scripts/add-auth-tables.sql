-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS restaurants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO restaurants (name, slug) VALUES ('MAMA Cafe', 'mama-cafe')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id INTEGER REFERENCES restaurants(id),
  role VARCHAR(50) DEFAULT 'admin' NOT NULL,
  must_change_password BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own profile') THEN
    CREATE POLICY "Users can read own profile"
      ON user_profiles FOR SELECT
      USING (auth.uid() = auth_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile"
      ON user_profiles FOR UPDATE
      USING (auth.uid() = auth_user_id);
  END IF;
END $$;
